// src/main.ts
import { Command } from "commander";
import { MigrationService } from "./service/migration.service.js";
import { SchemaDumpService } from "./service/schema-dump.service.js";
import { ConfigManager } from "./manager/config.manager.js";
import { DatabaseManager } from "./manager/database.manager.js";
import logger from "./logging/logger.js";
import { FileManager } from "./manager/file.manager.js";

const configManager = ConfigManager.getInstance();
const databaseManager = new DatabaseManager();
const migrationService = new MigrationService(configManager, databaseManager);
const schemaDumpService = new SchemaDumpService(databaseManager);


async function runCliAction(
  action: () => Promise<void>,
  successMessage: string
) {
  try {
    await action();
    logger.info(successMessage);
    process.exit(0);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.stack || err.message : String(err);
    //logger.error(`Action failed:\n${errorMessage}`);
    process.exit(1); 
  }
}


const program = new Command();

program
  .command("migrate")
  .description("Run database migrations against the main database")
  .action(() =>
    runCliAction(async () => {
      const config = configManager.getConfig();
      const connection = await databaseManager.connect(config.mainDatabaseConfig);
      await migrationService.migrate(
        connection,
        config.mainDatabaseConfig,
        config.fileConfig
      );
    }, "Migrations completed successfully")
  );

program
  .command("dump:schema")
  .description("Dump the schema of the main database")
  .action(() =>
    runCliAction(async () => {
      const config = configManager.getConfig();
      // first remove the dump files - clean dump
      FileManager.removeDirectory(config.fileConfig.schemaOutputDir)
      await schemaDumpService.dumpSchema(
        config.mainDatabaseConfig,
        config.fileConfig
      );
    }, "Schema dumped successfully")
  );

program
  .command("check:migrations")
  .description("Validate migrations against a temporary database")
  .action(() =>
    runCliAction(async () => {
      await migrationService.checkMigrations();
    }, "Migration check completed successfully")
  );

program.parse(process.argv);