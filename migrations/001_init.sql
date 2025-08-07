CREATE TABLE IF NOT EXISTS migrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE, -- name of the migration ?
  run_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- which database it ran on ?
);