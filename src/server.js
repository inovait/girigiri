require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');


const startServer = async () => {
  let retries = 5;
  while (retries) {
    try {
      const host = process.env.DB_HOST || '127.0.0.1';
      const db_port = host === 'mysqldb' ? 3306 : 3307; // Internal vs External port

      const pool = mysql.createPool({
        host: host,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: db_port,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      });

      console.log('✅ Database connected successfully!');

      const app = express();
      const port = 3000;

      // placeholder route
      app.get('/users', async (req, res) => {
        try {
          const [results] = await pool.query('SELECT * FROM users');
          console.log("Successfully retrieved users")
          res.json(results);
        } catch (err) {
          console.error('Error querying for users:', err);
          res.status(500).send('Error connecting to the database');
        }
      });
      
      app.listen(port, () => {
        console.log(`🚀 Server listening on port ${port}`);
      });
      
      break;

    } catch (err) {
      console.error('❌ Database connection failed:', err.message);
      retries -= 1;
      console.log(`Retries left: ${retries}. Waiting 5 seconds to retry...`);
      if (retries === 0) {
        process.exit(1); // exit the process if we are pass the retry number
      }
    }
  }
};

startServer();