const fs = require('fs');
const mysql = require('mysql2/promise');

const runSeed = async () => {
  try {
    console.log('🌱 Starting to seed the database...');

    // Get the SQL statements from the seed file
    const seedSQL = fs.readFileSync( "database/seed-data.sql" , 'utf8');

    // Create a connection to the database
    const connection = await mysql.createConnection({
      host: '127.0.0.1',    // Use localhost for host machine
      port: 3307,           // The HOST port you mapped in docker-compose
      user: 'root',
      password: 'mysql_password',
      database: 'mysql_database',
      multipleStatements: true // Important for running multiple queries from a file
    });

    // Execute the SQL from the file
    await connection.query(seedSQL);

    console.log('✅ Database seeded successfully!');

    // Close the connection
    await connection.end();
  } catch (error) {
    console.error('❌ Error seeding the database:', error);
  }
};

runSeed();