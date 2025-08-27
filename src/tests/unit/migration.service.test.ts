import { describe, it, beforeEach, expect, vi, Mock } from "vitest";
import type { DatabaseConfig } from "../../interface/database-config.interface.ts";
import dotenv from "dotenv";

dotenv.config();
const mockMigrationSql: string = "001_migration.sql"

// mock helpers
vi.mock("../../helpers.ts", () => ({
    runCommand: vi.fn(() => Promise.resolve()), // always succeed
}));

// mock logger
vi.mock("../../logging/logger.ts", () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// mock file manager
vi.mock("../../manager/file.manager.ts", () => ({
    FileManager: {
        readFile: vi.fn(() => "CREATE TABLE dummy;"),
        readDirectory: vi.fn(() => [mockMigrationSql]),
        fileExists: vi.fn(() => true),
        removeFile: vi.fn(),
    },
}));

const mainDatabaseConfig: DatabaseConfig = {
                host: "localhost",
                port: 3306,
                user: "root",
                password: "pw",
                database: "main_db",
                waitForConnections: true,
                multipleStatements: true,
                connectionLimit: 10,
                queueLimit: 0
            }

const migrationDatabaseConfig: DatabaseConfig = {
                host: "localhost",
                port: 3306,
                user: "root",
                password: "pw",
                database: "mig_db",
                waitForConnections: true,
                multipleStatements: true,
                connectionLimit: 10,
                queueLimit: 0
            }

const fileConfig: FileConfig = { migrationsDir: "migrations",
                schemaOutputDir: "schemas",}



// mock SchemaDumpService
vi.mock("../../service/schema-dump.service.ts", () => ({
    SchemaDumpService: vi.fn(() => ({
        dumpSchemaBulk: vi.fn(() => Promise.resolve()),
        dumpTable: vi.fn(() => Promise.resolve()),
    })),
}));

// ------------------ Imports AFTER mocks ------------------
import { MigrationService } from "../../service/migration.service.ts";
import { ConfigManager } from "../../manager/config.manager.ts";
import { DatabaseManager } from "../../manager/database.manager.ts";
import { FileManager } from "../../manager/file.manager.ts";
import { SchemaDumpService } from "../../service/schema-dump.service.ts";
import logger from "../../logging/logger.ts";
import { FileConfig } from "../../interface/file-config.interface.ts";

// ------------------ Test Suite ------------------

describe("MigrationService - checkMigrations", () => {
    let configManager: ConfigManager;
    let databaseManager: DatabaseManager;

    beforeEach(() => {
        configManager = ConfigManager.getInstance();

        vi.spyOn(configManager, "getConfig").mockReturnValue({
            mainDatabaseConfig, migrationDatabaseConfig, fileConfig
        });

        databaseManager = new DatabaseManager();
    });

    describe("success", () => {
        let migrationService: MigrationService;

        beforeEach(() => {
            const fakeConnection = {
                end: vi.fn(),
                query: vi.fn().mockResolvedValue([[]]),
                execute: vi.fn().mockResolvedValue([[]]),
                beginTransaction: vi.fn().mockResolvedValue(undefined),
                commit: vi.fn().mockResolvedValue(undefined),
                rollback: vi.fn().mockResolvedValue(undefined),
            };
            vi.spyOn(databaseManager, "connect").mockResolvedValue(fakeConnection as any);
            vi.spyOn(databaseManager, "createDatabase").mockResolvedValue();
            vi.spyOn(databaseManager, "dropDatabase").mockResolvedValue();
            vi.spyOn(databaseManager, "tableExists").mockResolvedValue(true);

            migrationService = new MigrationService(configManager, databaseManager);
        });

        it("should run checkMigrations succesfully", async () => {
            await migrationService.checkMigrations();

            // Verify logger calls ( check if succesfully migrated and if validation was completed succesfully)
            expect(logger.info).toHaveBeenCalledWith("Starting migration validation...");
            expect(logger.info).toHaveBeenCalledWith(`Applying migration: ${mockMigrationSql}`)
            expect(logger.info).toHaveBeenCalledWith(`Applied migration successfully: ${mockMigrationSql}`)
            expect(logger.info).toHaveBeenCalledWith("Migration validation completed successfully");

            // Verify DatabaseManager methods
            expect(databaseManager.createDatabase).toHaveBeenCalled();
            expect(databaseManager.connect).toHaveBeenCalled();
            expect(databaseManager.dropDatabase).toHaveBeenCalled();

            // Verify FileManager methods
            expect(FileManager.readFile).toHaveBeenCalled();
            expect(FileManager.readDirectory).toHaveBeenCalled();
            expect(FileManager.fileExists).toHaveBeenCalled();

            // Verify SchemaDumpService was instantiated
            expect((SchemaDumpService as unknown as Mock).mock.instances.length).toBeGreaterThan(0);
        });
    });

    describe("failure", () => {
        let migrationService: MigrationService;

        beforeEach(() => {
            const failingConnection = {
                end: vi.fn(),
                query: vi.fn().mockImplementation(() => Promise.reject(new Error("Migration failed"))),
                execute: vi.fn().mockResolvedValue([[]]),
                beginTransaction: vi.fn().mockResolvedValue(undefined),
                commit: vi.fn().mockResolvedValue(undefined),
                rollback: vi.fn().mockResolvedValue(undefined),
            };

            vi.spyOn(databaseManager, "connect").mockResolvedValue(failingConnection as any);
            vi.spyOn(databaseManager, "createDatabase").mockResolvedValue();
            vi.spyOn(databaseManager, "dropDatabase").mockResolvedValue();
            vi.spyOn(databaseManager, "tableExists").mockResolvedValue(true);

            migrationService = new MigrationService(configManager, databaseManager);
        });

        it("should throw an error if a migration fails", async () => {
            await expect(migrationService.checkMigrations()).rejects.toThrow("Migration failed");

            const conn = await databaseManager.connect({} as DatabaseConfig);
            expect(conn.rollback).toHaveBeenCalled();

            expect(logger.error).toHaveBeenCalledWith(
                `Failed migration: ${mockMigrationSql}. Rolling back changes`
            );
        });
    });
});


describe("MigrationService - migrate", () => {
    let migrationService: MigrationService;
    let configManager: ConfigManager;
    let databaseManager: DatabaseManager;

    beforeEach(() => {
        vi.clearAllMocks();

        configManager = ConfigManager.getInstance();
        vi.spyOn(configManager, "getConfig").mockReturnValue({
            mainDatabaseConfig, migrationDatabaseConfig, fileConfig
        });

        databaseManager = new DatabaseManager();
        migrationService = new MigrationService(configManager, databaseManager);
    });

    it("should run migrations successfully", async () => {
        const fakeConn = {
            query: vi.fn().mockResolvedValue([[]]),
            execute: vi.fn().mockResolvedValue([[]]),
            beginTransaction: vi.fn().mockResolvedValue(undefined),
            commit: vi.fn().mockResolvedValue(undefined),
            rollback: vi.fn().mockResolvedValue(undefined),
            end: vi.fn(),
        };

        vi.spyOn(databaseManager, "connect").mockResolvedValue(fakeConn as any);

        await migrationService.migrate();

        expect(databaseManager.connect).toHaveBeenCalled();
        expect(fakeConn.beginTransaction).toHaveBeenCalled();
        expect(fakeConn.commit).toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledWith(
            `Applied migration successfully: ${mockMigrationSql}`
        );
    });

    it("should rollback and log error if migration fails (negative)", async () => {
        const fakeConn = {
            query: vi.fn().mockRejectedValue(new Error("Migration failed")),
            execute: vi.fn().mockResolvedValue([[]]),
            beginTransaction: vi.fn().mockResolvedValue(undefined),
            commit: vi.fn().mockResolvedValue(undefined),
            rollback: vi.fn().mockResolvedValue(undefined),
            end: vi.fn(),
        };

        vi.spyOn(databaseManager, "connect").mockResolvedValue(fakeConn as any);

        await expect(migrationService.migrate()).rejects.toThrow("Migration failed");

        expect(fakeConn.rollback).toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(
            `Failed migration: ${mockMigrationSql}. Rolling back changes`
        );
    });
});