import { runCommand } from "../helpers.ts";
import type { Config } from "../interface/config.interface.ts";
import type { DatabaseConfig } from "../interface/database-config.interface.ts";
import type { FileConfig } from "../interface/file-config.interface.ts";
import logger from "../logging/logger.ts";
import { ConfigManager } from "../manager/config.manager.ts";
import { DatabaseManager } from "../manager/database.manager.ts";
import { FileManager } from "../manager/file.manager.ts";
import type { Connection } from "mysql2/promise";


export class SchemaDumpService {
  private databaseManager: DatabaseManager
  private config: Config;

  constructor(configManager: ConfigManager, databaseManager: DatabaseManager) {
    this.databaseManager = databaseManager;
    this.config = configManager.getConfig();
  }

  async dumpSchemaBulk(databaseConfig: DatabaseConfig, fileConfig: FileConfig) {
    let args = [
      `-u${databaseConfig.user}`,
      `-h${databaseConfig.host}`,
      `-P${databaseConfig.port}`,
      "--no-data",
      "--single-transaction",
      "--routines",
      "--triggers",
      "--events",
      databaseConfig.database,
    ];

    let mysqldumpCmd = `mysqldump ${args.join(' ')}`;
    const dumpCommand = `${mysqldumpCmd} > ${fileConfig.schemaOutputDir}/tmp_dump.sql`;

    try {
      await runCommand(dumpCommand, this.config.mainDatabaseConfig.password)
      logger.info('Schema succesfully dumped')
    } catch (err) {
      logger.error(`Error while dumping schema. Error: ${err}`)
      throw err
    }
  }

  /**
   * dumps the schema table by table
   */
  async dumpSchema() {
    // first check if directory for outputing the migrations exists
    // create if it doesnt
    let outputDir: string = this.config.fileConfig.migrationsDir
    if (FileManager.checkDirectory(outputDir)) {
      FileManager.makeDirectory(outputDir)
      logger.info(`Created directory: ${outputDir}`);
    } else {
      logger.info(`Directory: ${outputDir} already exists`)
    }

    // retrieve the schema tables
    let tables = await this.getTables()
    for (let table of tables) {
      try {
        await this.dumpTable(table, this.config.mainDatabaseConfig, this.config.fileConfig)
      } catch (err) {
        logger.error(`Stopping table dumping due to error: ${err}`)
        throw err;
      }
    }
  }

  private async getTables() {
    let mainConnection!: Connection;
    try {
      mainConnection = await this.databaseManager.connect(this.config.mainDatabaseConfig)
      const [tables]: any[] = await mainConnection.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'`, [this.config.mainDatabaseConfig.database]);

      return tables.map((row: any) => { return row.TABLE_NAME })
    } catch (error) {
      logger.error("")
      throw error;
    } finally {
      mainConnection?.end();
    }
  }

  public async dumpTable(table: string, config: DatabaseConfig, fileConfig: FileConfig) {
    let args = [
      `-u ${config.user}`,
      `-h ${config.host}`,
      `-P ${config.port}`,
      '--no-data',
      '--compact',
      config.database,
      table
    ];

    if (table === "migration_history") {
      args = args.filter(arg => arg !== '--no-data');
    }

    let mysqldumpCmd = `mysqldump ${args.join(' ')}`;
    const dumpCommand = `${mysqldumpCmd} > ${fileConfig.schemaOutputDir}/${table}.sql`;

    try {
      logger.info(`Dumping table: ${table}`)
      await runCommand(dumpCommand, this.config.mainDatabaseConfig.password)
      logger.info('Table succesfully dumped')
    } catch (err) {
      logger.error(`Error while dumping table. Error: ${err}`)
      throw err
    }
  }
}