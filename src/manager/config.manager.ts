import dotenv from 'dotenv';
import type { Config } from "../interface/config.interface.ts";
import type { DatabaseConfig } from "../interface/database-config.interface.ts";
import type { FileConfig } from "../interface/file-config.interface.ts";
dotenv.config();

export class ConfigManager {
    private config: Config;
    constructor() {
        this.validateEnvVariables()
        this.config = this.loadConfig()
    }

    private loadConfig() {
        return this.loadFromEnvironment();
    }

    private loadFromEnvironment() {
        return {
            migrationDatabaseConfig: this.loadMigrationDatabaseConfig(),
            mainDatabaseConfig: this.loadMainDatabaseConfig(),
            fileConfig: this.loadFileConfig(),
        };
    }

    // TODO: Add validation for env vars
    private loadMigrationDatabaseConfig(): DatabaseConfig {
        return {
            user: process.env["DB_MIGRATION_USER"] || "",
            password: process.env["DB_MIGRATION_PASSWORD"] || "",
            host: process.env["DB_MIGRATION_HOST"] || "localhost",
            port: parseInt(process.env["DB_MIGRATION_PORT"]!, 10) || 5432,
            database: process.env["DB_MIGRATION_NAME"] || "",
            waitForConnections: true,
            multipleStatements: true,
            connectionLimits: 10,
            queveLimit: 0
        };
    }

    private loadMainDatabaseConfig(): DatabaseConfig {
        return {
            user: process.env["DB_USER"] || "",
            password: process.env["DB_PASSWORD"] || "",
            host: process.env["DB_HOST"] || "localhost",
            port: parseInt(process.env["DB_MIGRATION_PORT"]!, 10) || 5432,
            database: process.env["DB_NAME"] || "",
            waitForConnections: true,
            multipleStatements: true,
            connectionLimits: 10,
            queveLimit: 0
        };
    }

    private loadFileConfig(): FileConfig {
        return {
            schemaOutputDir: process.env["SCHEMA_OUTPUT_DIR"] || "dist/schema",
            migrationsDir: process.env["MIGRATIONS_DIR"] || "dist/migrations",
        };
    }

    getConfig(): Config {
        if (this.config === null) {
            this.loadConfig()
            return this.config
        }

        return this.config
    }

    private validateEnvVariables(): void {
        const requiredDbMainVars = ["DB_USER", "DB_PASSWORD", "DB_HOST", "DB_PORT", "DB_NAME"]
        const requiredDbMigrationHistoryVars = ["DB_MIGRATION_USER", "DB_MIGRATION_PASSWORD", "DB_MIGRATION_HOST", "DB_MIGRATION_PORT", "DB_MIGRATION_NAME"]
        const requiredFileVars = ['SCHEMA_OUTPUT_DIR', 'MIGRATIONS_DIR']
        const allRequiredVars = [
            ...requiredDbMainVars,
            ...requiredDbMigrationHistoryVars,
            ...requiredFileVars
        ]

        let missing = allRequiredVars.filter(v => !process.env[v])
        if (missing.length) throw new Error(`Missing env vars: ${missing.join(", ")}`);
    }
}