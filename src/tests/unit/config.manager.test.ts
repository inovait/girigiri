// __tests__/config.manager.test.ts
import { describe, it, beforeEach, expect, vi } from "vitest";
import { ConfigManager } from "../../manager/config.manager.ts";
import type { Config } from "../../interface/config.interface.ts";

describe("ConfigManager", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // B+backup original process.env
    originalEnv = { ...process.env };

    // clear singleton instance
    (ConfigManager as any).instance = undefined;
  });

  afterEach(() => {
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
    expect(config.migrationDatabaseConfig.database).toBe("mig_db");
    expect(config.fileConfig.schemaOutputDir).toBe("/tmp/schema");
    expect(config.fileConfig.migrationsDir).toBe("/tmp/migrations");
  });

  it("should allow overriding the config using setConfig", () => {
    const manager = ConfigManager.getInstance();
    const fakeConfig: Config = {
      mainDatabaseConfig: { user: "x", password: "y", host: "z", port: 1, database: "db", waitForConnections:true, multipleStatements:true, connectionLimit:1, queueLimit:1 },
      migrationDatabaseConfig: { user: "a", password: "b", host: "c", port: 2, database: "mig_db", waitForConnections:true, multipleStatements:true, connectionLimit:1, queueLimit:1 },
      fileConfig: { migrationsDir: "mig", schemaOutputDir: "schema" }
    };

    manager.setConfig(fakeConfig);
    const config = manager.getConfig();
    expect(config).toEqual(fakeConfig);
  });

  it("should allow overriding fileConfig using setFileConfig", () => {
    const manager = ConfigManager.getInstance();
    const fileConfig = { migrationsDir: "mig2", schemaOutputDir: "schema2" };
    manager.setConfig({
      mainDatabaseConfig: { user: "x", password: "y", host: "z", port: 1, database: "db", waitForConnections:true, multipleStatements:true, connectionLimit:1, queueLimit:1 },
      migrationDatabaseConfig: { user: "a", password: "b", host: "c", port: 2, database: "mig_db", waitForConnections:true, multipleStatements:true, connectionLimit:1, queueLimit:1 },
      fileConfig: { migrationsDir: "mig", schemaOutputDir: "schema" }
    });
    manager.setFileConfig(fileConfig);

    expect(manager.getConfig().fileConfig).toEqual(fileConfig);
  });

  it("should allow overriding mainDatabaseConfig using setMainDatabaseConfig", () => {
    const manager = ConfigManager.getInstance();
    const newMainDbConfig = { user: "u", password: "p", host: "h", port: 1234, database: "db2", waitForConnections:true, multipleStatements:true, connectionLimit:2, queueLimit:2 };
    manager.setConfig({
      mainDatabaseConfig: { user: "x", password: "y", host: "z", port: 1, database: "db", waitForConnections:true, multipleStatements:true, connectionLimit:1, queueLimit:1 },
      migrationDatabaseConfig: { user: "a", password: "b", host: "c", port: 2, database: "mig_db", waitForConnections:true, multipleStatements:true, connectionLimit:1, queueLimit:1 },
      fileConfig: { migrationsDir: "mig", schemaOutputDir: "schema" }
    });

    manager.setMainDatabaseConfig(newMainDbConfig);
    expect(manager.getConfig().mainDatabaseConfig).toEqual(newMainDbConfig);
  });

  it("should allow overriding migrationDatabaseConfig using setMigrationDatabaseConfig", () => {
    const manager = ConfigManager.getInstance();
    const newMigDbConfig = { user: "u", password: "p", host: "h", port: 1234, database: "mig_db2", waitForConnections:true, multipleStatements:true, connectionLimit:2, queueLimit:2 };
    manager.setConfig({
      mainDatabaseConfig: { user: "x", password: "y", host: "z", port: 1, database: "db", waitForConnections:true, multipleStatements:true, connectionLimit:1, queueLimit:1 },
      migrationDatabaseConfig: { user: "a", password: "b", host: "c", port: 2, database: "mig_db", waitForConnections:true, multipleStatements:true, connectionLimit:1, queueLimit:1 },
      fileConfig: { migrationsDir: "mig", schemaOutputDir: "schema" }
    });

    manager.setMigrationDatabaseConfig(newMigDbConfig);
    expect(manager.getConfig().migrationDatabaseConfig).toEqual(newMigDbConfig);
  });
});
