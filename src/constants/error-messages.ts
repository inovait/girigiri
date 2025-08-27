export const ERROR_MESSAGES = {
    DATABASE: {
        CONNECTION_MAX_RETRIES: "Exceeded maximum retry count for connecting to the database",
        CONNECTION_UNEXPECTED: "Unexpected error connecting to the database",
        NAME_REQUIRED: "Database name is required",
        CREATE: "Error creating database",
        DROP: "Error dropping database",
    },
    TABLE: {
        NAME_REQUIRED: "Table name is required",
        EXISTS: (tableName: string) => `Error checking if table ${tableName} exists`,
    },
    CONFIG: {
        PATH_REQUIRED: "Configuration file path is required",
        LOAD: "Error loading configuration",
        SAVE: "Error saving configuration",
    },
    FILE: {
        PATH_REQUIRED: "File path is required",
        READ: "Error reading file",
        WRITE: "Error writing file",
        DELETE: "Error deleting file",
    },
    MIGRATION: {
        VALIDATION: "Error while validating migrations",
        RESTORE_HISTORY: "Failed to restore migration history data",
        EXECUTE_SQL: (file: string) => `Failed to execute SQL file: ${file}`,
        CLEANUP_FILE: (file: string) => `Failed to remove temporary file ${file}`,
        MIGRATE: (error: string) => `Error while migrating database: ${error}`,
        FETCH_APPLIED: "Error fetching applied migrations",
        FAILED_MIGRATION: (fileName: string) => `Failed migration: ${fileName}. Rolling back changes`,
        ROLLBACK: "Error during rollback",
        INIT_FILE_MISSING: (initSqlPath: string) => `Missing migration init file at: ${initSqlPath}`,
    },
    SCHEMA_DUMP: {
        BULK: "Error while dumping schema",
        TABLE: (table?: string) =>
            table ? `Error while dumping table: ${table}` : "Error while dumping table",
        STOP_DUE_TO_ERROR: "Stopping table dumping due to error",
        FETCH_TABLES: "Error while fetching tables",
    }
} as const;
