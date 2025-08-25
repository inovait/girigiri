// src/main.ts
import { Command } from "commander";
import { MigrationService } from "./service/migration.service.ts";
import { SchemaDumpService } from "./service/schema-dump.service.ts";
import { ConfigManager } from "./manager/config.manager.ts";
import { DatabaseManager } from "./manager/database.manager.ts";
const program = new Command();


program
  .command("migrate")
  .description("Run database migrations")
  .action(async () => {
    // load configuration data
    // initialize database
    // initialize service ( pass in configuration data )
    // wrap in try catch
    try {
      let configManager = new ConfigManager()
      let databaseManager = new DatabaseManager()
      let migrationService = new MigrationService(configManager, databaseManager)
      migrationService.migrate()
      console.log("Running migrations");
    } catch (err) {
      console.error("Migration failed:", err);

    }

  });

program
  .command("dump:schema")
  .action(async () => {
    let configManager = new ConfigManager()
    let databaseManager = new DatabaseManager()
    let schemaDumpService = new SchemaDumpService(configManager, databaseManager);
    await schemaDumpService.dumpSchema()
    console.log('Dumping database');
  });

program
  .command("check:migrations")
  .description("Run checks")
  .action(() => {
    //let migrationService = new MigrationService()
    //migrationService.validateMigrations()
    console.log("Running migrations check");
  });

program.parse(process.argv);
