import { config } from 'dotenv'
import path from 'path';
const mysql = require('mysql2/promise');
const fs = require('fs')
config()

const {
  DB_HOST,
  DB_USER,
  DB_PASSWORD,
  DB_NAME
} = process.env;


async function connect() {
    return mysql.createConnection({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
}


// check if mig table exists
async function validateMigrationsTable(conn: { execute: (arg0: any) => any; }) { // TODO: define type
    const createTable = fs.readFileSync(path.join(__dirname, '..', 'migrations', '001_init.sql')) // pull the sql from the migrations subfolder and execute
    await conn.execute(createTable);
}


// get applied migs
async function getAppliedMigrations(conn: { execute: (arg0: string) => any; }) { // TODO: define type
    const rows = await conn.execute('Select name FROM migrations')
    return rows.map((row: { name: any; }) => row.name)
}

async function applyMigration(conn: { rollback: () => any; }, filePath: any, fileName: any) { // TODO: define tpe
    const sql = fs.readFileSync(filePath, 'utf8')
    try {
        await conn.beginTransaction();
        await conn.query(sql)
        await conn.query('INSERT INTO migrations (filename) values (?)', [fileName])
        await conn.commit();
        console.log(`Applied migration: ${fileName}`)
    } catch (err: any) { // TODO define type
        await conn.rollback();
        console.error(`Failed migrations: ${fileName}`)
        console.error(err.message)
        process.exit(1)
    }
}


(async () => {
  const conn = await connect();
  await validateMigrationsTable(conn);

  const migrationDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const applied = await getAppliedMigrations(conn);

  for (const file of files) {
    if (applied.includes(file)) {
      console.log(`⏭️ Skipped: ${file}`);
      continue;
    }

    const filePath = path.join(migrationDir, file);
    await applyMigration(conn, filePath, file);
  }

  await conn.end();
})();