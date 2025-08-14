import dotenv from 'dotenv'
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as mysql from 'mysql2/promise'
import type { Connection, RowDataPacket } from 'mysql2/promise'
import { validateEnvVar } from './helpers.js';
import logger from "./logger.js"

dotenv.config()
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  DB_HOST,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  DB_PORT
} = process.env;

type MigrationRow = { name: string} & RowDataPacket;

// connect to database
async function connect(): Promise<Connection>{
    const maxRetries = 5;
    const retryDelay = 5000; //ms
    let retries = 0;

    const host = validateEnvVar('DB_HOST', DB_HOST);
    const user = validateEnvVar('DB_USER', DB_USER);
    const password = validateEnvVar('DB_PASSWORD', DB_PASSWORD);
    const database = validateEnvVar('DB_NAME', DB_NAME);
    const port = validateEnvVar('DB_PORT', DB_PORT);
    
    while(retries < maxRetries) {
      try {
        if(retries <= 0) {
          logger.info("Establishing connection to the database");
        } else {
          logger.info(`Connecting to database. Retry #${retries}`);
        }
        
        return await mysql.createConnection({ 
          host: host,
          user: user,
          password: password,
          database: database,
          port: parseInt(port, 10),
          waitForConnections: true,
          multipleStatements: true,
          connectionLimit: 10,
          queueLimit: 0
        });

      } catch (err: any) {
        retries++;
        
        if (retries >= maxRetries) {
          logger.info("Over the maximum retry count for connecting to the database")
          throw err; // bubble up
        }

        await new Promise(res => setTimeout(res, retryDelay))
      }
    }
    
    throw new Error('Unexpected error connecting to the database');
}


// check if mig table exists
async function validateMigrationsTable(conn: Connection): Promise<void> {
    logger.info('Validating migrations table')
    const initSqlPath = path.join(__dirname, '..', 'database', 'init_migrations.sql');
    
    if (!fs.existsSync(initSqlPath)) { // check if exists
      throw new Error(`Missing migration init file at: ${initSqlPath}`);
    }

    const createTable = fs.readFileSync(initSqlPath, 'utf8') // pull the sql from the migrations subfolder and execute
    await conn.execute(createTable.toString());
}

// get applied migs
async function getAppliedMigrations(conn: Connection): Promise<string[]> {
    logger.info('Retrieving applied migrations from database')
    const [rows] = await conn.execute<MigrationRow[]>("Select name FROM migrations");
    return rows.map(row => row.name);
}

// apply single migration
async function applyMigration(conn: Connection, filePath: string, fileName: string): Promise<void> {
    const sql = fs.readFileSync(filePath, 'utf8')
    
    try {
        await conn.beginTransaction();
        await conn.query(sql);
        await conn.query('INSERT INTO migrations (name) values (?)', [fileName])
        await conn.commit();
        logger.info(`Applied migration: ${fileName}`)
    } catch (err: any) {
        logger.error(`Failed migration: ${fileName}. Rolling back changes`)
        await conn.rollback();
        logger.error(err.stack || err.message )
        throw err
    }
}

// runner method
async function runMigrations(): Promise<void> {
  let conn;
  try {
      conn = await connect();
      logger.info(`Connected to database`)

      // check if migration file exists, or create
      await validateMigrationsTable(conn);
      logger.info('Validated migrations table')

      // define the migration directory
      const migrationDir = path.join(__dirname, '..', 'migrations');
      // retrieve the migration files from the dir
      const migrationFiles = fs.readdirSync(migrationDir)
        .filter(file => file.endsWith('.sql'))
        .sort()

      // check the migration table if the migrations exist
      const appliedMigrations = await getAppliedMigrations(conn)

      logger.info(migrationFiles)

      // crosscheck which migration was already applied
      for (const migrationFile of migrationFiles) {
        if (appliedMigrations.includes(migrationFile)) {
          logger.info(`Skipping already applied ${migrationFile}`)
          continue;
        }
        // apply the ones not already applied
        const filePath = path.join(migrationDir, migrationFile);
        await applyMigration(conn, filePath, migrationFile);
      }

      logger.info("Closing database connection") 
      await conn.end()
  } catch (err: any) {
      throw err;
  } finally {
    await conn?.end()
  }
}

// init method
(async () => {
  try {
    logger.info("Running migration tool")
    await runMigrations()
  } catch(err: any) {
    logger.error("Migration runner failed")
    logger.error(err.stack)
  }
})();
