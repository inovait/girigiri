// tests/schema-dump.service.test.ts
import { describe, it, beforeEach, expect, vi } from "vitest";
import type { DatabaseConfig } from "../../interface/database-config.interface.ts";
import type { FileConfig } from "../../interface/file-config.interface.ts";

// mock helpers
vi.mock("../../helpers.ts", () => ({
  runCommand: vi.fn(() => Promise.resolve()),
}));

// mock logger
vi.mock("../../logging/logger.ts", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// mock file manager
vi.mock("../../manager/file.manager.ts", () => ({
  FileManager: {
    checkDirectory: vi.fn(() => true),
    makeDirectory: vi.fn(),
  },
}));

// mock constants
vi.mock("../../constants/constants.ts", () => ({
  MIGRATION_HISTORY_TABLE: "migration_history",
  TEMP_PREFIX: "tmp",
}));

// mock error messages
vi.mock("../../constants/error-messages.ts", () => ({
  ERROR_MESSAGES: {
    SCHEMA_DUMP: {
      BULK: "Error while dumping schema",
      TABLE: (table?: string) =>
        table ? `Error while dumping table: ${table}` : "Error while dumping table",
      STOP_DUE_TO_ERROR: "Stopping table dumping due to error",
      FETCH_TABLES: "Error while fetching tables",
    },
  },
}));

// ---------------- imports after mocks ----------------
import { SchemaDumpService } from "../../service/schema-dump.service.ts";
import { runCommand } from "../../helpers.ts";
import logger from "../../logging/logger.ts";
import { FileManager } from "../../manager/file.manager.ts";
import { ConfigManager } from "../../manager/config.manager.ts";
import { DatabaseManager } from "../../manager/database.manager.ts";
import { Config } from "../../interface/config.interface.ts";
import { MIGRATION_HISTORY_TABLE } from "../../constants/constants.ts";
import { ERROR_MESSAGES } from "../../constants/error-messages.ts";

// ---------------- Test Suite ----------------
describe("SchemaDumpService", () => {
  let schemaDumpService: SchemaDumpService;
  let databaseManager: DatabaseManager;

  const fakeConfig = {
    mainDatabaseConfig: {
      host: "localhost",
      port: 3306,
      user: "root",
      password: "pw",
      database: "main_db",
    } as DatabaseConfig,
    fileConfig: {
      migrationsDir: "migrations",
      schemaOutputDir: "schemas",
    } as FileConfig,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    const configManager = ConfigManager.getInstance();
    // set a fake config
    vi.spyOn(configManager, "getConfig").mockReturnValue(fakeConfig as Config);
    // instantiate db manager
    databaseManager = new DatabaseManager();
    schemaDumpService = new SchemaDumpService(configManager, databaseManager);
  });

  describe("dumpSchemaBulk", () => {
    it("should run mysqldump command successfully", async () => {
      await schemaDumpService.dumpSchemaBulk(
        fakeConfig.mainDatabaseConfig,
        fakeConfig.fileConfig
      );

      expect(runCommand).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith("Schema succesfully dumped");
    });

    it("should log error using ERROR_MESSAGES and rethrow if runCommand fails", async () => {
      (runCommand as any).mockRejectedValueOnce(new Error("fail"));

      await expect(
        schemaDumpService.dumpSchemaBulk(fakeConfig.mainDatabaseConfig, fakeConfig.fileConfig)
      ).rejects.toThrow("fail");

      expect(logger.error).toHaveBeenCalledWith(
        ERROR_MESSAGES.SCHEMA_DUMP.BULK,
        expect.any(Error)
      );
    });
  });

  describe("dumpSchema", () => {
    it("should create directory if not exists and dump tables", async () => {
      // mock checkDirectory to "not exist"
      (FileManager.checkDirectory as any).mockReturnValueOnce(false);

      const fakeConn = {
        query: vi.fn().mockResolvedValue([[{ TABLE_NAME: "users" }, { TABLE_NAME: "orders" }]]),
        end: vi.fn(),
      };
      vi.spyOn(databaseManager, "connect").mockResolvedValue(fakeConn as any);

      await schemaDumpService.dumpSchema();

      expect(FileManager.makeDirectory).toHaveBeenCalledWith("migrations");
      expect(runCommand).toHaveBeenCalledTimes(2); // two tables
      expect(logger.info).toHaveBeenCalledWith("Created directory: migrations");
    });

    it("should throw if dumping a table fails and log error using ERROR_MESSAGES", async () => {
      const fakeConn = {
        query: vi.fn().mockResolvedValue([[{ TABLE_NAME: "users" }]]),
        end: vi.fn(),
      };
      vi.spyOn(databaseManager, "connect").mockResolvedValue(fakeConn as any);

      (runCommand as any).mockRejectedValueOnce(new Error("table dump fail"));

      await expect(schemaDumpService.dumpSchema()).rejects.toThrow("table dump fail");
      expect(logger.error).toHaveBeenCalledWith(
        ERROR_MESSAGES.SCHEMA_DUMP.STOP_DUE_TO_ERROR,
        expect.any(Error)
      );
    });

    it("should log error using ERROR_MESSAGES when getTables fails", async () => {
      const fakeConn = {
        query: vi.fn().mockRejectedValue(new Error("connection fail")),
        end: vi.fn(),
      };
      vi.spyOn(databaseManager, "connect").mockResolvedValue(fakeConn as any);

      await expect(schemaDumpService.dumpSchema()).rejects.toThrow("connection fail");
      expect(logger.error).toHaveBeenCalledWith(
        ERROR_MESSAGES.SCHEMA_DUMP.FETCH_TABLES,
        expect.any(Error)
      );
    });
  });

  describe("dumpTable", () => {
    it("should run mysqldump for a normal table", async () => {
      await schemaDumpService.dumpTable(
        "users",
        fakeConfig.mainDatabaseConfig,
        fakeConfig.fileConfig
      );

      expect(runCommand).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith("Dumping table: users");
      expect(logger.info).toHaveBeenCalledWith("Table succesfully dumped");
    });

    it("should include data when dumping migration_history using MIGRATION_HISTORY_TABLE constant", async () => {
      await schemaDumpService.dumpTable(
        MIGRATION_HISTORY_TABLE,
        fakeConfig.mainDatabaseConfig,
        fakeConfig.fileConfig
      );

      // - [0][0] -- access the first call of the mock, access the first argument of call
      // - can check if the command string was build correctly without triggering the
      const cmd = (runCommand as any).mock.calls[0][0];
      expect(cmd).not.toContain("--no-data"); // should not contain --no-data
    });

    it("should include data when dumping hardcoded migration_history table name", async () => {
      await schemaDumpService.dumpTable(
        "migration_history", // hardcoded string for backward compatibility test
        fakeConfig.mainDatabaseConfig,
        fakeConfig.fileConfig
      );

      const cmd = (runCommand as any).mock.calls[0][0];
      expect(cmd).not.toContain("--no-data");
    });

    it("should log error using ERROR_MESSAGES and throw if runCommand fails", async () => {
      (runCommand as any).mockRejectedValueOnce(new Error("bad table"));

      await expect(
        schemaDumpService.dumpTable("users", fakeConfig.mainDatabaseConfig, fakeConfig.fileConfig)
      ).rejects.toThrow("bad table");

      expect(logger.error).toHaveBeenCalledWith(
        ERROR_MESSAGES.SCHEMA_DUMP.TABLE("users"),
        expect.any(Error)
      );
    });

    it("should log generic table error message when table name is undefined", async () => {
      (runCommand as any).mockRejectedValueOnce(new Error("bad table"));

      // Simulate a scenario where table name might be undefined
      const tableName = undefined as any;
      await expect(
        schemaDumpService.dumpTable(tableName, fakeConfig.mainDatabaseConfig, fakeConfig.fileConfig)
      ).rejects.toThrow("bad table");

      expect(logger.error).toHaveBeenCalledWith(
        ERROR_MESSAGES.SCHEMA_DUMP.TABLE(tableName),
        expect.any(Error)
      );
    });
  });

  describe("Constants Integration", () => {
    it("should use MIGRATION_HISTORY_TABLE constant correctly", () => {
      expect(MIGRATION_HISTORY_TABLE).toBe("migration_history");
    });

    it("should use ERROR_MESSAGES constants correctly", () => {
      expect(ERROR_MESSAGES.SCHEMA_DUMP.BULK).toBe("Error while dumping schema");
      expect(ERROR_MESSAGES.SCHEMA_DUMP.TABLE("test_table")).toBe("Error while dumping table: test_table");
      expect(ERROR_MESSAGES.SCHEMA_DUMP.TABLE()).toBe("Error while dumping table");
      expect(ERROR_MESSAGES.SCHEMA_DUMP.STOP_DUE_TO_ERROR).toBe("Stopping table dumping due to error");
      expect(ERROR_MESSAGES.SCHEMA_DUMP.FETCH_TABLES).toBe("Error while fetching tables");
    });
  });
});