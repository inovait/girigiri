import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env.integration'), override: true });
console.log('cwd:', process.cwd());

import fs from 'fs';
import { afterAll, beforeAll, describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MigrationService } from '../../service/migration.service';
import { ConfigManager } from '../../manager/config.manager';
import { DatabaseManager } from '../../manager/database.manager';
import mysql from 'mysql2/promise';
import { runMySqlCommand } from '../../utils';


type RunMySqlCommandFn = (command: string, mysqlPwd?: string) => Promise<void>;
const originalRunMySqlCommand = (await vi.importActual('../../utils')).runMySqlCommand as RunMySqlCommandFn;

vi.mock('../../utils', async (importOriginal) => {
  const originalModule = await importOriginal() as Record<string, unknown>;
  return {
    ...originalModule,
    runMySqlCommand: vi.fn(),
  };
});

// -------------------- Constants --------------------
const RANDOM_SUFFIX = Math.floor(Math.random() * 100000);
const MAIN_DB = `test_main_db_${RANDOM_SUFFIX}`;
const TEMP_DB = `test_temp_db_${RANDOM_SUFFIX}`;
const TEST_OUTPUT_DIR = 'test/temp_output';
const MIGRATIONS_DIR = path.join(TEST_OUTPUT_DIR, 'migrations');
const SCHEMA_DIR = path.join(TEST_OUTPUT_DIR, 'schema');
const SQL_FILES_DIR = path.join(__dirname, '../integration/fixtures');
const SCHEMA_SNAPSHOT_DIR = "src/tests/integration/fixtures/snapshot"

const LOG_NO_MIGRATIONS = 'No unapplied migrations. Exiting';
const LOG_SCHEMA_ERROR = 'Error while validating migrations';


const DB_CONFIG = {
  host: process.env.DB_HOST!,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  multipleStatements: true,
};

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

function loadSqlFile(filePath: string) {
  return fs.readFileSync(filePath, { encoding: 'utf8' });
}

function writeMigrationFilesFromSqlFolder(sqlFolder: string, fileNames?: string[]) {
  fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
  const sqlFiles = fileNames
    ? fileNames
    : fs.readdirSync(sqlFolder).filter(f => f.endsWith('.sql'));
  for (const fileName of sqlFiles) {
    const sql = loadSqlFile(path.join(sqlFolder, fileName));
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
  

  process.env.SCHEMA_SNAPSHOT_DIR = SCHEMA_SNAPSHOT_DIR;
  process.env.SCHEMA_OUTPUT_DIR = SCHEMA_DIR;
  process.env.MIGRATIONS_DIR = MIGRATIONS_DIR;
}

// -------------------- Tests --------------------
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
    // Write the required SQL files
    writeMigrationFilesFromSqlFolder(SQL_FILES_DIR, ['001_initial.sql', '002_add_email.sql']);

    const mainConn = await createConnection(MAIN_DB);
    try {
      await mainConn.query('CREATE TABLE IF NOT EXISTS users (id INT PRIMARY KEY);');
    } finally {
      await mainConn.end();
    }

    const migrationService = new MigrationService(ConfigManager.getInstance(), new DatabaseManager());
    await expect(migrationService.checkMigrations()).resolves.not.toThrow();
  }, 60000);

  it('should exit gracefully when there are no unapplied migrations', async () => {
    writeMigrationFilesFromSqlFolder(SQL_FILES_DIR, ['004_users_table.sql']);

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
      await conn.query('INSERT INTO migration_history (name) VALUES (?)', ['004_users_table.sql']);
    } finally {
      await conn.end();
    }

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

    writeMigrationFilesFromSqlFolder(SQL_FILES_DIR, ['001_initial.sql']);

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
    writeMigrationFilesFromSqlFolder(SQL_FILES_DIR, ['003_invalid_sql.sql']);

    const mainConn = await createConnection(MAIN_DB);
    try { await mainConn.query('CREATE TABLE IF NOT EXISTS users (id INT PRIMARY KEY);'); }
    finally { await mainConn.end(); }

    const migrationService = new MigrationService(ConfigManager.getInstance(), new DatabaseManager());
    const logger = (await import('../../logging/logger')).default;
    const loggerSpy = vi.spyOn(logger, 'error');

    await expect(migrationService.checkMigrations()).rejects.toThrow();
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error while validating migrations'),
      expect.any(Error)
    );
  });
});

