-- Add a new column to store the creation date of a user
ALTER TABLE integration_test_table ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Add a new user to the table
INSERT INTO integration_test_table (id, name, email) VALUES
(3, 'Peter Jones', 'peter.jones@example.com');