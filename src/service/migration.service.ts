import { ConfigManager } from "../manager/config.manager.js";
import logger from "../logging/logger.js";
import { DatabaseManager } from "../manager/database.manager.js";
import type { Connection } from 'mysql2/promise';
import type { MigrationRow } from "../interface/migration.row.interface.js";
import { FileManager } from "../manager/file.manager.js";
import path from "path";
import { SchemaDumpService } from "./schema-dump.service.js";
import type { Config } from "../interface/config.interface.js";
import type { FileConfig } from "../interface/file-config.interface.js";
import type { DatabaseConfig } from "../interface/database-config.interface.js";
import { runMySqlCommand } from "../utils.js";
import { DOCKER_DOWN_COMMAND, DOCKER_UP_COMMAND, MAIN_DB_TMP, MIGRATION_HISTORY_TABLE } from "../constants/constants.js";
import { ERROR_MESSAGES } from "../constants/error-messages.js";
import { getPaths } from "../utils.js";
import { SchemaComparisonService, type SchemaComparison } from "./schema-comparison.service.js";


interface MigrationResult {
    unappliedMigrations: Set<string>;
    appliedMigrations: Set<string>;
}

export class MigrationService {
    private readonly configManager: ConfigManager;
    private readonly databaseManager: DatabaseManager;
    private readonly config: Config;
    private readonly __dirname: string;

    constructor(configManager: ConfigManager, databaseManager: DatabaseManager) {
        this.configManager = configManager;
        this.databaseManager = databaseManager;
        this.config = this.configManager.getConfig();
        const { __dirname } = getPaths(import.meta.url);
        this.__dirname = __dirname;
    }

    /**
     * Validates if migrations succeed on a temporary database
     * Creates temp database, restores schema, runs migrations, dumps result, cleans up
     */
    async checkMigrations(): Promise<void> {
        let mainConnection: Connection | null = null;
        let tempConnection: Connection | null = null;
        let schemaDumpPath: string | null = null; 
        // SoT
        let mainDatabaseConfig: DatabaseConfig = this.config.mainDatabaseConfig;
        // tmp
        let tempDatabaseConfig: DatabaseConfig = this.config.tempDatabaseConfig;
        
        // SoT
        const snapshotDir = path.join(this.__dirname, '..', '..', this.config.fileConfig.snapshotDir);       
        const sourceControlSchemaConfig: FileConfig = {...this.config.fileConfig, snapshotDir: snapshotDir};
        
        // tmp
        const tempSchemaDir = path.join(this.__dirname, '..', '..', 'tmp', `schema-run-${Date.now()}`);
        const tempSchemaConfig: FileConfig = { ...this.config.fileConfig,schemaOutputDir: tempSchemaDir};
        
        const composeFile = path.join(this.__dirname, '..', '..', 'docker-compose.yml')
        const envFile = path.join(this.__dirname, '..', '..', '.env')

        try {
            // connects to the main database
            mainConnection = await this.databaseManager.connect(mainDatabaseConfig);
            let migHistoryExists: boolean = await this.checkMigrationHistoryExists(mainConnection);

            // checks if migration history table exists on main database nad dumps it with data
            const migrationHistoryDumpPath = await this.handleMigrationHistory(mainConnection, this.config, migHistoryExists);

            // if the migration history exists on the main database, it retrieves the applied and unapplied migrations
            let migrationResult;
            if (migHistoryExists) {
                // crosschecks migration history with migration files
                migrationResult = await this.getUnappliedAndAppliedMigrations(mainConnection);
                // if there are no unapplied migrations, the flow ends
                if (migrationResult.unappliedMigrations.size <= 0) {
                    logger.info("No unapplied migrations. Exiting")
                    return
                }
            }

            logger.info("Unapplied migrations found. Setting up temporary database...");
            logger.info('Winding up docker service')
            await runMySqlCommand(DOCKER_UP_COMMAND(composeFile, envFile))

            // dumps the whole main database WITHOUT data
            schemaDumpPath = await this.dumpSchema(mainDatabaseConfig, sourceControlSchemaConfig, MAIN_DB_TMP)
            // sets up a temp database
            await this.setupTemporaryDatabase(schemaDumpPath, migrationHistoryDumpPath);
            // connects to the temp database
            tempConnection = await this.databaseManager.connect(tempDatabaseConfig);
            // triggers the migration on the temp database
            await this.migrate(tempConnection, tempDatabaseConfig, tempSchemaConfig);
            // dumps the tmp database schema
            logger.info(`Dumping temporary database schema to ${tempSchemaDir}`);
            await this.dumpSchema(tempDatabaseConfig, tempSchemaConfig, "temp_db")
            // compares the main and temp database schema
            await this.compareSchemas(sourceControlSchemaConfig.snapshotDir, tempSchemaConfig.schemaOutputDir)
            logger.info('Check migrations completed successfully');
        } catch (error: any) {
            logger.error(ERROR_MESSAGES.MIGRATION.VALIDATION, error);
            throw error;
        } finally {
            await this.cleanup(mainConnection!, tempSchemaDir, schemaDumpPath!, composeFile, envFile);
        }
    }

    /**
     * Checks if migration history table exists and dumps if exists on the main database
     */
    private async handleMigrationHistory(connection: Connection, config: Config, migHistoryExists?: boolean): Promise<string | undefined> {
        const hasMigrationHistory =
            migHistoryExists !== undefined
            ? migHistoryExists
            : await this.databaseManager.tableExists(connection, MIGRATION_HISTORY_TABLE);


        if (!hasMigrationHistory) {
            logger.info('No migration history found. Will generate migration_history table on restore');
            return undefined;
        }

        logger.info('Migration history table found. Dumping migration_history data');
        const schemaDumpService = new SchemaDumpService(this.databaseManager);
        const dumpPath = await schemaDumpService.dumpTable(
            MIGRATION_HISTORY_TABLE,
            config.mainDatabaseConfig,
            config.fileConfig
        );
        logger.info('Successfully dumped migration history');
        return dumpPath;
    }

    /**
     * Sets up temporary database with schema and migration history
     */
    private async setupTemporaryDatabase(
        schemaPath: string,
        migrationHistoryPath?: string
    ): Promise<void> {
        logger.info('Setting up temporary database...');

        await this.createTemporaryDatabase(this.config.tempDatabaseConfig);

        logger.info('Restoring main schema to temporary database...');
        await this.executeSqlCommand(this.config.tempDatabaseConfig, schemaPath);

        logger.info("Initializing migration history table");
        const initMigrationsPath = path.join(this.__dirname, '..', '..', 'database/init_migrations.sql');
        await this.executeSqlCommand(this.config.tempDatabaseConfig, initMigrationsPath);

        if (migrationHistoryPath) {
            await this.restoreMigrationHistoryData(this.config.tempDatabaseConfig, migrationHistoryPath);
        }

        logger.info("Temporary database setup completed");
    }

    /**
     * Creates a temporary database
     */
    private async createTemporaryDatabase(databaseConfig: DatabaseConfig): Promise<void> {
        const serverConfig = { ...databaseConfig };
        delete serverConfig.database;

        const connection = await this.databaseManager.connect(serverConfig);
        try {
            logger.info(`Creating temporary database: ${databaseConfig.database}`);
            await this.databaseManager.createDatabase(connection, databaseConfig.database!);
        } catch (error: any) {
            logger.error(ERROR_MESSAGES.DATABASE.CREATE, error);
            throw error;
        } finally {
            await connection.end();
        }
    }

    /**
     * Restores migration history data (INSERT statements only)
     */
    private async restoreMigrationHistoryData(
        databaseConfig: DatabaseConfig,
        migHistoryFile: string
    ): Promise<void> {
        try {
            const sqlContent = FileManager.readFile(migHistoryFile);
            const insertStatements = this.extractInsertStatements(sqlContent);

            if (insertStatements.length === 0) {
                logger.info('No migration history data to restore');
                return;
            }

            await this.executeInsertStatements(databaseConfig, insertStatements);
            logger.info(`Restored ${insertStatements.length} migration history records`);

        } catch (error: any) {
            logger.error(ERROR_MESSAGES.MIGRATION.RESTORE_HISTORY, error);
            throw error;
        }
    }

    /**
     * Executes INSERT statements in a transaction
     */
    private async executeInsertStatements(
        databaseConfig: DatabaseConfig,
        insertStatements: string[]
    ): Promise<void> {
        const connection = await this.databaseManager.connect(databaseConfig);
        try {
            await connection.beginTransaction();

            for (const insertStatement of insertStatements) {
                await connection.query(insertStatement);
            }

            await connection.commit();
        } catch (error: any) {
            await connection.rollback();
            throw error;
        } finally {
            await connection.end();
        }
    }

    /**
     * Extracts INSERT statements from SQL dump
     */
    private extractInsertStatements(sqlContent: string): string[] {
        const lines = sqlContent.split('\n');
        const insertStatements: string[] = [];
        const skipPatterns = ['--', '/*', 'DROP', 'CREATE', 'ALTER', 'LOCK', 'UNLOCK'];

        for (const line of lines) {
            const trimmedLine = line.trim();

            if (!trimmedLine || this.shouldSkipLine(trimmedLine, skipPatterns)) {
                continue;
            }

            if (trimmedLine.startsWith('INSERT')) {
                insertStatements.push(trimmedLine);
            }
        }

        return insertStatements;
    }

    /**
     * Checks if a line should be skipped during INSERT extraction
     */
    private shouldSkipLine(line: string, skipPatterns: string[]): boolean {
        return skipPatterns.some(pattern => line.startsWith(pattern));
    }

    /**
     * Executes SQL file against database using mysql command
     */
    private async executeSqlCommand(databaseConfig: DatabaseConfig, file: string): Promise<void> {
        const args = [
            `-u${databaseConfig.user}`,
            `-h${databaseConfig.host}`,
            `-P${databaseConfig.port}`,
            databaseConfig.database
        ];

        const mysqlCmd = `mysql ${args.join(' ')}`;
        const cmd = `${mysqlCmd} < ${file}`;

        try {
            logger.info(`Executing SQL file: ${file}`);
            await runMySqlCommand(cmd, databaseConfig.password);
            logger.info('SQL file executed successfully');
        } catch (error: any) {
            logger.error(ERROR_MESSAGES.MIGRATION.EXECUTE_SQL(file), error);
            throw error;
        }
    }

    /**
     * 
     */
    private async dumpSchema(databaseConfig: DatabaseConfig, fileConfig: FileConfig, dumpName: string): Promise<string> {
        logger.info('Creating schema dump...');
        const schemaDumpService = new SchemaDumpService(this.databaseManager);
        const schemaDumpPath = await schemaDumpService.mySqlDump(databaseConfig, fileConfig, dumpName);
        logger.info('Schema dump successfully completed');
        return schemaDumpPath;
    }

     private async dumpSchemaTableByTable(databaseConfig: DatabaseConfig, fileConfig: FileConfig): Promise<void> {
        logger.info(`Creating schema dump table-by-table in ${fileConfig.schemaOutputDir}`);
        const schemaDumpService = new SchemaDumpService(this.databaseManager);
        await schemaDumpService.dumpSchema(databaseConfig, fileConfig);
        logger.info('Schema dump successfully completed');
    }

    /**
     * Cleans up temporary database and connections/docker container
     */
    private async cleanup(connection: Connection,tempDirectoryPath: string, schemaDumpPath: string, composeFile: string, envFile: string): Promise<void> {
        connection.end()
        // remove temp db files
        try {
            if (FileManager.checkDirectory(tempDirectoryPath)) {
                logger.info(`Removing temporary directory: ${tempDirectoryPath}`);
                FileManager.removeDirectory(tempDirectoryPath)
                logger.info('Temporary directory removed.');
            }
        } catch (error: any) {
            logger.warn(`Could not remove temporary directory: ${tempDirectoryPath}`, error);
        }

         try {
            if (FileManager.checkDirectory(schemaDumpPath)) {
                logger.info(`Removing temporary directory: ${schemaDumpPath}`);
                FileManager.removeDirectory(schemaDumpPath)
                logger.info('Temporary directory removed.');
            }
        } catch (error: any) {
            logger.warn(`Could not remove temporary directory: ${schemaDumpPath}`, error);
        }

        try {
            logger.info('Winding down docker service...');
            await runMySqlCommand(DOCKER_DOWN_COMMAND(composeFile, envFile));
        } catch (error: any) {
            logger.error('Failed to wind down docker service.', error);
        }
    }

    /**
     * Runs migrations on the specified database
     */
    async migrate(
        connection: Connection,
        dbConfig: DatabaseConfig,
        fileConfig: FileConfig
    ): Promise<void> {
        try {
            // checks if the migration table exists
            await this.validateMigrationsTable(connection)
            
            const { unappliedMigrations, appliedMigrations } = await this.getUnappliedAndAppliedMigrations(connection);
            if (unappliedMigrations.size > 0) {
                appliedMigrations.forEach(migrationName => {
                    logger.info(`Skipping already applied migration file ${migrationName}`);
                })

                await this.applyMigrations(connection, unappliedMigrations, fileConfig);
            } else {
                logger.info('No outstanding migrations. Ending application')
            }
        } catch (error: any) {
            logger.error(ERROR_MESSAGES.MIGRATION.MIGRATE(error.message || error.toString()));
            throw error;
        }
    }

    /**
     * Applies all unapplied migrations
     */
    private async applyMigrations(
        connection: Connection,
        unappliedMigrations: Set<string>,
        fileConfig: FileConfig
    ): Promise<void> {
        for (const migrationFile of unappliedMigrations) {
            const filePath = path.join(fileConfig.migrationsDir, migrationFile);
            await this.applyMigration(connection, filePath, migrationFile);
        }
    }

    /**
     * Gets unapplied and applied migrations
     */
    private async getUnappliedAndAppliedMigrations(connection: Connection): Promise<MigrationResult> {
        const appliedMigrations = await this.getAppliedMigrations(connection);
        const appliedMigrationsSet = new Set<string>(appliedMigrations.map(m => m.name));

        const migrationFiles = this.getMigrationFiles();
        const unappliedMigrations = new Set<string>(
            migrationFiles.filter(file => !appliedMigrationsSet.has(file))
        );

        return {
            unappliedMigrations,
            appliedMigrations: appliedMigrationsSet
        };
    }

    private async checkMigrationHistoryExists(connection: Connection): Promise<boolean> {
        try {
            return await this.databaseManager.tableExists(connection, MIGRATION_HISTORY_TABLE);
        } catch (error: any) {
            logger.error(ERROR_MESSAGES.TABLE.EXISTS(MIGRATION_HISTORY_TABLE), error);
            throw error;
        }
    }


    /**
     * Gets all migration files from the migrations directory
     */
    private getMigrationFiles(): string[] {
        return FileManager
            .readDirectory(this.config.fileConfig.migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort();
    }

    /**
     * Gets applied migrations from migration history table
     */
    private async getAppliedMigrations(connection: Connection): Promise<MigrationRow[]> {
        try {
            const [rows] = await connection.execute<MigrationRow[]>(
                "SELECT * FROM migration_history ORDER BY id ASC"
            );
            return rows;
        } catch (error: any) {
            logger.error(ERROR_MESSAGES.MIGRATION.FETCH_APPLIED, error);
            throw error;
        }
    }

    /**
     * Applies a single migration file
     */
    private async applyMigration(
        connection: Connection,
        filePath: string,
        fileName: string
    ): Promise<void> {
        const sqlRaw = FileManager.readFile(filePath);
        const sql = this.databaseManager.preprocessSqlFile(sqlRaw)
        try {
            logger.info(`Applying migration: ${fileName}`);
            await connection.beginTransaction();

            await connection.query(sql);
            await connection.query(
                `INSERT INTO migration_history (name) VALUES (?)`,
                [fileName]
            );

            await connection.commit();
            logger.info(`Applied migration successfully: ${fileName}`);

        } catch (error: any) {
            logger.error(ERROR_MESSAGES.MIGRATION.FAILED_MIGRATION(fileName));

            try {
                await connection.rollback();
            } catch (rollbackError) {
                logger.error(ERROR_MESSAGES.MIGRATION.ROLLBACK, rollbackError);
                throw rollbackError;
            }

            logger.error(error.stack);
            throw error;
        }
    }

    /**
     * Validates/creates migrations table
     */
    private async validateMigrationsTable(connection: Connection): Promise<void> {
        logger.info('Validating migrations table');
        const initSqlPath = path.join(this.__dirname, '..', '..', 'database', 'init_migrations.sql');

        if (!FileManager.fileExists(initSqlPath)) {
            throw new Error(ERROR_MESSAGES.MIGRATION.INIT_FILE_MISSING(initSqlPath));
        }

        const createTableSql = FileManager.readFile(initSqlPath);
        await connection.execute(createTableSql);
    }

    /**
     *  Compare the main and temp schema and output a formatted result
     */
    private async compareSchemas(schemaSnapshot: string, tempSnapshot: string) {
        let snapshotExists = FileManager.checkDirectory(schemaSnapshot)
        let tempExists = FileManager.checkDirectory(tempSnapshot)
        
        if(!snapshotExists) {
            logger.error("No snapshot folder found. Exiting application")
            throw new Error(ERROR_MESSAGES.FILE.DIRECTORY(schemaSnapshot))
        }

        if(!tempExists) {
            logger.error("No temp folder found. Exiting application")
            throw new Error(ERROR_MESSAGES.FILE.DIRECTORY(tempSnapshot))
        }

        // check if the schemas match
        const scs = new SchemaComparisonService();
        const comparison: SchemaComparison = await scs.compareSchemasBash(schemaSnapshot, tempSnapshot);
        const formattedResult: string = scs.formatResult(comparison.isIdentical)
        logger.info(comparison.diff)
        if(!comparison.isIdentical) {
            logger.error(formattedResult)
            throw new Error(formattedResult)
        }
        
        logger.info(formattedResult)
    }
}