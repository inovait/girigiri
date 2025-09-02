CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS migration_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE, -- name of the migration ?
  run_on DATETIME DEFAULT CURRENT_TIMESTAMP -- which database it ran on ?
);