require('dotenv').config()
const fs = require('fs');
const mysql = require('mysql2/promise');

const runSeed = async () => {
  try {
    const seedSQL = fs.readFileSync( "database/seed-data.sql" , 'utf8');

    const host = process.env.DB_HOST;
    const port = process.env.DB_PORT;
    const user = process.env.DB_USER;
    const password = process.env.DB_PASSWORD;
    const database = process.env.DB_NAME;

    if (!host || !port || !user || !password || !database) {
      console.error('❌ Missing one or more required environment variables (DB_HOST, DB_PORT, etc.)');
      process.exit(1); // Exit with an error code
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
    console.log('🚀 Executing SQL script...');
    await connection.query(seedSQL);
    console.log('✅ SQL script executed successfully!');

    // Close the connection
    await connection.end();
  } catch (error) {
    console.error('❌ Error seeding the database:', error);
  }
};

runSeed();