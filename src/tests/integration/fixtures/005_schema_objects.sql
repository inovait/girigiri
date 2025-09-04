-- ==========================
-- 1. Base tables
-- ==========================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY
);

-- Audit log table (required by the trigger)
CREATE TABLE IF NOT EXISTS audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  action VARCHAR(50),
  user_id INT,
  created_at DATETIME
);

-- ==========================
-- 2. Function
-- ==========================

DROP FUNCTION IF EXISTS getUserLabel;
DELIMITER $$
CREATE FUNCTION getUserLabel(userId INT)
RETURNS VARCHAR(255)
DETERMINISTIC
BEGIN
  DECLARE result VARCHAR(255);
  SELECT CONCAT('User #', id) INTO result
  FROM users
  WHERE id = userId
  LIMIT 1;

  RETURN result;
END$$
DELIMITER ;

-- ==========================
-- 3. View
-- ==========================

DROP VIEW IF EXISTS user_labels;
CREATE VIEW user_labels AS
SELECT id, CONCAT('User #', id) AS label
FROM users;

-- ==========================
-- 4. Procedure
-- ==========================

DROP PROCEDURE IF EXISTS addUser;
DELIMITER $$
CREATE PROCEDURE addUser(IN newId INT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = newId) THEN
    INSERT INTO users (id) VALUES (newId);
  END IF;
END$$
DELIMITER ;

-- ==========================
-- 5. Trigger
-- ==========================

DROP TRIGGER IF EXISTS after_insert_users;
DELIMITER $$
CREATE TRIGGER after_insert_users
AFTER INSERT ON users
FOR EACH ROW
BEGIN
  INSERT INTO audit_log (action, user_id, created_at)
  VALUES ('INSERT', NEW.id, NOW());
END$$
DELIMITER ;