import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env.integration'), override: true });
console.log('cwd:', process.cwd());

import fs from 'fs';
import { afterAll, beforeAll, describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ConfigManager } from '../../manager/config.manager';
import { DatabaseManager } from '../../manager/database.manager';
import mysql from 'mysql2/promise';
import { runMySqlCommand } from '../../utils';
import { SchemaDumpService } from '../../service/schema-dump.service';


type RunMySqlCommandFn = (command: string, mysqlPwd?: string) => Promise<void>;
const originalRunMySqlCommand = (await vi.importActual('../../utils')).runMySqlCommand as RunMySqlCommandFn;

vi.mock('../../utils', async (importOriginal) => {
  const originalModule = await importOriginal() as Record<string, unknown>;
  return {
    ...originalModule,
    runMySqlCommand: vi.fn(),
  };
});

const RANDOM_SUFFIX = Math.floor(Math.random() * 100000);
const MAIN_DB = `test_main_db_${RANDOM_SUFFIX}`;
const TEMP_DB = `test_temp_db_${RANDOM_SUFFIX}`;
const TEST_OUTPUT_DIR = 'test/temp_output';
const MIGRATIONS_DIR = path.join(TEST_OUTPUT_DIR, 'migrations');
const SCHEMA_DIR = path.join(TEST_OUTPUT_DIR, 'schema');
const SQL_FILES_DIR = path.join(__dirname, '../integration/fixtures');
const SCHEMA_SNAPSHOT_DIR = "src/tests/integration/fixtures/snapshot"

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

describe('SchemaDumpService End-to-End Tests (Local MySQL)', () => {
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

  it('should successfully run the schema dump', async () => {
    // Write the required SQL files
    writeMigrationFilesFromSqlFolder(SQL_FILES_DIR, ['001_initial.sql', '002_add_email.sql', '005_schema_objects.sql']);
    let config = ConfigManager.getInstance().getConfig()
    const schemaDumpService = new SchemaDumpService(new DatabaseManager());
    await expect(schemaDumpService.dumpSchema(config.mainDatabaseConfig, config.fileConfig)).resolves.not.toThrow();
  }, 60000);


  it('should fail the schema dump and handle with error', async () => {
    // write the required SQL files
    writeMigrationFilesFromSqlFolder(SQL_FILES_DIR, ['001_initial.sql', '002_add_email.sql']);
    let config = ConfigManager.getInstance().getConfig()
    let dbManager = new DatabaseManager()
    const schemaDumpService = new SchemaDumpService(dbManager);
    
    // override and mock the query , only return two tables, should throw error when trying to retrieve schema objects
    const fakeConn = {query: vi.fn().mockResolvedValue([[{ TABLE_NAME: "users" }, { TABLE_NAME: "orders" }]])};
    vi.spyOn(dbManager, "connect").mockResolvedValue(fakeConn as any);

    await expect(
      schemaDumpService.dumpSchema(config.mainDatabaseConfig, config.fileConfig)
    ).rejects.toThrow();
  }, 60000);

});

