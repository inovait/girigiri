import { createConnection } from 'mysql2/promise';
import type { Connection } from 'mysql2/promise';

import type { DatabaseConfig } from '../interface/database-config.interface.ts';
import logger from '../logging/logger.ts';

export class DatabaseManager {
    constructor(){}
    
    async connect(databaseConfig: DatabaseConfig): Promise<Connection> {
        const maxRetries = 5;
        const retryDelay = 5000; //ms
        let retries = 0;

        while(retries < maxRetries) {
            try {
                if(retries <= 0) {
                    logger.info("Establishing connection to the database");
                } else {
                    logger.info(`Connecting to database. Retry #${retries}`);
                }
                return await createConnection(databaseConfig)
            } catch (error: any) {
                retries++;
                if (retries >= maxRetries) {
                    logger.info("Over the maximum retry count for connecting to the database")
                    throw error;
                }

                await new Promise(res => setTimeout(res, retryDelay))
            }
        }

        throw new Error("Unexpected error connecting to the database")
    }
}