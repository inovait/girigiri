import dotenv from 'dotenv'
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as mysql from 'mysql2/promise'
import type { Connection, RowDataPacket } from 'mysql2/promise'
import { validateEnvVar } from './helpers.js';
import logger from "./logger.js"
import { migrations_table } from './constants.js';

dotenv.config()
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  DB_HOST,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  DB_PORT,
  DB_MIGRATION_USER,
  DB_MIGRATION_PASSWORD,
  DB_MIGRATION_NAME,
  DB_MIGRATION_HOST,
  DB_MIGRATION_PORT
} = process.env;

type MigrationRow = { name: string} & RowDataPacket;

const migrationDatabaseConfig = {
  host: validateEnvVar('DB_HOST', DB_HOST),
  user: validateEnvVar('DB_USER', DB_USER),
  password: validateEnvVar('DB_PASSWORD', DB_PASSWORD),
  database: validateEnvVar('DB_NAME', DB_NAME),
  port: validateEnvVar('DB_PORT', DB_PORT)
}

const migrationHistoryConfig = {
  host: validateEnvVar('DB_MIGRATION_HOST', DB_MIGRATION_HOST),
  user: validateEnvVar('DB_MIGRATION_USER', DB_MIGRATION_USER),
  password: validateEnvVar('DB_MIGRATION_PASSWORD', DB_MIGRATION_PASSWORD),
  database: validateEnvVar('DB_MIGRATION_NAME', DB_MIGRATION_NAME),
  port: validateEnvVar('DB_MIGRATION_PORT', DB_MIGRATION_PORT)
}


// connect to database
async function connect(config: any): Promise<Connection>{
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
        
        return await mysql.createConnection({ 
          host: config.host,
          user: config.user,
          password: config.password,
          database: config.database,
          port: parseInt(config.port, 10),
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
  //validateEnvVar('MIGRATIONS_SCHEMA', MIGRATIONS_SCHEMA);
  const [rows] = await conn.execute<MigrationRow[]>(
    `SELECT name FROM \`${DB_MIGRATION_NAME}\`.\`${migrations_table}\``
  );
  return rows.map((row) => row.name);
}

// apply single migration
async function applyMigration(mainConnection: Connection, migrationHistoryConnection: Connection, filePath: string, fileName: string): Promise<void> {
    const sql = fs.readFileSync(filePath, 'utf8')
    
    try {
        await mainConnection.beginTransaction();
        await mainConnection.query(sql);
        await migrationHistoryConnection.query(
        `INSERT INTO \`${DB_MIGRATION_NAME}\`.\`${migrations_table}\` (name) VALUES (?)`,
          [fileName]
        );
        await mainConnection.commit();
        await migrationHistoryConnection.commit();
        logger.info(`Applied migration: ${fileName}`)
    } catch (err: any) {
        logger.error(`Failed migration: ${fileName}. Rolling back changes`)
        await mainConnection.rollback();
        await migrationHistoryConnection.rollback();
        logger.error(err.stack || err.message )
        throw err
    }
}

// runner method
async function runMigrations(): Promise<void> {
  let mainConnection;
  let migrationHistoryConnection;
  try {
      // create connection for main database
      mainConnection = await connect(migrationDatabaseConfig);
      logger.info('Connected to main database')
      // create connection for mig history 
      migrationHistoryConnection = await connect(migrationHistoryConfig)
      logger.info(`Connected to migration history database`)

      // check if migration file exists, or create
      await validateMigrationsTable(migrationHistoryConnection);
      logger.info('Validated migration history table')

      // define the migration directory
      const migrationDir = path.join(__dirname, '..', 'migrations');
      // retrieve the migration files from the dir
      const migrationFiles = fs.readdirSync(migrationDir)
        .filter(file => file.endsWith('.sql'))
        .sort()

      // check the migration table if the migrations exist
      const appliedMigrations = await getAppliedMigrations(migrationHistoryConnection)
      logger.info(`Existing .sql migration files: \n ${migrationFiles.join(',\n ')}`)

      // crosscheck which migration was already applied
      for (const migrationFile of migrationFiles) {
        if (appliedMigrations.includes(migrationFile)) {
          logger.info(`Skipping already applied ${migrationFile}`)
          continue;
        }
        // apply the ones not already applied
        const filePath = path.join(migrationDir, migrationFile);
        await applyMigration(mainConnection, migrationHistoryConnection, filePath, migrationFile);
      }

      logger.info("Closing database connection") 
      await mainConnection.end()
      await migrationHistoryConnection.end()
  } catch (err: any) {
      throw err;
  } finally {
    await mainConnection?.end()
    await migrationHistoryConnection?.end()
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
