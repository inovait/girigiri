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
import { runCommand } from "../helpers.ts";
import { MIGRATION_HISTORY_TABLE, TEMP_PREFIX } from "../constants/constants.ts";
import { ERROR_MESSAGES } from "../constants/error-messages.ts";
import { getPaths } from "../utils.ts";

export class MigrationService {
    private configManager: ConfigManager
    private databaseManager: DatabaseManager 
    private config: Config;
    private __dirname: string;
   
    
    // Constants
    private static readonly MIGRATION_HISTORY_TABLE = MIGRATION_HISTORY_TABLE
    private static readonly TEMP_PREFIX = TEMP_PREFIX

    constructor(configManager: ConfigManager, databaseManager: DatabaseManager ) {
        this.databaseManager = databaseManager;    
        this.configManager = configManager;
        this.config = this.configManager.getConfig()
        const { __dirname } = getPaths(import.meta.url);
        this.__dirname = __dirname;
    }

    /**
     * Validate if migration succeeds on a temporary database
     * Creates temp databases, restores schema, runs migrations, dumps result, cleans up
     */
    async checkMigrations(): Promise<void> {   
        // create temporary configurations
        const tmpMainConfig = this.createTempDatabaseConfig(this.config.mainDatabaseConfig);
        const tmpMigConfig = this.createTempDatabaseConfig(this.config.migrationDatabaseConfig);
        const tmpFileConfig: FileConfig = {
            migrationsDir: 'src/tmp', 
            schemaOutputDir: 'src/tmp'
        };

        let tmpMainConnection: Connection | null = null;
        let tmpMigConnection: Connection | null = null;
        const tempFiles: string[] = [];

        try {
            logger.info('Starting migration validation...');
            
            // 1. Create schema dumps
            await this.createSchemaDumps(tmpFileConfig, tempFiles);
            
            // 2. Create and setup temporary databases
            await this.setupTemporaryDatabases(tmpMainConfig, tmpMigConfig, tmpFileConfig, tempFiles);
            
            // 3. Connect to temporary databases
            tmpMainConnection = await this.databaseManager.connect(tmpMainConfig);
            tmpMigConnection = await this.databaseManager.connect(tmpMigConfig);
            
            // 4. Run migrations on temporary databases
            logger.info('Running migrations on temporary database...');
            await this.migrate(tmpMainConnection, tmpMigConnection);
            
            // 5. Dump the migrated schema for comparison
            logger.info('Dumping migrated schema...');
            const schemaDumpService = new SchemaDumpService(this.configManager, this.databaseManager);
            await schemaDumpService.dumpSchemaBulk(tmpMainConfig, tmpFileConfig);
            tempFiles.push(`${tmpFileConfig.schemaOutputDir}/tmp_dump.sql`);
            
            logger.info('Migration validation completed successfully');
            
        } catch (error) {
            logger.error(ERROR_MESSAGES.MIGRATION.VALIDATION, error);
            throw error;
        } finally {
            // cleanup connections and resources
            await this.cleanup(tmpMainConnection, tmpMigConnection, tmpMainConfig, tmpMigConfig, tempFiles);
        }
    }

    /**
     * Create schema dumps from source databases
     */
    private async createSchemaDumps(tmpFileConfig: FileConfig, tempFiles: string[]): Promise<void> {
        logger.info('Creating schema dumps...');
        const schemaDumpService = new SchemaDumpService(this.configManager, this.databaseManager);
        
        // dump main schema (structure only, no data)
        await schemaDumpService.dumpSchemaBulk(this.config.mainDatabaseConfig, tmpFileConfig);
        tempFiles.push(`${tmpFileConfig.schemaOutputDir}/tmp_dump.sql`);
        
        // check and dump migration history if it exists
        const migHistoryExists = await this.checkMigrationHistoryExists();
        if (migHistoryExists) {
            logger.info('Dumping migration history with data...');
            await schemaDumpService.dumpTable(
                MigrationService.MIGRATION_HISTORY_TABLE, 
                this.config.migrationDatabaseConfig, 
                tmpFileConfig
            );
            tempFiles.push(`${tmpFileConfig.schemaOutputDir}/${MigrationService.MIGRATION_HISTORY_TABLE}.sql`);
        } else {
            logger.info('No migration history found - will start with empty migration table');
        }
    }

    /**
     * Setup temporary databases and restore schema/data
     */
    private async setupTemporaryDatabases(
        tmpMainConfig: DatabaseConfig, 
        tmpMigConfig: DatabaseConfig, 
        tmpFileConfig: FileConfig,
        tempFiles: string[]
    ): Promise<void> {
        logger.info('Setting up temporary databases...');
        
        const isSameDatabase = this.isSameDatabase(tmpMainConfig, tmpMigConfig);
        const migHistoryFile = `${tmpFileConfig.schemaOutputDir}/${MigrationService.MIGRATION_HISTORY_TABLE}.sql`;
        const hasMigrationHistoryFile = tempFiles.includes(migHistoryFile);
        
        // Create temporary main database
        await this.createTemporaryDatabase(tmpMainConfig);
        
        // Create temporary migration database only if different from main
        if (!isSameDatabase) {
            await this.createTemporaryDatabase(tmpMigConfig);
        }
        
        // restore main schema to temporary database
        logger.info('Restoring main schema to temporary database...');
        await this.executeSqlCommand(
            tmpMainConfig, 
            `${tmpFileConfig.schemaOutputDir}/tmp_dump.sql`
        );
        
        // handle migration history based on whether it's same or different database
        if (isSameDatabase) {
            // migration history is in the same database as main schema
            if (hasMigrationHistoryFile) {
                // migration history data exists - restore it to the same database
                logger.info('Restoring migration history data to main temporary database...');
                await this.restoreMigrationHistoryData(tmpMainConfig, migHistoryFile);
            } else {
                // mo migration history exists - table structure is already created by main schema
                logger.info('No migration history data found - using empty migration_history table from main schema');
            }
        } else {
            // migration history is in a separate database
            if (hasMigrationHistoryFile) {
                logger.info('Restoring migration history to separate temporary database...');
                await this.executeSqlCommand(tmpMigConfig, migHistoryFile);
            } else {
                // create empty migration history table in separate database
                logger.info('Creating empty migration history table in separate database...');
                const tmpMigConnection = await this.databaseManager.connect(tmpMigConfig);
                try {
                    await this.validateMigrationsTable(tmpMigConnection);
                } finally {
                    await tmpMigConnection.end();
                }
            }
        }
    }

    /**
     * Create a temporary database
     */
    private async createTemporaryDatabase(databaseConfig: DatabaseConfig): Promise<void> {
        const serverConfig = { ...databaseConfig };
        delete serverConfig.database; // Connect to server (not a specific database)
        
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
     * Restore migration history data only (not table structure)
     * This is used when migration_history table already exists in the main schema dump
     */
    private async restoreMigrationHistoryData(databaseConfig: DatabaseConfig, migHistoryFile: string): Promise<void> {
        try {
            // read the migration history SQL file
            const sqlContent = FileManager.readFile(migHistoryFile);
            
            // extract only INSERT statements, skip CREATE TABLE and other DDL
            const insertStatements = this.extractInsertStatements(sqlContent);
            
            if (insertStatements.length === 0) {
                logger.info('No migration history data to restore');
                return;
            }
            
            // execute only the INSERT statements
            const connection = await this.databaseManager.connect(databaseConfig);
            try {
                await connection.beginTransaction();
                
                for (const insertStatement of insertStatements) {
                    await connection.query(insertStatement);
                }
                
                await connection.commit();
                logger.info(`Restored ${insertStatements.length} migration history records`);
                
            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                await connection.end();
            }
            
        } catch (error) {
            logger.error(ERROR_MESSAGES.MIGRATION.RESTORE_HISTORY, error);
            throw error;
        }
    }

    /**
     * Extract INSERT statements from SQL dump, ignoring DDL statements
     */
    private extractInsertStatements(sqlContent: string): string[] {
        const lines = sqlContent.split('\n');
        const insertStatements: string[] = [];
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            
            // skip empty lines, comments, and DDL statements
            if (!trimmedLine || 
                trimmedLine.startsWith('--') || 
                trimmedLine.startsWith('/*') || 
                trimmedLine.startsWith('DROP') ||
                trimmedLine.startsWith('CREATE') ||
                trimmedLine.startsWith('ALTER') ||
                trimmedLine.startsWith('LOCK') ||
                trimmedLine.startsWith('UNLOCK')) {
                continue;
            }
            
            // include INSERT statements
            if (trimmedLine.startsWith('INSERT')) {
                insertStatements.push(trimmedLine);
            }
        }
        
        return insertStatements;
    }

    /**
     * Check if migration history table exists in source
     */
    private async checkMigrationHistoryExists(): Promise<boolean> {
        let connection: Connection | null = null;
        try {
            connection = await this.databaseManager.connect(this.config.migrationDatabaseConfig);
            return await this.databaseManager.tableExists(connection, MigrationService.MIGRATION_HISTORY_TABLE);
        } catch (error) {
            logger.error(ERROR_MESSAGES.TABLE.EXISTS(MigrationService.MIGRATION_HISTORY_TABLE), error);
            throw error;
        } finally {
            if (connection) await connection.end();
        }
    }

    /**
     * Create temporary database configuration
     */
    private createTempDatabaseConfig(originalConfig: DatabaseConfig): DatabaseConfig {
        const timestamp = Date.now();
        return {
            ...originalConfig,
            database: `${MigrationService.TEMP_PREFIX}${originalConfig.database}_${timestamp}`
        };
    }

    /**
     * Check if two database configurations point to same database
     */
    private isSameDatabase(db1: DatabaseConfig, db2: DatabaseConfig): boolean {
        return (
            db1.host === db2.host &&
            db1.port === db2.port &&
            db1.database === db2.database &&
            db1.user === db2.user
        );
    }

    /**
     * Execute SQL file against database
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

    /**
     * Cleanup all temporary resources
     */
    private async cleanup(
        tmpMainConnection: Connection | null,
        tmpMigConnection: Connection | null,
        tmpMainConfig: DatabaseConfig,
        tmpMigConfig: DatabaseConfig,
        tempFiles: string[]
    ): Promise<void> {
        logger.info('Cleaning up temporary resources...');
        
        // cleanup databases
        const cleanupPromises: Promise<void>[] = [];
        
        if (tmpMainConnection) {
            cleanupPromises.push(
                this.databaseManager.dropDatabase(tmpMainConnection, tmpMainConfig.database!)
                    .catch(error => {
                        logger.error(ERROR_MESSAGES.DATABASE.DROP, error);
                    })
                    .finally(() => tmpMainConnection?.end())
            );
        }
        
        if (tmpMigConnection && tmpMigConnection !== tmpMainConnection) {
            cleanupPromises.push(
                this.databaseManager.dropDatabase(tmpMigConnection, tmpMigConfig.database!)
                    .catch(error => {
                        logger.error(ERROR_MESSAGES.DATABASE.DROP, error);
                    })
                    .finally(() => tmpMigConnection?.end())
            );
        }
        
        // wait for the cleanup to finish
        await Promise.allSettled(cleanupPromises);
        
        // cleanup temporary files
        for (const file of tempFiles) {
            try {
                if (FileManager.fileExists && FileManager.fileExists(file)) {
                    FileManager.removeFile(file);
                    logger.info(`Removed temporary file: ${file}`);
                }
            } catch (error) {
                logger.warn(ERROR_MESSAGES.MIGRATION.CLEANUP_FILE(file), error);
            }
        }
        
        logger.info('Cleanup completed');
    }

    /**
     * Migrate database table
     */
    async migrate(_mainConnection?: Connection, _migrationHistoryConnection?: Connection) {
        let config = this.configManager.getConfig();
        let mainConnection!: Connection;
        let migrationHistoryConnection!: Connection;

        try {
            // 1. connect to the main and mig history database (they can be separate or the same)
            mainConnection = _mainConnection ?? await this.databaseManager.connect(config.mainDatabaseConfig)
            migrationHistoryConnection = _migrationHistoryConnection ?? await this.databaseManager.connect(config.migrationDatabaseConfig)
            
            await this.validateMigrationsTable(migrationHistoryConnection)
            logger.info("Migration history table validated")

            const migrationFiles = FileManager
                .readDirectory(config.fileConfig.migrationsDir)
                .filter(file => file.endsWith('.sql'))
                .sort()

            // 2. get applied migrations
            let appliedMigrations: MigrationRow[] = await this.getAppliedMigrations(migrationHistoryConnection)
            let appliedMigrationsSet = new Set(appliedMigrations.map(m => m.name))
            logger.info(`Existing .sql migration files: \n ${migrationFiles.join(',\n ')}`)
            
            // 3. unapplied migrations
            for (const migrationFile of migrationFiles) {
                if (appliedMigrationsSet.has(migrationFile)) {
                    logger.info(`Skipping already applied migration: ${migrationFile}`)
                    continue;
                }
                
                // apply the migration that was not yet applied
                const filePath = path.join(config.fileConfig.migrationsDir, migrationFile)
                await this.applyMigration(mainConnection, migrationHistoryConnection, filePath, migrationFile)
            }

            // only close connections if we created them (not passed in)
            if (!_mainConnection) {
                logger.info('Closing main database connection')
                await mainConnection.end()
            }
            if (!_migrationHistoryConnection) {
                logger.info('Closing migration history database connection')
                await migrationHistoryConnection.end()
            }
            
        } catch(error: any) {
            logger.error(ERROR_MESSAGES.MIGRATION.MIGRATE(error.message || error.toString()));
            throw error;
        } finally {
            // only close if we created the connections
            if (!_mainConnection) {
                await mainConnection?.end();
            }
            if (!_migrationHistoryConnection) {
                await migrationHistoryConnection?.end()
            }
        }
    }

    /**
     * Get applied migrations from migration history table
     * @param migrationHistoryConnection database connection for the mig history table
     * @returns database row for migrations
     */
    private async getAppliedMigrations(migrationHistoryConnection: Connection): Promise<MigrationRow[]> {
        try {
            const [rows] = await migrationHistoryConnection.execute<MigrationRow[]>(
                "SELECT * FROM migration_history ORDER BY id ASC"
            );
            return rows;
        } catch (error) {
            logger.error(ERROR_MESSAGES.MIGRATION.FETCH_APPLIED, error);
            throw error;
        }
    }

    /**
     * Apply a single migration
     */
    private async applyMigration(
        mainConnection: Connection, 
        migrationHistoryConnection: Connection, 
        filePath: string, 
        fileName: string
    ): Promise<void> {
        const sql = FileManager.readFile(filePath)
        try {
            logger.info(`Applying migration: ${fileName}`)
            
            await mainConnection.beginTransaction();
            await migrationHistoryConnection.beginTransaction();
            
            // execute the migration SQL
            await mainConnection.query(sql);
            
            // record the migration in history
            await migrationHistoryConnection.query(
                `INSERT INTO migration_history (name) VALUES (?)`, 
                [fileName]
            );
            
            await mainConnection.commit();
            await migrationHistoryConnection.commit();
            
            logger.info(`Applied migration successfully: ${fileName}`)
        } catch (err: any) {
            logger.error(ERROR_MESSAGES.MIGRATION.FAILED_MIGRATION(fileName))
            
            try {
                await mainConnection.rollback();
                await migrationHistoryConnection.rollback();
            } catch (rollbackError) {
                logger.error(ERROR_MESSAGES.MIGRATION.ROLLBACK, rollbackError);
                throw rollbackError;
            }
            
            logger.error(err.stack)
            throw err
        }
    }

    /**
     * Validate/create migrations table
     */
    private async validateMigrationsTable(conn: Connection): Promise<void> {
        logger.info('Validating migrations table')
        const initSqlPath = path.join(this.__dirname, '..','..', 'database', 'init_migrations.sql');
        
        if (!FileManager.fileExists || !FileManager.fileExists(initSqlPath)) {
            throw new Error(ERROR_MESSAGES.MIGRATION.INIT_FILE_MISSING(initSqlPath));
        }
        
        const createTable = FileManager.readFile(initSqlPath)
        await conn.execute(createTable.toString());
    }
}