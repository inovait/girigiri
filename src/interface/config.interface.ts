
import type { DatabaseConfig } from "./database-config.interface.ts";
import type { FileConfig } from "./file-config.interface.ts";

export interface Config {
    mainDatabaseConfig: DatabaseConfig
    tempDatabaseConfig: DatabaseConfig
    fileConfig: FileConfig
}