import dotenv from 'dotenv'
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as mysql from 'mysql2/promise'
import type { Connection, RowDataPacket } from 'mysql2/promise'
import { error } from 'console';

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
async function connect(): Promise<Connection> {
    return mysql.createConnection({ // TODO: make a env attribute validation beforehand
        host: DB_HOST!,
        user: DB_USER!,
        password: DB_PASSWORD!,
        database: DB_NAME!,
        port: parseInt(DB_PORT!, 10),
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
}


// check if mig table exists
async function validateMigrationsTable(conn: Connection): Promise<void> {
    const createTable = fs.readFileSync(path.join(__dirname, '..', 'migrations', '001_init.sql')) // pull the sql from the migrations subfolder and execute
    await conn.execute(createTable.toString());
}


// get applied migs
async function getAppliedMigrations(conn: Connection): Promise<string[]> {
    const [rows] = await conn.execute<MigrationRow[]>("Select name FROM migrations");
    return rows.map(row => row.name);
}

async function applyMigration(conn: Connection, filePath: string, fileName: string): Promise<void> {
    const sql = fs.readFileSync(filePath, 'utf8')
    try {
        await conn.beginTransaction();
        await conn.query(sql)
        await conn.query('INSERT INTO migrations (name) values (?)', [fileName])
        await conn.commit();
        console.log(`Applied migration: ${fileName}`)
    } catch (err: any) {
        await conn.rollback();
        console.error(`Failed migration: ${fileName}`)
        console.error(err.stack)
        throw err
    }
}

// runner method
async function runMigrations(): Promise<void> {
  const conn = await connect();
  // check if migration file exists, or create
  await validateMigrationsTable(conn);

  // define the migration directory
  const migrationDir = path.join(__dirname, '..', 'migrations');
  // retrieve the migration files from the dir
  const migrationFiles = fs.readdirSync(migrationDir)
    .filter(file => file.endsWith('.sql'))
    .sort()

  // check the migration table if the migrations exist
  const appliedMigrations = await getAppliedMigrations(conn)

  // crosscheck which migration was already applied
  for (const migrationFile of migrationFiles) {
    if (appliedMigrations.includes(migrationFile)) {
      console.log(`Already applied migration: ${migrationFile}`)
      continue;
    }
    // apply the ones not already applied
    const filePath = path.join(migrationDir, migrationFile);
    await applyMigration(conn, filePath, migrationFile);
  }

  await conn.end()
}

runMigrations().catch(err => {
  console.log("Running migration tool")
  console.error('Migration runner failed:', err)
  process.exit(1);
});
