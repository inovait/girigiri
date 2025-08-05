import { config } from "dotenv";
import { readFileSync } from "fs";
import path from 'path'; 
import mysql from "mysql2/promise";

config(); 

const runSeed = async () => {
  try {
  
    const seedSQLPath = path.join(process.cwd(), 'database', 'seed-data.sql');
    const seedSQL = readFileSync(seedSQLPath, 'utf8');

    const host = process.env.DB_HOST;
    const port = process.env.DB_PORT;
    const user = process.env.DB_USER;
    const password = process.env.DB_PASSWORD;
    const database = process.env.DB_NAME;

    if (!host || !port || !user || !password || !database) {
      console.error('Missing one or more required environment variables (DB_HOST, DB_PORT, etc.)');
      process.exit(1);
    }

    console.log(`🌱 Connecting to database at ${host}:${port}...`);

    // create a connection to the database
     const connection = await mysql.createConnection({
      host: host,
      port: parseInt(port, 10),
      user: user,
      password: password,
      database: database,
      multipleStatements: true
    });

    // execute the sql script 
    console.log('Executing SQL script...');


    await connection.query(seedSQL);

    console.log('SQL script executed successfully!');

    // close the connection
    await connection.end();
  } catch (error) {
    console.error('Error seeding the database:', error);
    process.exit(1);
  }
};

runSeed();