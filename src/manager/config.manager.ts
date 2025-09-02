import dotenv from 'dotenv';
import type { Config } from "../interface/config.interface.ts";
import type { DatabaseConfig } from "../interface/database-config.interface.ts";
import type { FileConfig } from "../interface/file-config.interface.ts";
import { ERROR_MESSAGES } from "../constants/error-messages.ts";

dotenv.config();

export class ConfigManager {
    private static instance: ConfigManager;
    private config: Config | null = null;

    private constructor() {}

    public static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }

    public getConfig(): Config {
        if (!this.config) {
            this.validateEnvironmentVariables();
            this.config = this.loadConfiguration();
        }
        return this.config;
    }

    public setConfig(config: Config): void {
        this.config = config;
    }

    public setFileConfig(fileConfig: FileConfig): void {
        this.ensureConfigLoaded();
        this.config!.fileConfig = fileConfig;
    }

    public setMainDatabaseConfig(databaseConfig: DatabaseConfig): void {
        this.ensureConfigLoaded();
        this.config!.mainDatabaseConfig = databaseConfig;
    }

    public setMigrationDatabaseConfig(databaseConfig: DatabaseConfig): void {
        this.ensureConfigLoaded();
        this.config!.tempDatabaseConfig = databaseConfig;
    }

    private ensureConfigLoaded(): void {
        if (!this.config) {
            this.config = this.getConfig();
        }
    }

    private loadConfiguration(): Config {
        try {
            return {
                tempDatabaseConfig: this.createMigrationDatabaseConfig(),
                mainDatabaseConfig: this.createMainDatabaseConfig(),
                fileConfig: this.createFileConfig(),
            };
        } catch (error) {
            throw new Error(ERROR_MESSAGES.CONFIG.LOAD);
        }
    }

    private createMigrationDatabaseConfig(): DatabaseConfig {
        return {
            user: this.getRequiredEnvVar('DB_MIGRATION_USER'),
            password: this.getRequiredEnvVar('DB_MIGRATION_PASSWORD'),
            host: this.getEnvVar('DB_MIGRATION_HOST', 'localhost'),
            port: this.getEnvVarAsNumber('DB_MIGRATION_PORT', 5432),
            database: this.getRequiredEnvVar('DB_MIGRATION_NAME'),
            waitForConnections: true,
            multipleStatements: true,
            connectionLimit: 10,
            queueLimit: 0 
        };
    }

    private createMainDatabaseConfig(): DatabaseConfig {
        return {
            user: this.getRequiredEnvVar('DB_USER'),
            password: this.getRequiredEnvVar('DB_PASSWORD'),
            host: this.getEnvVar('DB_HOST', 'localhost'),
            port: this.getEnvVarAsNumber('DB_PORT', 5432), // Fixed: was using DB_MIGRATION_PORT
            database: this.getRequiredEnvVar('DB_NAME'),
            waitForConnections: true,
            multipleStatements: true,
            connectionLimit: 10,
            queueLimit: 0
        };
    }

    private createFileConfig(): FileConfig {
        return {
            schemaOutputDir: this.getEnvVar('SCHEMA_OUTPUT_DIR', 'dist/schema'),
            migrationsDir: this.getEnvVar('MIGRATIONS_DIR', 'dist/migrations'),
            snapshotDir: this.getEnvVar('SCHEMA_SNAPSHOT_DIR', 'dist/snapshot')
        };
    }

    private getRequiredEnvVar(name: string): string {
        const value = process.env[name];
        if (!value) {
            throw new Error(`Required environment variable ${name} is not set`);
        }
        return value;
    }

    private getEnvVar(name: string, defaultValue: string): string {
        return process.env[name] || defaultValue;
    }

    private getEnvVarAsNumber(name: string, defaultValue: number): number {
        const value = process.env[name];
        if (!value) return defaultValue;
        
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
            throw new Error(`Environment variable ${name} must be a valid number, got: ${value}`);
        }
        return parsed;
    }

    private validateEnvironmentVariables(): void {
        const requiredVars: Record<string, string[]> = {
            'Main Database': ['DB_USER', 'DB_PASSWORD', 'DB_HOST', 'DB_PORT', 'DB_NAME'],
            'Migration Database': ['DB_MIGRATION_USER', 'DB_MIGRATION_PASSWORD', 'DB_MIGRATION_HOST', 'DB_MIGRATION_PORT', 'DB_MIGRATION_NAME'],
            'File Configuration': ['SCHEMA_OUTPUT_DIR', 'MIGRATIONS_DIR']
        };

        const errors: string[] = [];

        Object.entries(requiredVars).forEach(([category, vars]) => {
            const missing = vars.filter(varName => !process.env[varName]);
            if (missing.length > 0) {
                errors.push(`${category}: ${missing.join(', ')}`);
            }
        });

        if (errors.length > 0) {
            throw new Error(`Missing required environment variables:\n${errors.map(e => `  - ${e}`).join('\n')}`);
        }
    }
}