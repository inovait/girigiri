import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env.integration'), override: true });

import fs from 'fs';
import { afterAll, beforeAll, describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MigrationService } from '../../service/migration.service';
import { ConfigManager } from '../../manager/config.manager';
import { DatabaseManager } from '../../manager/database.manager';
import mysql from 'mysql2/promise';



import { runMySqlCommand } from '../../utils';

// get the reference to the real impl
type RunMySqlCommandFn = (command: string, mysqlPwd?: string) => Promise<void>;
const originalRunMySqlCommand = (await vi.importActual('../../utils')).runMySqlCommand as RunMySqlCommandFn;

vi.mock('../../utils', async (importOriginal) => {
  const originalModule = await importOriginal() as Record<string, unknown>;
  return {
    ...originalModule,
    runMySqlCommand: vi.fn(), // override 
  };
});

// -------------------- Constants --------------------
const RANDOM_SUFFIX = Math.floor(Math.random() * 100000);
const MAIN_DB = `test_main_db_${RANDOM_SUFFIX}`;
const TEMP_DB = `test_temp_db_${RANDOM_SUFFIX}`;
const TEST_OUTPUT_DIR = 'test/temp_output';
const MIGRATIONS_DIR = path.join(TEST_OUTPUT_DIR, 'migrations');
const SCHEMA_DIR = path.join(TEST_OUTPUT_DIR, 'schema');

// env variables from .env.integration
const DB_CONFIG = {
  host: process.env.DB_HOST!,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  multipleStatements: true,
};

// M+migration filenames
const MIGRATION_INITIAL = '001_initial.sql';
const MIGRATION_ADD_EMAIL = '002_add_email.sql';
const MIGRATION_INVALID = '001_invalid_sql.sql';
const MIGRATION_USERS_TABLE = '001_users_table.sql';

// Lmog messages
const LOG_NO_MIGRATIONS = 'No unapplied migrations. Exiting';
const LOG_SCHEMA_ERROR = 'Error while validating migrations';
const LOG_FAILED_MIGRATION = (file: string) => `Failed migration: ${file}. Rolling back changes`;



let rootConnection: mysql.Connection;

async function resetDatabases() {
  if (!rootConnection) return;
  await rootConnection.query(`DROP DATABASE IF EXISTS \`${MAIN_DB}\``);
  await rootConnection.query(`CREATE DATABASE \`${MAIN_DB}\``);
  await rootConnection.query(`DROP DATABASE IF EXISTS \`${TEMP_DB}\``);
  
}

async function createConnection(dbName?: string) {
  return mysql.createConnection({ ...DB_CONFIG, database: dbName });
}

function writeMigrationFiles(migrations: Record<string, string>) {
  fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
  for (const [fileName, sql] of Object.entries(migrations)) {
    fs.writeFileSync(path.join(MIGRATIONS_DIR, fileName), sql);
  }
}

function setupEnv() {
  process.env.DB_USER = DB_CONFIG.user;
  process.env.DB_PASSWORD = DB_CONFIG.password;
  process.env.DB_HOST = DB_CONFIG.host;
  process.env.DB_PORT = DB_CONFIG.port.toString();
  process.env.DB_NAME = MAIN_DB;

  process.env.DB_MIGRATION_USER = DB_CONFIG.user;
  process.env.DB_MIGRATION_PASSWORD = DB_CONFIG.password;
  process.env.DB_MIGRATION_HOST = DB_CONFIG.host;
  process.env.DB_MIGRATION_PORT = DB_CONFIG.port.toString();
  process.env.DB_MIGRATION_NAME = TEMP_DB;

  process.env.SCHEMA_OUTPUT_DIR = SCHEMA_DIR;
  process.env.MIGRATIONS_DIR = MIGRATIONS_DIR;
}

describe('MigrationService End-to-End Tests (Local MySQL)', () => {
  beforeAll(async () => {
    rootConnection = await mysql.createConnection({ ...DB_CONFIG });
    await resetDatabases();
    setupEnv();
  }, 60000);

  afterAll(async () => {
    if (rootConnection) {
      await rootConnection.query(`DROP DATABASE IF EXISTS \`${MAIN_DB}\``);
      await rootConnection.query(`DROP DATABASE IF EXISTS \`${TEMP_DB}\``);
      await rootConnection.end();
    }
    if (fs.existsSync(TEST_OUTPUT_DIR)) fs.rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
  }, 60000);

  beforeEach(() => {

    vi.mocked(runMySqlCommand)
      // dont do anything so that the docker doesnt spin up
      .mockResolvedValueOnce(undefined)
      .mockImplementation(originalRunMySqlCommand);

    const configManager = ConfigManager.getInstance();
    configManager.setConfig(null as any);
    fs.mkdirSync(SCHEMA_DIR, { recursive: true });
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
  });

  afterEach(async () => {
    if (fs.existsSync(TEST_OUTPUT_DIR)) fs.rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
    await resetDatabases();
    vi.restoreAllMocks();
  });

  it('should successfully run checkMigrations with unapplied migrations', async () => {
    const { SchemaComparisonService } = await import('../../service/schema-comparison.service');
    vi.spyOn(SchemaComparisonService.prototype, 'compareSchemasBash').mockResolvedValue(true);

    writeMigrationFiles({
      [MIGRATION_INITIAL]: 'CREATE TABLE IF NOT EXISTS users (id INT PRIMARY KEY);',
      [MIGRATION_ADD_EMAIL]: 'ALTER TABLE users ADD COLUMN email VARCHAR(255);',
    });

    const mainConn = await createConnection(MAIN_DB);
    try {
      await mainConn.query('CREATE TABLE IF NOT EXISTS users (id INT PRIMARY KEY);');
    }
    finally { await mainConn.end(); }

    const migrationService = new MigrationService(ConfigManager.getInstance(), new DatabaseManager());
    await expect(migrationService.checkMigrations()).resolves.not.toThrow();
    
  }, 60000);

  it('should exit gracefully when there are no unapplied migrations', async () => {
    writeMigrationFiles({ [MIGRATION_USERS_TABLE]: 'CREATE TABLE IF NOT EXISTS users (id INT PRIMARY KEY);' });

    const conn = await createConnection(MAIN_DB);
    try {
      await conn.query('CREATE TABLE IF NOT EXISTS users (id INT PRIMARY KEY);');
      await conn.query(`
        CREATE TABLE IF NOT EXISTS migration_history (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await conn.query('INSERT INTO migration_history (name) VALUES (?)', [MIGRATION_USERS_TABLE]);
    } finally { await conn.end(); }

    const migrationService = new MigrationService(ConfigManager.getInstance(), new DatabaseManager());
    const logger = (await import('../../logging/logger')).default;
    const loggerSpy = vi.spyOn(logger, 'info');

    await expect(migrationService.checkMigrations()).resolves.not.toThrow();

    expect(loggerSpy).toHaveBeenCalledWith(LOG_NO_MIGRATIONS);
    
  }, 60000);

  it('should handle errors when schema comparison fails', async () => {
    const { SchemaComparisonService } = await import('../../service/schema-comparison.service');
    vi.spyOn(SchemaComparisonService.prototype, 'compareSchemasBash')
      .mockRejectedValue(new Error('Schema comparison failed'));

    writeMigrationFiles({ [MIGRATION_INITIAL]: 'CREATE TABLE IF NOT EXISTS users (id INT PRIMARY KEY);' });

    const mainConn = await createConnection(MAIN_DB);
    try { await mainConn.query('CREATE TABLE IF NOT EXISTS users (id INT PRIMARY KEY);'); }
    finally { await mainConn.end(); }

    const migrationService = new MigrationService(ConfigManager.getInstance(), new DatabaseManager());
    const logger = (await import('../../logging/logger')).default;
    const loggerSpy = vi.spyOn(logger, 'error');

    await expect(migrationService.checkMigrations()).rejects.toThrow('Schema comparison failed');
    expect(loggerSpy).toHaveBeenCalledWith(LOG_SCHEMA_ERROR, expect.any(Error));
  });

  it('should handle migration failure when SQL is invalid', async () => {
    writeMigrationFiles({ [MIGRATION_INVALID]: 'CREAT TABLE missing_keyword (id INT PRIMARY KEY);' });

    const mainConn = await createConnection(MAIN_DB);
    try { await mainConn.query('CREATE TABLE IF NOT EXISTS users (id INT PRIMARY KEY);'); }
    finally { await mainConn.end(); }

    const migrationService = new MigrationService(ConfigManager.getInstance(), new DatabaseManager());
    const logger = (await import('../../logging/logger')).default;
    const loggerSpy = vi.spyOn(logger, 'error');

    await expect(migrationService.checkMigrations()).rejects.toThrow();
    
    // check the error message from the service
    expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error while validating migrations'),
        expect.any(Error)
    );
  });
});