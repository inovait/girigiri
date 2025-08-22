
DROP TABLE IF EXISTS integration_test_table;


CREATE TABLE integration_test_table (
    id INT PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    CONSTRAINT unique_email UNIQUE (`email`)
);


INSERT INTO integration_test_table (id, `name`, `email`) VALUES
(1, 'John Doe', 'john.doe@example.com'),
(2, 'Jane Smith', 'jane.smith@example.com');
