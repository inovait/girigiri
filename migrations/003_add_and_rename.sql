-- 1. Add email to employees table
ALTER TABLE employees
ADD COLUMN email VARCHAR(100) NOT NULL UNIQUE AFTER last_name;

-- 2. Rename dept_name to department_name in departments table
ALTER TABLE departments
CHANGE dept_name department_name VARCHAR(40) NOT NULL;

-- 3. Add created_at and updated_at timestamps to salaries table
ALTER TABLE salaries
ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- 4. Change 'title' column in titles table to 'job_title' and allow NULL in to_date
ALTER TABLE titles
CHANGE title job_title VARCHAR(50) NOT NULL,
MODIFY to_date DATE NULL;

-- 5. Add index on hire_date in employees table for faster querying
CREATE INDEX idx_employees_hire_date ON employees (hire_date);

-- 6. Add check constraint to salaries to ensure salary is positive
ALTER TABLE salaries
ADD CONSTRAINT chk_salary_positive CHECK (salary > 0);
