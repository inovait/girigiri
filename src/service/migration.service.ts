import { ConfigManager } from "../manager/config.manager.ts";
import logger from "../logging/logger.ts";
import { DatabaseManager } from "../manager/database.manager.ts";
import type { Connection } from 'mysql2/promise';
import type { MigrationRow } from "../interface/migration.row.interface.ts";
import { FileManager } from "../manager/file.manager.ts";
import path from "path";
import { fileURLToPath } from "url";
import { SchemaDumpService } from "./schema-dump.service.ts";
import { Config } from "interface/config.interface.ts";

export class MigrationService {
    private configManager: ConfigManager
    private databaseManager: DatabaseManager 
    private config: Config;

    private __filename = fileURLToPath(import.meta.url);
    private __dirname = path.dirname(this.__filename);

    constructor(configManager: ConfigManager, databaseManager: DatabaseManager ) {
        this.databaseManager = databaseManager;    
        this.configManager = configManager;
        this.config = this.configManager.getConfig()
    }

    /**
     * validate if migration succeeds on a temporary database
     */
    async checkMigrations() {
        let tmpMainConnection!: Connection;
        let tmpMigrationHistoryConnection!: Connection;
        let file: string[] = []

        try {
            // TODO: define th
            // first dump the target database
            let schemaDumpService = new SchemaDumpService(this.configManager, this.databaseManager)
            schemaDumpService.dumpSchema()

            // create a temporary database via the schema files
            if(FileManager.checkDirectory(this.config.fileConfig.schemaOutputDir)) {
                FileManager.readDirectory(this.config.fileConfig.schemaOutputDir)
            }            

            // run migration via temp db
            // run final dump
            // cleanup where necessary
        } catch(error) {
            logger.error('Error while validating migrations')
            throw error
        } finally {
            tmpMainConnection?.end()
            tmpMigrationHistoryConnection?.end()
        }
    }



    /**
     * migrate database table
     */
    async migrate() {
        let config = this.configManager.getConfig();
        let mainConnection!: Connection;
        let migrationHistoryConnection!: Connection;
        try {
            // connect to the main and mig history database (they can be seperate or the same)
            mainConnection = await this.databaseManager.connect(config.mainDatabaseConfig)
            migrationHistoryConnection = await this.databaseManager.connect(config.migrationDatabaseConfig)
            
            await this.validateMigrationsTable(migrationHistoryConnection)
            logger.info("Migration history table validated")

            const migrationFiles = FileManager
                .readDirectory(config.fileConfig.migrationsDir)
                .filter(file => file.endsWith('.sql'))
                .sort()

            // get applied migrations
            let appliedMigrations: MigrationRow[] = await this.getAppliedMigrations(migrationHistoryConnection)
            let appliedMigrationsSet = new Set(appliedMigrations.map(m => m.name))
            logger.info(`Existing .sql migration files: \n ${migrationFiles.join(',\n ')}`)
            
            // get migration files via file manager
            // crosscheck
            for (const migrationFile of migrationFiles) {
                if (appliedMigrationsSet.has(migrationFile)) {
                    logger.info('Skipping already applied migration')
                }
                // get the file path 
                // apply the migration that was not yet applied
                const filePath = path.join(config.fileConfig.migrationsDir, migrationFile)
                await this.applyMigration(mainConnection, migrationHistoryConnection, filePath, migrationFile)
            }

            logger.info('Closing database connection')
            await mainConnection.end()
            await migrationHistoryConnection.end()
        } catch(error: any) {
            logger.error(`Error while migrating database: ${error}`)
            throw error;
        } finally {
            await mainConnection?.end();
            await migrationHistoryConnection?.end()
        }
    }


    /**
     * 
     * @param migrationHistoryConnection database connection for the mig history table
     * @returns database row for migrations
     */
    private async getAppliedMigrations(migrationHistoryConnection: Connection): Promise<MigrationRow[]> {
        try {
            const [rows] = await migrationHistoryConnection.execute<MigrationRow[]>("SELECT * FROM migration_history ORDER BY id ASC");
            return rows;
        } catch (error) {
            console.error("Error fetching applied migrations:", error);
            throw error;
        }
    }

    /**
     * 
     * @param mainConnection 
     * @param migrationHistoryConnection 
     * @param filePath 
     * @param fileName 
     */
    private async applyMigration(mainConnection: Connection, migrationHistoryConnection: Connection, filePath: string, fileName: string): Promise<void> {
        const sql = FileManager.readFile(filePath)
        try {
            await mainConnection.beginTransaction();
            await mainConnection.query(sql);
            await migrationHistoryConnection.query(`INSERT INTO migration_history (name) VALUES (?)`, [fileName])            
            await mainConnection.commit()
            await migrationHistoryConnection.commit()
            logger.info(`Applied migration: ${fileName}`)
        } catch (err: any) {
            logger.error(`Failed migration: ${fileName}. Rolling back changes`)
            await mainConnection.rollback();
            await migrationHistoryConnection.rollback();
            logger.error(err.stack || err.message )
            throw err
        }
    }

    /**
     * 
     * @param conn 
     */
    private async validateMigrationsTable(conn: Connection): Promise<void> {
        logger.info('Validating migrations table')
        const initSqlPath = path.join(this.__dirname, '..','..', 'database', 'init_migrations.sql');
        
        if (!FileManager.checkDirectory(initSqlPath)) { // check if exists
            throw new Error(`Missing migration init file at: ${initSqlPath}`);
        }

        
        const createTable = FileManager.readFile(initSqlPath) // pull the sql from the migrations subfolder and execute
        await conn.execute(createTable.toString());
    }
}