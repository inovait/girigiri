// __tests__/config.manager.test.ts
import { describe, it, beforeEach, expect, vi, afterEach } from "vitest";
import { ConfigManager } from "../../manager/config.manager.ts";
import type { Config } from "../../interface/config.interface.ts";
import { FileConfig } from "../../interface/file-config.interface.ts";
import { DatabaseConfig } from "../../interface/database-config.interface.ts";

describe("ConfigManager", () => {
 
  const BASE_TEST_CONFIG: Config = {
    mainDatabaseConfig: { user: "x", password: "y", host: "z", port: 1, database: "db", waitForConnections: true, multipleStatements: true, connectionLimit: 1, queueLimit: 1 },
    tempDatabaseConfig: { user: "a", password: "b", host: "c", port: 2, database: "mig_db", waitForConnections: true, multipleStatements: true, connectionLimit: 1, queueLimit: 1 },
    fileConfig: { migrationsDir: "mig", schemaOutputDir: "schema" }
  };


  const NEW_FILE_CONFIG: FileConfig = { migrationsDir: "mig2", schemaOutputDir: "schema2" };
  const NEW_MAIN_DB_CONFIG: DatabaseConfig = { user: "u", password: "p", host: "h", port: 1234, database: "db2", waitForConnections: true, multipleStatements: true, connectionLimit: 2, queueLimit: 2 };
  const NEW_MIG_DB_CONFIG: DatabaseConfig = { user: "u", password: "p", host: "h", port: 1234, database: "mig_db2", waitForConnections: true, multipleStatements: true, connectionLimit: 2, queueLimit: 2 };
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // backup original process.env
    originalEnv = { ...process.env };
    
    (ConfigManager as any).instance = undefined;
  });

  afterEach(() => {
    // restore original process.env
    process.env = originalEnv;
  });

  it("should throw if required environment variables are missing", () => {
    // ensure no environment variables are set
    Object.keys(process.env).forEach(key => delete process.env[key]);
    const manager = ConfigManager.getInstance();
    expect(() => manager.getConfig()).toThrowError(/Missing required environment variables/);
  });

  it("should return a valid config when environment variables are set", () => {
    process.env.DB_NAME = "main_db";
    process.env.DB_MIGRATION_NAME = "mig_db";
    process.env.SCHEMA_OUTPUT_DIR = "/tmp/schema";
    process.env.MIGRATIONS_DIR = "/tmp/migrations";

    const manager = ConfigManager.getInstance();
    const config = manager.getConfig();

    expect(config.mainDatabaseConfig.database).toBe("main_db");
    expect(config.tempDatabaseConfig.database).toBe("mig_db");
    expect(config.fileConfig.schemaOutputDir).toBe("/tmp/schema");
    expect(config.fileConfig.migrationsDir).toBe("/tmp/migrations");
  });

  it("should allow overriding the config using setConfig", () => {
    const manager = ConfigManager.getInstance();
    manager.setConfig(BASE_TEST_CONFIG);
    const config = manager.getConfig();
    expect(config).toEqual(BASE_TEST_CONFIG);
  });

  it("should allow overriding fileConfig using setFileConfig", () => {
    const manager = ConfigManager.getInstance();
    // set a known initial state before testing the override
    manager.setConfig(BASE_TEST_CONFIG);
    manager.setFileConfig(NEW_FILE_CONFIG);

    expect(manager.getConfig().fileConfig).toEqual(NEW_FILE_CONFIG);
  });

  it("should allow overriding mainDatabaseConfig using setMainDatabaseConfig", () => {
    const manager = ConfigManager.getInstance();
    manager.setConfig(BASE_TEST_CONFIG);
    manager.setMainDatabaseConfig(NEW_MAIN_DB_CONFIG);

    expect(manager.getConfig().mainDatabaseConfig).toEqual(NEW_MAIN_DB_CONFIG);
  });

  it("should allow overriding migrationDatabaseConfig using setMigrationDatabaseConfig", () => {
    const manager = ConfigManager.getInstance();
    manager.setConfig(BASE_TEST_CONFIG);
    manager.setMigrationDatabaseConfig(NEW_MIG_DB_CONFIG);

    expect(manager.getConfig().tempDatabaseConfig).toEqual(NEW_MIG_DB_CONFIG);
  });
});