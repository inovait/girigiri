import { Pool, PoolClient, QueryResult } from "pg"
import { Connection, DatabaseClient } from "./DatabaseClient.interface.js";
import { validateEnvVar } from "../helpers.js";
import logger from "../logger.js";

class PostgresDatabaseClient implements DatabaseClient {
    private pool: Pool;
    private client: PoolClient | null = null;

    constructor() {
        const { PG_HOST, PG_USER, PG_PASSWORD, PG_NAME, PG_PORT } = process.env;

        const host = validateEnvVar('PG_HOST', PG_HOST);
        const user = validateEnvVar('PG_USER', PG_USER);
        const password = validateEnvVar('PG_PASSWORD', PG_PASSWORD);
        const database = validateEnvVar('PG_NAME', PG_NAME);
        const port = validateEnvVar('PG_PORT', PG_PORT);

        const poolConfig = {
            host,
            user,
            password,
            database,
            port: parseInt(port, 10),
            max: 10, // Max number of clients in the pool
            idleTimeoutMillis: 30000, // How long a client can remain idle before being closed
            connectionTimeoutMillis: 2000, // How long to wait for a connection to be acquired
        };

        this.pool = new Pool(poolConfig);

        // Log any errors from idle clients in the pool
        this.pool.on('error', (err, client) => {
            logger.info('Unexcepected error on idle client', err)
        });
    }

    async connect(): Promise<Connection> {
        if (this.client) { return this.client; }
        this.client = await this.pool.connect()
        return this.client;
    }

    async beginTransaction(): Promise<void> {
        if (!this.client) {
            throw new Error('No database connection established. Call connect() first');
        }
        await this.client.query('BEGIN')
    }

    /**
     * Executes a SQL query on the current transactional client.
     * @param {string} sql - The SQL query string.
     * @param {any[]} [params=[]] - An array of parameters for the query.
     * @returns {Promise<QueryResult>}
     */
    async query(sql: string, params: any[] = []): Promise<QueryResult> {
        if (!this.client) {
            throw new Error("No database connection established. Call connect() first.");      
        }

        return await this.client.query(sql, params)
    }
    
    /**
     * Commits the current transaction and releases the client.
     * @returns {Promise<void>}
     */
    async commit(): Promise<void> {
        if (!this.client) {
            throw new Error('No database connection established. Call connect() first');
        }
        await this.client.query('COMMIT');
    }

    /**
     * Rolls back the current transaction and releases the client.
     * @returns {Promise<void>}
     */
    async rollback(): Promise<void> {
        if (!this.client) {
            throw new Error('No database connection established. Call connect() first')
        }
        await this.client.query('ROLLBACK')
    }

    /**
     * Disconnects from the database pool, ending all connections.
     * This should be called once when the application shuts down.
     * @returns {Promise<void>}
     */
    async disconnect(): Promise<void> {
        await this.pool.end();
        logger.info('PostgreSQL pool disconnected')
    }
}