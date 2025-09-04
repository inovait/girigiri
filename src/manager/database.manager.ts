import { createConnection } from 'mysql2/promise';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { DatabaseConfig } from '../interface/database-config.interface.js';
import { ERROR_MESSAGES } from '../constants/error-messages.js';
import logger from '../logging/logger.js';

export class DatabaseManager {
    private static readonly DEFAULT_MAX_RETRIES = 5;
    private static readonly DEFAULT_RETRY_DELAY_MS = 5000;

    constructor() { }

    /**
     * Connects to database
     */
    async connect(databaseConfig: DatabaseConfig): Promise<Connection> {
        const maxRetries = DatabaseManager.DEFAULT_MAX_RETRIES;
        const retryDelay = DatabaseManager.DEFAULT_RETRY_DELAY_MS;
        let retries = 0;

        while (retries < maxRetries) {
            try {
                if (retries <= 0) {
                    logger.info('Establishing connection to the database');
                } else {
                    logger.info(`Connecting to database. Retry #${retries}`);
                }

                return await createConnection(databaseConfig);
            } catch (error: any) {
                retries++;

                if (retries >= maxRetries) {
                    logger.error(ERROR_MESSAGES.DATABASE.CONNECTION_MAX_RETRIES);
                    throw error;
                }

                logger.warn(`Connection failed, retrying in ${retryDelay}ms...`);
                await this.delay(retryDelay);
            }
        }

        throw new Error(ERROR_MESSAGES.DATABASE.CONNECTION_UNEXPECTED);
    }

    /**
     * Creates database based on db name
     */
    async createDatabase(connection: Connection, dbName?: string): Promise<void> {
        if (!dbName) {
            logger.error(ERROR_MESSAGES.DATABASE.NAME_REQUIRED);
            throw new Error(ERROR_MESSAGES.DATABASE.NAME_REQUIRED);
        }

        try {
            logger.info(`Creating database ${dbName}`);
            await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
            logger.info(`Database ${dbName} created successfully`);
        } catch (error) {
            logger.error(ERROR_MESSAGES.DATABASE.CREATE, error);
            throw error;
        }
    }

    /**
     * Drops the database table
     * @param connection mysql2/promise connection
     * @param dbName schema name being dropped
     */
    async dropDatabase(connection: Connection, dbName?: string): Promise<void> {
        if (!dbName) {
            logger.error(ERROR_MESSAGES.DATABASE.NAME_REQUIRED);
            throw new Error(ERROR_MESSAGES.DATABASE.NAME_REQUIRED);
        }

        try {
            logger.info(`Dropping database ${dbName}`);
            await connection.query(`DROP DATABASE \`${dbName}\``);
            logger.info(`Database ${dbName} dropped successfully`);
        } catch (error) {
            logger.error(ERROR_MESSAGES.DATABASE.DROP, error);
            throw error;
        }
    }

    /**
     * Checks if table name exists
     * @param connection mysql2/promise connection
     * @param tableName table name being checked
     * @returns Promise<boolean> - if exists
     */
    async tableExists(connection: Connection, tableName?: string): Promise<boolean> {
        if (!tableName) {
            throw new Error(ERROR_MESSAGES.TABLE.NAME_REQUIRED);
        }

        try {
            const [rows] = await connection.query<RowDataPacket[]>(
                'SHOW TABLES LIKE ?',
                [tableName]
            );
            return rows.length > 0;
        } catch (error) {
            logger.error(ERROR_MESSAGES.TABLE.EXISTS(tableName), error);
            throw error;
        }
    }

    /**
     * delay helper function
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Preprocesses sql file (text). 
     */
    public preprocessSqlFile(sql: string): string {
        return sql
             .replace(/^DELIMITER\s+.+$/gm, '')  // remove DELIMITER lines
             .replace(/\/\/\s*$/gm, ';');     
    }

}