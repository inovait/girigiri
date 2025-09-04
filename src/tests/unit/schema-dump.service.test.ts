import { describe, it, beforeEach, expect, vi } from "vitest";
import type { DatabaseConfig } from "../../interface/database-config.interface.ts";
import type { FileConfig } from "../../interface/file-config.interface.ts";

// mock helpers
vi.mock("../../utils.ts", () => ({
  runMySqlCommand: vi.fn(() => Promise.resolve()),
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

// ---------------- imports after mocks ----------------
import { SchemaDumpService } from "../../service/schema-dump.service.ts";
import { runMySqlCommand } from "../../utils.ts";
import logger from "../../logging/logger.ts";
import { FileManager } from "../../manager/file.manager.ts";
import { DatabaseManager } from "../../manager/database.manager.ts";
import { MIGRATION_HISTORY_TABLE } from "../../constants/constants.ts";
import { ERROR_MESSAGES } from "../../constants/error-messages.ts";

// ---------------- Test Suite ----------------
describe("SchemaDumpService", () => {
  let schemaDumpService: SchemaDumpService;
  let databaseManager: DatabaseManager;

  const fakeDbConfig: DatabaseConfig = {
    host: "localhost",
    port: 3306,
    user: "root",
    password: "pw",
    database: "main_db",
    multipleStatements: true,
    queueLimit: 0,
    connectionLimit: 0,
    waitForConnections: true
  };

  const fakeFileConfig: FileConfig = {
    migrationsDir: "migrations",
    schemaOutputDir: "schemas",
    snapshotDir: 'snapshot'
  };

  const fakeFileName = 'fakefileName'

  beforeEach(() => {
    vi.clearAllMocks();
    databaseManager = new DatabaseManager();
    schemaDumpService = new SchemaDumpService(databaseManager);
  });

  describe("dumpSchemaBulk", () => {
    it("should run mysqldump command successfully and return the temp file path", async () => {
      const result = await schemaDumpService.mySqlDump(fakeDbConfig, fakeFileConfig, fakeFileName);

      expect(runMySqlCommand).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith("Schema succesfully dumped, returning temp file path");
      expect(result).toBe(`${fakeFileConfig.schemaOutputDir}/${fakeFileName}.sql`);
    });

    it("should create directory if it does not exist", async () => {
      (FileManager.checkDirectory as any).mockReturnValueOnce(false);

      await schemaDumpService.mySqlDump(fakeDbConfig, fakeFileConfig, fakeFileName);

      expect(FileManager.checkDirectory).toHaveBeenCalledWith(fakeFileConfig.schemaOutputDir);
      expect(FileManager.makeDirectory).toHaveBeenCalledWith(fakeFileConfig.schemaOutputDir);
      expect(logger.info).toHaveBeenCalledWith("creating directory");
    });

    it("should log error and rethrow if runCommand fails", async () => {
      (runMySqlCommand as any).mockRejectedValueOnce(new Error("fail"));

      await expect(
        schemaDumpService.mySqlDump(fakeDbConfig, fakeFileConfig, fakeFileName)
      ).rejects.toThrow("fail");

      expect(logger.error).toHaveBeenCalledWith(
        ERROR_MESSAGES.SCHEMA_DUMP.BULK,
        expect.any(Error)
      );
    });
  });

  describe("dumpSchema", () => {
    it("should create directory if not exists and dump all tables", async () => {
      (FileManager.checkDirectory as any).mockReturnValueOnce(false);

      const fakeConn = {
        query: vi.fn().mockResolvedValue([[{ TABLE_NAME: "users" }, { TABLE_NAME: "orders" }]]), // 2 tables + 5*2 schema object calls
        end: vi.fn(),
      };
      vi.spyOn(databaseManager, "connect").mockResolvedValue(fakeConn as any);

      await schemaDumpService.dumpSchema(fakeDbConfig, fakeFileConfig);

      expect(FileManager.makeDirectory).toHaveBeenCalledWith(fakeFileConfig.migrationsDir);
      expect(logger.info).toHaveBeenCalledWith(`Created directory: ${fakeFileConfig.migrationsDir}`);

      expect(runMySqlCommand).toHaveBeenCalledTimes(12); // two tables + 5*2 (because of the schema object calls)
      expect(logger.info).toHaveBeenCalledWith("Dumping table: users");
      expect(logger.info).toHaveBeenCalledWith("Dumping table: orders");
      console.log(runMySqlCommand.call);

    });

    it("should log error and stop if dumping a table fails", async () => {
      const fakeConn = {
        query: vi.fn().mockResolvedValue([[{ TABLE_NAME: "users" }, { TABLE_NAME: "orders" }]]),
        end: vi.fn(),
      };
      vi.spyOn(databaseManager, "connect").mockResolvedValue(fakeConn as any);

      (runMySqlCommand as any).mockRejectedValueOnce(new Error("table dump fail"));

      await expect(schemaDumpService.dumpSchema(fakeDbConfig, fakeFileConfig)).rejects.toThrow("table dump fail");

      expect(runMySqlCommand).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to dump procedure"),
        expect.any(Error)
      );
    });

    it("should throw and log error when getTables fails", async () => {
      vi.spyOn(databaseManager, "connect").mockRejectedValue(new Error("connection fail"));

      await expect(schemaDumpService.dumpSchema(fakeDbConfig, fakeFileConfig)).rejects.toThrow("connection fail");

      expect(logger.error).toHaveBeenCalledWith(
        ERROR_MESSAGES.SCHEMA_DUMP.FETCH_TABLES,
        expect.any(Error)
      );
    });
  });

  describe("dumpTable", () => {
    it("should successfully dump a single table and return the file path", async () => {
      const result = await schemaDumpService.dumpTable("users", fakeDbConfig, fakeFileConfig);

      expect(runMySqlCommand).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith("Dumping table: users");
      expect(result).toBe(`${fakeFileConfig.schemaOutputDir}/users.sql`);
    });

    it("should include data when dumping the migration_history table", async () => {
      await schemaDumpService.dumpTable(MIGRATION_HISTORY_TABLE, fakeDbConfig, fakeFileConfig);

      const cmd = (runMySqlCommand as any).mock.calls[0][0];
      expect(cmd).not.toContain("--no-data");
    });

    it("should exclude data for regular tables", async () => {
      await schemaDumpService.dumpTable("users", fakeDbConfig, fakeFileConfig);

      const cmd = (runMySqlCommand as any).mock.calls[0][0];
      expect(cmd).toContain("--no-data");
    });

    it("should log an error and throw if runCommand fails", async () => {
      (runMySqlCommand as any).mockRejectedValueOnce(new Error("bad table"));

      await expect(
        schemaDumpService.dumpTable("users", fakeDbConfig, fakeFileConfig)
      ).rejects.toThrow("bad table");

      expect(logger.error).toHaveBeenCalledWith(
        ERROR_MESSAGES.SCHEMA_DUMP.TABLE("users"),
        expect.any(Error)
      );
    });
  });
});