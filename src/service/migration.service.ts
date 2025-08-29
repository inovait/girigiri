import { ConfigManager } from "../manager/config.manager.ts";
import logger from "../logging/logger.ts";
import { DatabaseManager } from "../manager/database.manager.ts";
import type { Connection } from 'mysql2/promise';
import type { MigrationRow } from "../interface/migration.row.interface.ts";
import { FileManager } from "../manager/file.manager.ts";
import path from "path";
import { SchemaDumpService } from "./schema-dump.service.ts";
import type { Config } from "interface/config.interface.ts";
import type { FileConfig } from "interface/file-config.interface.ts";
import type { DatabaseConfig } from "interface/database-config.interface.ts";
import { runCommand } from "../utils.ts";
import { DOCKER_DOWN_COMMAND, DOCKER_UP_COMMAND, MIGRATION_HISTORY_TABLE, TEMP_PREFIX } from "../constants/constants.ts";
import { ERROR_MESSAGES } from "../constants/error-messages.ts";
import { getPaths } from "../utils.ts";

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
        let config = this.config;

        try {
            // connects to the main database
            mainConnection = await this.databaseManager.connect(config.mainDatabaseConfig);
            let migHistoryExists: boolean = await this.checkMigrationHistoryExists(mainConnection);

            // checks if migration history table exists on main database nad dumps it with data
            const migrationHistoryDumpPath = await this.handleMigrationHistory(mainConnection, config);

            // if the migration history exists on the main database, it retrieves the applied and unapplied migrations
            let migrationResult;
            if (migHistoryExists) {
                migrationResult = await this.getUnappliedAndAppliedMigrations(mainConnection);
                // if there are no unapplied migrations, the flow ends
                if (migrationResult.unappliedMigrations.size < 0) {
                    logger.info("No unapplied migrations. Exiting")
                    return
                }
            }

            logger.info("Unapplied migrations found. Setting up temporary database...");
            logger.info('Winding up docker service')
            await runCommand(DOCKER_UP_COMMAND)
            // dumps the whole main database WITHOUT data
            const schemaDumpPath = await this.dumpSchema(config.mainDatabaseConfig, config.fileConfig)
            // sets up a temp database
            await this.setupTemporaryDatabase(schemaDumpPath, migrationHistoryDumpPath);

            // connects to the temp database
            tempConnection = await this.databaseManager.connect(config.migrationDatabaseConfig);
            // triggers the migration on the temp database
            await this.migrate(tempConnection, config.migrationDatabaseConfig, config.fileConfig);
            // dumps the tmp database schema
            await this.dumpSchemaTableByTable(config.migrationDatabaseConfig, config.fileConfig);
            logger.info('Check migrations completed successfully');

        } catch (error) {
            logger.error(ERROR_MESSAGES.MIGRATION.VALIDATION, error);
            throw error;
        } finally {
            //await this.dumpSchemaByTable(config.migrationDatabaseConfig, config.fileConfig)
            await this.cleanup(/*tempConnection, this.config.migrationDatabaseConfig*/);
        }
    }

    /**
     * Handles migration history table existence and dumping
     */
    private async handleMigrationHistory(connection: Connection, config: Config): Promise<string | undefined> {
        // check if mig history table exists
        const hasMigrationHistory = await this.databaseManager.tableExists(
            connection,
            MIGRATION_HISTORY_TABLE
        );

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

        await this.createTemporaryDatabase(this.config.migrationDatabaseConfig);

        logger.info('Restoring main schema to temporary database...');
        await this.executeSqlCommand(this.config.migrationDatabaseConfig, schemaPath);

        logger.info("Initializing migration history table");
        const initMigrationsPath = path.join(this.__dirname, '..', '..', 'database/init_migrations.sql');
        await this.executeSqlCommand(this.config.migrationDatabaseConfig, initMigrationsPath);

        if (migrationHistoryPath) {
            await this.restoreMigrationHistoryData(this.config.migrationDatabaseConfig, migrationHistoryPath);
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
        } catch (error) {
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

        } catch (error) {
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
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            await connection.end();
        }
    }

    /**
     * Extracts INSERT statements from SQL dump, ignoring DDL statements
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
            await runCommand(cmd, databaseConfig.password);
            logger.info('SQL file executed successfully');
        } catch (error) {
            logger.error(ERROR_MESSAGES.MIGRATION.EXECUTE_SQL(file), error);
            throw error;
        }
    }


    private async dumpSchema(databaseConfig: DatabaseConfig, fileConfig: FileConfig): Promise<string> {
        logger.info('Creating schema dump...');
        const schemaDumpService = new SchemaDumpService(this.databaseManager);
        const schemaDumpPath = await schemaDumpService.dumpSchemaBulk(databaseConfig, fileConfig);
        logger.info('Schema dump successfully completed');
        return schemaDumpPath;
    }

     private async dumpSchemaTableByTable(databaseConfig: DatabaseConfig, fileConfig: FileConfig): Promise<void> {
        logger.info('Creating schema dump...');
        const schemaDumpService = new SchemaDumpService(this.databaseManager);
        const schemaDumpPath = await schemaDumpService.dumpSchema(databaseConfig, fileConfig);
        logger.info('Schema dump successfully completed');
        //return schemaDumpPath;
    }

    /**
     * Cleans up temporary database and connections
     */
    private async cleanup(
        //connection: Connection | null,
        //databaseConfig: DatabaseConfig
    ): Promise<void> {
        //if (!connection) return;
        logger.info('Winding down docker service')
        await runCommand(DOCKER_DOWN_COMMAND)
        /*try {
            await this.databaseManager.dropDatabase(connection, databaseConfig.database);
        } catch (error) {
            logger.error(ERROR_MESSAGES.DATABASE.DROP, error);
        } finally {
            await connection.end();
        }*/
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
            let migHistory = await this.checkMigrationHistoryExists(connection)
            if (migHistory)
                await this.validateMigrationsTable(connection);

            logger.info("Migration history table validated");
            const { unappliedMigrations, appliedMigrations } = await this.getUnappliedAndAppliedMigrations(connection);

            if (appliedMigrations.size > 0) {
                appliedMigrations.forEach(migrationName => {
                    logger.info(`Skipping already applied migration file ${migrationName}`);
                })
            }

            await this.applyMigrations(connection, unappliedMigrations, fileConfig);
            
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
        } catch (error) {
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
        } catch (error) {
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
        const sql = FileManager.readFile(filePath);

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
}