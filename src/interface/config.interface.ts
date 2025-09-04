
import type { DatabaseConfig } from "./database-config.interface.js";
import type { FileConfig } from "./file-config.interface.js";

export interface Config {
    mainDatabaseConfig: DatabaseConfig
    tempDatabaseConfig: DatabaseConfig
    fileConfig: FileConfig
}