CREATE DATABASE IF NOT EXISTS girigiri;
USE girigiri;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT,
  display_name TEXT
);

INSERT INTO users (username, email, display_name) VALUES ('username', 'email', 'display_name');