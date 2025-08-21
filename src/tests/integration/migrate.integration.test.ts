import { exec } from 'child_process';
import * as fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import dotenv from 'dotenv';
import {MigrationRow} from '../../migrate'

dotenv.config({ quiet: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPT_PATH = path.resolve(__dirname, '..', '..', '..', 'scripts', 'basic_migrations.sh');
const SQL_INIT = path.join(__dirname, 'fixtures', 'init', 'init.sql');

const TEST_DB_NAME = 'integration_test_database';
let connection: mysql.Connection;

/**
 * run the migrations bash script.
 */
async function runScript(): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    // flags that help with the orchestration of the script
    exec(
      `bash -c 'bash ${SCRIPT_PATH} --integration-test --keep-tmp-db'`,
      { env: { ...process.env } },
      (error, stdout, stderr) => {
        // uncomment for debugging
        // console.log(stdout);
        // console.log(stderr);
        resolve({
          stdout,
          stderr,
          code: error?.code || 0,
        });
      }
    );
  });
}

/**
 * exract failed sql from script output
 */
function extractFailedSqlFiles(stdout: string): string[] {
  const cleaned = stripAnsi(stdout);
  return cleaned.split('\n').filter((line) => line.includes('ERROR'));
}

/**
 * remove ANSI escape sequences from logs.
 */
function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

describe('check:migrations script', () => {
  beforeAll(async () => {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: parseInt(process.env.DB_PORT!, 10),
      multipleStatements: true,
    });

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${TEST_DB_NAME}\``);
    await connection.query(`USE \`${TEST_DB_NAME}\``);

    const initSQL = fs.readFileSync(SQL_INIT, 'utf8');
    await connection.query(initSQL);
  });

  // see helpers.sh 
  afterAll(async () => {
    // cleanup all the databases generated in the basic_migrations.sh 
    await connection.query(`DROP DATABASE IF EXISTS tmp_migration_history`);
    await connection.query(`DROP DATABASE IF EXISTS tmp_main`)
    await connection.query(`DROP DATABASE IF EXISTS \`${TEST_DB_NAME}\``)
    await connection.end();
  });

  test('completes successfully when 001_migration.sql runs', async () => {
    await runScript();

    const [rows] = await connection.execute<MigrationRow[]>(
      `SELECT name FROM tmp_migration_history.migration_history`
    );

    const appliedMigrations = rows.map((row) => row.name);
    expect(appliedMigrations).toContain('001_migration.sql');
  });

  test('logs error when a migration fails', async () => {
    const { stdout } = await runScript();

    const errorLogs = extractFailedSqlFiles(stdout);
    const regex = /\b\d{3}_[^ ]+\.sql\b/;
    const failedFile = errorLogs
      .map((line) => line.match(regex))
      .find((match) => match)?.[0];

    expect(failedFile).toBe('002_migrations.sql');
  });
});
