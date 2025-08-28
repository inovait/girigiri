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
    try {
      const configManager = ConfigManager.getInstance();
      const databaseManager = new DatabaseManager();
      const migrationService = new MigrationService(configManager, databaseManager);
      
      let connection1 = await databaseManager.connect(configManager.getConfig().mainDatabaseConfig)
      let connection2 = await databaseManager.connect(configManager.getConfig().mainDatabaseConfig)

      await migrationService.migrate(connection1, connection2);
      console.log("Migrations completed successfully");
    } catch (err) {
      console.error("Migration failed:", err);
      process.exit(1);
    }
  });

program
  .command("dump:schema")
  .description("Dump current database schema")
  .action(async () => {
    try {
      const configManager = ConfigManager.getInstance();
      const databaseManager = new DatabaseManager();
      const schemaDumpService = new SchemaDumpService(configManager, databaseManager);

      await schemaDumpService.dumpSchema();
      console.log("Schema dumped successfully");
    } catch (err) {
      console.error("Schema dump failed:", err);
      process.exit(1);
    }
  });

program
  .command("check:migrations")
  .description("Check pending migrations")
  .action(async () => {
    try {
      const configManager = ConfigManager.getInstance();
      const databaseManager = new DatabaseManager();
      const migrationService = new MigrationService(configManager, databaseManager);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // ali zelis da se baza na konc dropne
      // ali zelis da se migracije izvajajo na tmp ali na main bazi


      await migrationService.checkMigrations();
      console.log("Migration check completed successfully");
    } catch (err) {
      console.error("Migration check failed:", err);
      process.exit(1);
    }
  });

program.parse(process.argv);
