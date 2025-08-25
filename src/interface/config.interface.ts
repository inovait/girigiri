
import type { DatabaseConfig } from "./database-config.interface.ts";
import type { FileConfig } from "./file-config.interface.ts";

export interface Config {
    mainDatabaseConfig: DatabaseConfig
    migrationDatabaseConfig: DatabaseConfig
    fileConfig: FileConfig
}