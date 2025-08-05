import express, { Application } from 'express';
import { IController } from './api/IController.js';
import { MySqlDataSource } from './database/data-source.js';

export class App {
    public app: Application;
    public port: number;
    
    constructor(controllers: IController[]) {
        this.app = express();
        this.port = parseInt(process.env.PORT || '3000', 10);

        this.initializeDatabase();
        this.initializeMiddleware();
        this.initializeControllers(controllers);
        this.initializeErrorHandling();
    }

    private initializeMiddleware() {
        this.app.use(express.json());
    }

    private initializeControllers(controllers: IController[]) {
        controllers.forEach((controller) => {
            this.app.use('/', controller.router);
        });
    }
    
    private initializeErrorHandling() {
        this.app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
            console.error(err.stack);
            res.status(500).send('Something broke!');
        });
    }

    private async initializeDatabase() {
        // retry config - the database container can take a while to get up
        const maxRetries = 5;
        let currentRetry = 0;
        const baseRetryDelay = 1000; // 1 second

        // Keep trying to connect until we run out of retries
        while (currentRetry < maxRetries) {
            try {
                // datasource init
                await MySqlDataSource.initialize();
                console.log("Database connection has been initialized successfully.");
                
                // if the connection is successful, exit the loop by returning
                return;
            } catch (error) {
                currentRetry++;
                console.error(`Database connection attempt #${currentRetry} failed.`);

                if (currentRetry >= maxRetries) {
                    // if we've run out of retries, log the final error and environment, then exit
                    console.error("--- All database connection attempts have failed. ---");                    
                    console.error("\nFinal Error during database initialization:", error);
                    process.exit(1); // Exit the application
                }

                // calculate the delay for the next retry 
                const delay = baseRetryDelay * Math.pow(2, currentRetry - 1);
                console.log(`Retrying in ${delay / 1000} seconds...`);
                
                // wait for the calculated delay before 
                await new Promise(res => setTimeout(res, delay));
            }
        }
    }

    public start() {
        this.app.listen(this.port, () => {
            console.log(`Application listening on port ${this.port}`);
        });
    }
}