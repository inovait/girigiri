import { describe, it, beforeEach, expect, vi, Mock } from "vitest";
import type { DatabaseConfig } from "../../interface/database-config.interface.ts";
import { MigrationService } from "../../service/migration.service.ts";
import { ConfigManager } from "../../manager/config.manager.ts";
import { DatabaseManager } from "../../manager/database.manager.ts";
import { FileManager } from "../../manager/file.manager.ts";
import { SchemaDumpService } from "../../service/schema-dump.service.ts";
import logger from "../../logging/logger.ts";
import type { FileConfig } from "../../interface/file-config.interface.ts";
import { runMySqlCommand } from "../../utils.ts";
import { ERROR_MESSAGES } from "../../constants/error-messages.ts";
import { MAIN_DB_TMP, MIGRATION_HISTORY_TABLE } from "../../constants/constants.ts";
import { SchemaComparisonService } from "../../service/schema-comparison.service.ts";

const mockMigrationSql = "001_migration.sql";

// mock dependencies
vi.mock("../../utils.ts", () => ({
    runMySqlCommand: vi.fn(() => Promise.resolve()),
    getPaths: vi.fn(() => ({ __dirname: "/fake/dir" })),
    execAsync: vi.fn()
}));

vi.mock("../../logging/logger.ts", () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../manager/file.manager.ts", () => ({
    FileManager: {
        readFile: vi.fn(() => "CREATE TABLE dummy;"),
        readDirectory: vi.fn(() => [mockMigrationSql]),
        fileExists: vi.fn(() => true),
        removeFile: vi.fn(),
        checkDirectory: vi.fn(() => true)
    },
}));

vi.mock("../../service/schema-dump.service.ts");
vi.mock("../../service/schema-comparison.service.ts")

// ---------------- imports after mocks ----------------
const mainDatabaseConfig: DatabaseConfig = {
    host: "localhost", port: 3306, user: "root", password: "pw", database: "main_db",
    waitForConnections: true, multipleStatements: true, connectionLimit: 10, queueLimit: 0
};
const migrationDatabaseConfig: DatabaseConfig = {
    host: "localhost", port: 3306, user: "root", password: "pw", database: "mig_db",
    waitForConnections: true, multipleStatements: true, connectionLimit: 10, queueLimit: 0
};
const fileConfig: FileConfig = { migrationsDir: "migrations", schemaOutputDir: "schemas", snapshotDir: "/snapshot" };

const mockSchemaDumpService = {
    mySqlDump: vi.fn(() => Promise.resolve('dump/path/schema.sql')),
    dumpTable: vi.fn(() => Promise.resolve('dump/path/table.sql')),
    dumpSchema: vi.fn(() => Promise.resolve())
};

const mockSchemaComparisonService = {
    compareSchemasBash: vi.fn(() => Promise.resolve()),
    formatResult: vi.fn((isIdentical: boolean) => isIdentical ? 'Schemas are identical.' : 'Schemas differ.')
}

// ---------------- Test Suite ----------------
 
describe("MigrationService", () => {
    let configManager: ConfigManager;
    let databaseManager: DatabaseManager;
    let migrationService: MigrationService;
    let fakeConnection: any;

    beforeEach(() => {
        vi.clearAllMocks();
        // reset mocks
        fakeConnection = {
            end: vi.fn(),
            query: vi.fn().mockResolvedValue([[]]),
            execute: vi.fn().mockResolvedValue([[]]),
            beginTransaction: vi.fn().mockResolvedValue(undefined),
            commit: vi.fn().mockResolvedValue(undefined),
            rollback: vi.fn().mockResolvedValue(undefined),
        };


        vi.mocked(SchemaDumpService).mockImplementation(() => mockSchemaDumpService as any);
        vi.mocked(SchemaComparisonService).mockImplementation(() => mockSchemaComparisonService as any);

        configManager = ConfigManager.getInstance();
        vi.spyOn(configManager, "getConfig").mockReturnValue({
            mainDatabaseConfig, tempDatabaseConfig: migrationDatabaseConfig, fileConfig
        });

        databaseManager = new DatabaseManager();
        vi.spyOn(databaseManager, "connect").mockResolvedValue(fakeConnection as any);
        vi.spyOn(databaseManager, "createDatabase").mockResolvedValue();
        vi.spyOn(databaseManager, "dropDatabase").mockResolvedValue();
        vi.spyOn(databaseManager, "tableExists").mockResolvedValue(true);

        migrationService = new MigrationService(configManager, databaseManager);
    });

    describe("checkMigrations", () => {
        it("should run the full validation process successfully", async () => {    
            vi.spyOn(mockSchemaComparisonService as any, 'compareSchemasBash').mockResolvedValue({isIdentical: true, diff: ''});
            await expect(migrationService.checkMigrations()).resolves.toBeUndefined();

            expect(mockSchemaDumpService.mySqlDump).toHaveBeenCalledWith(mainDatabaseConfig, fileConfig, MAIN_DB_TMP);
            expect(mockSchemaDumpService.dumpTable).toHaveBeenCalledWith(MIGRATION_HISTORY_TABLE, mainDatabaseConfig, fileConfig);
            expect(databaseManager.createDatabase).toHaveBeenCalledWith(expect.anything(), migrationDatabaseConfig.database);
            expect(runMySqlCommand).toHaveBeenCalled(); 

            expect(logger.info).toHaveBeenCalledWith(`Applying migration: ${mockMigrationSql}`);
            expect(logger.info).toHaveBeenCalledWith(`Applied migration successfully: ${mockMigrationSql}`);
            
            // assert that it completed successfully
            expect(logger.info).toHaveBeenCalledWith('Check migrations completed successfully');
        });


        it("should exit early when no unapplied migrations are found", async () => {
            // setup the migration file so that it is already applied
            vi.spyOn(FileManager, "readDirectory").mockReturnValue([mockMigrationSql]);
            (fakeConnection.execute as Mock).mockResolvedValueOnce([[{ name: mockMigrationSql }]]);

            await migrationService.checkMigrations();

            // assert that it exists early
            expect(logger.info).toHaveBeenCalledWith("No unapplied migrations. Exiting");
            expect(logger.info).not.toHaveBeenCalledWith("Unapplied migrations found. Setting up temporary database...");
            expect(databaseManager.createDatabase).not.toHaveBeenCalled();
        });

        it("should throw and log an error if migration validation fails", async () => {
            (fakeConnection.query as Mock).mockRejectedValue(new Error("Migration failed"));

            await expect(migrationService.checkMigrations()).rejects.toThrow("Migration failed");

            expect(logger.error).toHaveBeenCalledWith(
                ERROR_MESSAGES.MIGRATION.VALIDATION,
                expect.any(Error)
            );
        });
    });

    describe("migrate", () => {
        it("should apply unapplied migrations successfully", async () => {
            (fakeConnection.execute as Mock).mockResolvedValue([[]]);

            await migrationService.migrate(fakeConnection as any, mainDatabaseConfig, fileConfig);

            expect(fakeConnection.beginTransaction).toHaveBeenCalled();
            expect(fakeConnection.query).toHaveBeenCalledWith("CREATE TABLE dummy;");
            expect(fakeConnection.query).toHaveBeenCalledWith(
                `INSERT INTO migration_history (name) VALUES (?)`, [mockMigrationSql]
            );
            expect(fakeConnection.commit).toHaveBeenCalled();
            expect(logger.info).toHaveBeenCalledWith(`Applied migration successfully: ${mockMigrationSql}`);
        });

        it("should skip already applied migrations", async () => {
           (fakeConnection.execute as Mock)
                .mockResolvedValue([[{ name: mockMigrationSql }]]); // For getAppliedMigrations

            await migrationService.migrate(fakeConnection as any, mainDatabaseConfig, fileConfig);

            expect(logger.info).toHaveBeenCalledWith(`No outstanding migrations. Ending application`);
            expect(fakeConnection.beginTransaction).not.toHaveBeenCalled();
        });

        it("should rollback, throw, and log an error if a migration fails", async () => {
            const migrationError = new Error("Migration SQL failed");
            (fakeConnection.query as Mock).mockRejectedValueOnce(migrationError);
            (fakeConnection.execute as Mock).mockResolvedValue([[]]);

            await expect(migrationService.migrate(fakeConnection as any, mainDatabaseConfig, fileConfig)).rejects.toThrow(migrationError);

            expect(fakeConnection.rollback).toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(ERROR_MESSAGES.MIGRATION.FAILED_MIGRATION(mockMigrationSql));
        });
    });
});