import { Connection, ConnectionOptions, Pool, PoolConnection, QueryResult } from "mysql2/promise";
import { DatabaseClient } from "./DatabaseClient.interface.js";
import { validateEnvVar } from "../helpers.js";
import * as mysql from 'mysql2/promise'
import dotenv from 'dotenv'
import logger from "../logger.js";

dotenv.config()

class MySqlDatabaseClient implements DatabaseClient {
    private pool: Pool;
    private client: PoolConnection | null = null; // Use a nullable type

    constructor() {
        const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT } = process.env;
        const host = validateEnvVar('DB_HOST', DB_HOST);
        const user = validateEnvVar('DB_USER', DB_USER);
        const password = validateEnvVar('DB_PASSWORD', DB_PASSWORD);
        const database = validateEnvVar('DB_NAME', DB_NAME);
        const port = validateEnvVar('DB_PORT', DB_PORT);
        
        const clientConfig: ConnectionOptions = {
            host,
            user,
            password,
            database,
            port: parseInt(port, 10),
            multipleStatements: true,
            waitForConnections: true,
            connectionLimit: 10, // Max number of clients in the pool
            idleTimeout: 30000, // How long a client can remain idle before being closed
            connectTimeout: 2000, // How long to wait for a connection to be acquired
        };

        // create the connection pool
        this.pool = mysql.createPool(clientConfig);
    }

    /**
     * retrieve a connection from the pool - must use same connection ( client ) for transactions
     * to work properly
     * @returns 
     */
    async connect(): Promise<PoolConnection> {
        if (this.client) { return this.client }
        this.client = await this.pool.getConnection();

        return this.client;
    }
    
    /**
     * query function
     * @param sql - the sql being run
     * @param params - params inserted into the sql
     * @returns {Promise<QueryResult>}
     */
    async query(sql: string, params: any[] = []): Promise<QueryResult> {
        if (!this.client) {
            throw new Error("No database connection. Call connect() first");
        }

        const [rows] = await this.client.query(sql, params)
        return rows
    }

    /**
     * start the transaction
     */
    async beginTransaction(): Promise<void> {
        if (!this.client) {
            throw new Error('No database connection. Call connect() first');
        }

        await this.client.beginTransaction()
    }

       /**
     * Commits the current transaction.
     * @returns {Promise<void>}
     */
    async commit(): Promise<void> {
        if (!this.client) {
            throw new Error('No database connection. Call connect() first');
        }

        await this.client.commit()
    }

    /**
     * rollback current transaction
     * @returns {Promise<void>}
     */
    async rollback(): Promise<void> {
        if (!this.client) {
            throw new Error('No database connection. Call connect() first');
        } 
        await this.client.rollback();
    }

    /**
     * disconnects from the database
     * @returns {Promise<void>}
     */
    async disconnect(): Promise<void> {
        await this.pool.end();
        logger.info('Database pool disconnected');
    }
}

export default MySqlDatabaseClient