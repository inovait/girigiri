import { runMySqlCommand } from "../utils.ts";
import type { DatabaseConfig } from "../interface/database-config.interface.ts";
import type { FileConfig } from "../interface/file-config.interface.ts";
import logger from "../logging/logger.ts";
import { DatabaseManager } from "../manager/database.manager.ts";
import { FileManager } from "../manager/file.manager.ts";
import { MIGRATION_HISTORY_TABLE, SELECT_EVENTS, SELECT_FUNCTIONS, SELECT_PROCEDURES, SELECT_TRIGGERS, SELECT_VIEWS } from "../constants/constants.ts";
import { ERROR_MESSAGES } from "../constants/error-messages.ts";
import type { Connection } from "mysql2/promise";
import { SCHEMA_OBJECT_TYPE } from "../enum/schema-object-type.enum.ts";
import type { SchemaObjectType } from "../enum/schema-object-type.enum.ts";
import path from "path";


export class SchemaDumpService {
  private databaseManager: DatabaseManager

  constructor(databaseManager: DatabaseManager) {
    this.databaseManager = databaseManager;
  }

  /**
   * Uses mysqldump command to dump specified database
   */
  async mySqlDump(databaseConfig: DatabaseConfig, fileConfig: FileConfig, fileName: string): Promise<string> {
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
    // ensure directory exists
    if (!FileManager.checkDirectory(fileConfig.schemaOutputDir)) {
      logger.info("creating directory")
      FileManager.makeDirectory(fileConfig.schemaOutputDir);
    }

    const dumpCommand = `${mysqldumpCmd} > ${fileConfig.schemaOutputDir}/${fileName}.sql`;

    try {
      await runMySqlCommand(dumpCommand, databaseConfig.password)
      logger.info('Schema succesfully dumped, returning temp file path')
      return `${fileConfig.schemaOutputDir}/${fileName}.sql`
    } catch (err) {
      logger.error(ERROR_MESSAGES.SCHEMA_DUMP.BULK, err);
      throw err
    }
  }

  /**
   * dumps the schema table by table
   */
  async dumpSchema(databaseConfig: DatabaseConfig, fileConfig: FileConfig) {
    // first check if directory for outputing the migrations exists
    // create if it doesnt
    let outputDir: string = fileConfig.migrationsDir
    if (!FileManager.checkDirectory(outputDir)) {
      FileManager.makeDirectory(outputDir)
      logger.info(`Created directory: ${outputDir}`);
    } else {
      logger.info(`Directory: ${outputDir} already exists`)
    }

    // retrieve the schema tables+    
    let tables = await this.getTables(databaseConfig)

    // retrieve schnema objects
    const schemaObjects = [
      { type: SCHEMA_OBJECT_TYPE.PROCEDURE, data: await this.getDatabaseObjects(databaseConfig, SCHEMA_OBJECT_TYPE.PROCEDURE) },
      { type: SCHEMA_OBJECT_TYPE.VIEW,      data: await this.getDatabaseObjects(databaseConfig, SCHEMA_OBJECT_TYPE.VIEW) },
      { type: SCHEMA_OBJECT_TYPE.EVENT,     data: await this.getDatabaseObjects(databaseConfig, SCHEMA_OBJECT_TYPE.EVENT) },
      { type: SCHEMA_OBJECT_TYPE.TRIGGER,   data: await this.getDatabaseObjects(databaseConfig, SCHEMA_OBJECT_TYPE.TRIGGER) },
      { type: SCHEMA_OBJECT_TYPE.FUNCTION,   data: await this.getDatabaseObjects(databaseConfig, SCHEMA_OBJECT_TYPE.FUNCTION) },
    ];

    // dump the database objects
    for (const { type, data } of schemaObjects) {
      for (const objectName of data) {
        try {
          await this.dumpDbObject(objectName, type, databaseConfig, fileConfig);
        } catch (err) {
          logger.error(`Failed to dump ${type} "${objectName}"`, err);
          throw new Error(ERROR_MESSAGES.SCHEMA_DUMP.FETCH_SCHEMA_OBJECTS(type))
        }
      }
    }

    // dump the tables
    for (let table of tables) {
      try {
        await this.dumpTable(table, databaseConfig, fileConfig)
      } catch (err) {
        logger.error(ERROR_MESSAGES.SCHEMA_DUMP.STOP_DUE_TO_ERROR, err);
        throw err;
      }
    }
  }

  private async dumpDbObject(objectName: string, schemaObjectType: SchemaObjectType, databaseConfig: DatabaseConfig, fileConfig: FileConfig) {
    const outputPath = path.join(`${fileConfig.schemaOutputDir}/${schemaObjectType}`, `${objectName}.sql`);
    FileManager.makeDirectory(`${fileConfig.schemaOutputDir}/${schemaObjectType}`)
    
    const dumpCommand = [
      'mysql',
      `-u${databaseConfig.user}`,
      `-h${databaseConfig.host}`,
      `-P${databaseConfig.port}`,
      '-e',
      `"SHOW CREATE ${schemaObjectType} \\\`${databaseConfig.database}\\\`.\\\`${objectName}\\\`"`
    ].join(' ');


    const fullCommand = `${dumpCommand} > "${outputPath}"`;
    await runMySqlCommand(fullCommand, databaseConfig.password, false);
    return outputPath;
  }

  private async getDatabaseObjects(databaseConfig: DatabaseConfig, routine: SchemaObjectType) {
    let mainConnection!: Connection;
    try {
      mainConnection = await this.databaseManager.connect(databaseConfig)
      let sql: string | null = null;
      switch (routine) {
        case SCHEMA_OBJECT_TYPE.PROCEDURE: sql = SELECT_PROCEDURES(databaseConfig.database!)
          break;
        case SCHEMA_OBJECT_TYPE.TRIGGER: sql = SELECT_TRIGGERS(databaseConfig.database!)
          break;
        case SCHEMA_OBJECT_TYPE.EVENT: sql = SELECT_EVENTS(databaseConfig.database!)
          break;
        case SCHEMA_OBJECT_TYPE.VIEW: sql = SELECT_VIEWS(databaseConfig.database!)
          break;
        case SCHEMA_OBJECT_TYPE.FUNCTION: sql = SELECT_FUNCTIONS(databaseConfig.database!)
          break;
        default: throw new Error("something something")
      }

      const [dbOjects]: any[] = await mainConnection.query(sql)
      return dbOjects.map((row: any) => { return row.name })
    } catch (error) {
      logger.error(ERROR_MESSAGES.SCHEMA_DUMP.FETCH_SCHEMA_OBJECTS(routine), error);
      throw error;
    } finally {
      mainConnection?.end();
    }
  }

  /**
   * Retrieves database tables
   */
  private async getTables(databaseConfig: DatabaseConfig) {
    let mainConnection!: Connection;
    try {
      mainConnection = await this.databaseManager.connect(databaseConfig)
      const [tables]: any[] = await mainConnection.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'`, [databaseConfig.database]);

      return tables.map((row: any) => { return row.TABLE_NAME })
    } catch (error) {
      logger.error(ERROR_MESSAGES.SCHEMA_DUMP.FETCH_TABLES, error);
      throw error;
    } finally {
      mainConnection?.end();
    }
  }

  private async dumpSchemaObject(objectName: string, objectType: SchemaObjectType, databaseConfig: DatabaseConfig, fileConfig: FileConfig): Promise<string> {
    try {
      switch (objectType) {
        case SCHEMA_OBJECT_TYPE.PROCEDURE:
        case SCHEMA_OBJECT_TYPE.FUNCTION:
          return await this.dumpRoutine(objectName, objectType, databaseConfig, fileConfig)
        case SCHEMA_OBJECT_TYPE.EVENT:
        case SCHEMA_OBJECT_TYPE.TRIGGER:
        case SCHEMA_OBJECT_TYPE.VIEW:
          return await this.dumpNonRoutine(objectName, objectType, databaseConfig, fileConfig)
        default:
          throw new Error(`Unsupported schema object type: ${objectType}`)
      }
    } catch (err) {
      logger.error(err)
      throw err;
    }
  }

  private async dumpNonRoutine(objectName: string, objectType: SchemaObjectType, databaseConfig: DatabaseConfig, fileConfig: FileConfig) {
    const outputPath = `${fileConfig.schemaOutputDir}/${objectName}.sql`;
    const args = [
      `-u${databaseConfig.user}`,
      `-h${databaseConfig.host}`,
      `-P${databaseConfig.port}`,
    ];


    if (objectType === SCHEMA_OBJECT_TYPE.TRIGGER) args.push('--triggers');
    if (objectType === SCHEMA_OBJECT_TYPE.EVENT) args.push('--events');
    args.push(databaseConfig.database!);
    args.push(objectName)

    const dumpCmd = `mysqldump ${args.join(' ')} > ${outputPath}`;
    logger.info(`Dumping ${objectType.toLowerCase()}: ${objectName}`);
    await runMySqlCommand(dumpCmd, databaseConfig.password);
    return outputPath;
  }

  private async dumpRoutine(objectName: string, objectType: SchemaObjectType, databaseConfig: DatabaseConfig, fileConfig: FileConfig): Promise<string> {
    const outputPath = `${fileConfig.schemaOutputDir}/${objectName}.sql`;
    const args = [
      `-u${databaseConfig.user}`,
      `-h${databaseConfig.host}`,
      `-P${databaseConfig.port}`,
      `-p${databaseConfig.password}`,
      '--no-create-info',
      '--no-create-db',
      '--no-data',
      '--skip-triggers',
      '--routines',
      databaseConfig.database
    ]

    let mysqldumpCmd = `mysqldump ${args.join(' ')}`;
    const dumpCommand = `${mysqldumpCmd} > ${fileConfig.schemaOutputDir}/${objectName}.sql`;
    await runMySqlCommand(dumpCommand, databaseConfig.database)
    return outputPath
  }

  /**
   * Dumps database table
   */
  public async dumpTable(table: string, config: DatabaseConfig, fileConfig: FileConfig): Promise<string> {
    let args = [
      `-u${config.user}`,
      `-h${config.host}`,
      `-P${config.port}`,
      '--no-data',
      '--compact',
      config.database,
      table
    ];

    if (table === MIGRATION_HISTORY_TABLE) {
      args = args.filter(arg => arg !== '--no-data');
    }

    let mysqldumpCmd = `mysqldump ${args.join(' ')}`;
    const dumpCommand = `${mysqldumpCmd} > ${fileConfig.schemaOutputDir}/${table}.sql`;

    try {
      logger.info(`Dumping table: ${table}`)
      await runMySqlCommand(dumpCommand, config.password)
      return `${fileConfig.schemaOutputDir}/${table}.sql`
    } catch (err) {
      logger.error(ERROR_MESSAGES.SCHEMA_DUMP.TABLE(table), err);
      throw err
    }
  }
}