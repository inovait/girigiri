import { runMySqlCommand } from "../utils.js";
import type { DatabaseConfig } from "../interface/database-config.interface.js";
import type { FileConfig } from "../interface/file-config.interface.js";
import logger from "../logging/logger.js";
import { DatabaseManager } from "../manager/database.manager.js";
import { FileManager } from "../manager/file.manager.js";
import { MIGRATION_HISTORY_TABLE, SELECT_EVENTS, SELECT_FUNCTIONS, SELECT_PROCEDURES, SELECT_TRIGGERS, SELECT_VIEWS } from "../constants/constants.js";
import { ERROR_MESSAGES } from "../constants/error-messages.js";
import type { Connection, RowDataPacket } from "mysql2/promise";
import { SCHEMA_OBJECT_TYPE } from "../enum/schema-object-type.enum.js";
import type { SchemaObjectType } from "../enum/schema-object-type.enum.js";
import path from "path";
import { create } from "domain";


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
      "--skip-comments",
      "--single-transaction",
      "--routines",
      "--triggers",
      "--events",
      databaseConfig.database,
    ];

    let mysqldumpCmd = `mysqldump ${args.join(' ')}`;
    // ensure directory exists
    if (!FileManager.checkDirectory(fileConfig.schemaOutputDir)) {
      logger.info(`Creating directory ${fileConfig.schemaOutputDir}`)
      FileManager.makeDirectory(fileConfig.schemaOutputDir);
    }

    const dumpCommand = `${mysqldumpCmd} > ${fileConfig.schemaOutputDir}/${fileName}.sql`;

    try {
      await runMySqlCommand(dumpCommand, databaseConfig.password)
      logger.info('Schema succesfully dumped, returning temp file path')
      return `${fileConfig.schemaOutputDir}/${fileName}.sql`
    } catch (err: any) {
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
    let connection: Connection = await this.databaseManager.connect(databaseConfig)
    let outputDir: string = fileConfig.migrationsDir

    if (!FileManager.checkDirectory(outputDir)) {
      FileManager.makeDirectory(outputDir)
      logger.info(`Created directory: ${outputDir}`);
    } else {
      logger.info(`Directory: ${outputDir} already exists`)
    }

    // retrieve the schema tables
    let tables = await this.getTables(connection, databaseConfig.database!)

    // retrieve schnema objects
    const schemaObjects = [
      { type: SCHEMA_OBJECT_TYPE.PROCEDURE, data: await this.getDatabaseObjects(connection, databaseConfig.database!, SCHEMA_OBJECT_TYPE.PROCEDURE) },
      { type: SCHEMA_OBJECT_TYPE.VIEW,      data: await this.getDatabaseObjects(connection, databaseConfig.database!, SCHEMA_OBJECT_TYPE.VIEW) },
      { type: SCHEMA_OBJECT_TYPE.EVENT,     data: await this.getDatabaseObjects(connection, databaseConfig.database!, SCHEMA_OBJECT_TYPE.EVENT) },
      { type: SCHEMA_OBJECT_TYPE.TRIGGER,   data: await this.getDatabaseObjects(connection, databaseConfig.database!, SCHEMA_OBJECT_TYPE.TRIGGER) },
      { type: SCHEMA_OBJECT_TYPE.FUNCTION,   data: await this.getDatabaseObjects(connection, databaseConfig.database!, SCHEMA_OBJECT_TYPE.FUNCTION) },
    ];

    // dump the database objects
    for (const { type, data } of schemaObjects) {
      for (const objectName of data) {
        try {
          await this.dumpDbObject(connection, objectName, type, databaseConfig, fileConfig);
        } catch (err: any ) {
          connection.end()
          logger.error(`Failed to dump ${type} "${objectName}"`, err);
          throw new Error(ERROR_MESSAGES.SCHEMA_DUMP.FETCH_SCHEMA_OBJECTS(type, err))
        } 
      }
    }

    // dump the tables
    for (let table of tables) {
      try {
        await this.dumpTable(table, databaseConfig, fileConfig)
      } catch (err: any) {
        logger.error(ERROR_MESSAGES.SCHEMA_DUMP.STOP_DUE_TO_ERROR, err);
        throw err;
      } finally {
        connection.end()
      }
    }
  }

  private async dumpDbObject(connection: Connection, objectName: string, schemaObjectType: SchemaObjectType, databaseConfig: DatabaseConfig, fileConfig: FileConfig) {
    // first create the directory
    const outputPath = path.join(`${fileConfig.schemaOutputDir}/${schemaObjectType}`, `${objectName}.sql`);
    FileManager.makeDirectory(`${fileConfig.schemaOutputDir}/${schemaObjectType}`)

    // create the query 
    const query = `SHOW CREATE ${schemaObjectType} \`${databaseConfig.database}\`.\`${objectName}\``;
    const [rows] = await connection.execute<RowDataPacket[]>(query);

    let createSql: string;
    switch (schemaObjectType) {
      case SCHEMA_OBJECT_TYPE.EVENT:
        createSql = rows[0]['Create Event'];
        break;
      case SCHEMA_OBJECT_TYPE.TRIGGER:
        createSql = rows[0]['SQL Original Statement'] || rows[0]['Create Trigger'];
        break;
      case SCHEMA_OBJECT_TYPE.VIEW:
        createSql = rows[0]['Create View'];
        break;
      case SCHEMA_OBJECT_TYPE.PROCEDURE:
        createSql = rows[0]['Create Procedure'];
        break;
      case SCHEMA_OBJECT_TYPE.FUNCTION:
        createSql = rows[0]['Create Function'];
        break;
      default:
        throw new Error(`Unsupported schema object type: ${schemaObjectType}`);
    }

    logger.info(`Dumping ${schemaObjectType}: ${objectName} `)
    FileManager.writeFile(outputPath, createSql)
    return outputPath;
  }

  private async getDatabaseObjects(connection: Connection, dbName: string, routine: SchemaObjectType) {    
    try {
      let sql: string | null = null;
      switch (routine) {
        case SCHEMA_OBJECT_TYPE.PROCEDURE: sql = SELECT_PROCEDURES(dbName)
          break;
        case SCHEMA_OBJECT_TYPE.TRIGGER: sql = SELECT_TRIGGERS(dbName)
          break;
        case SCHEMA_OBJECT_TYPE.EVENT: sql = SELECT_EVENTS(dbName)
          break;
        case SCHEMA_OBJECT_TYPE.VIEW: sql = SELECT_VIEWS(dbName)
          break;
        case SCHEMA_OBJECT_TYPE.FUNCTION: sql = SELECT_FUNCTIONS(dbName)
          break;
        default: throw new Error(ERROR_MESSAGES.SCHEMA_DUMP.FETCH_SCHEMA_OBJECTS(routine))
      }

      const [dbOjects]: any[] = await connection.query(sql)
      return dbOjects.map((row: any) => { return row.name })
    } catch (error: any) {
      logger.error(ERROR_MESSAGES.SCHEMA_DUMP.FETCH_SCHEMA_OBJECTS(routine), error);
      connection?.end();
      throw error;
    } 
  }

  /**
   * Retrieves database tables
   */
  private async getTables(connection: Connection, dbName: string) {
  
    try {
      const [tables]: any[] = await connection.query(
        `SELECT table_name as TABLE_NAME FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'`, [dbName]);
      return tables.map((row: any) => { return row.TABLE_NAME })
    } catch (error: any) {
      logger.error(ERROR_MESSAGES.SCHEMA_DUMP.FETCH_TABLES, error);
      connection?.end();
      throw error;
    } 
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
    const dumpCommand = `${mysqldumpCmd} > ${fileConfig.schemaOutputDir}/tables/${table}.sql`;

    try {
      logger.info(`Dumping table: ${table}`)
      await runMySqlCommand(dumpCommand, config.password)
      return `${fileConfig.schemaOutputDir}/tables/${table}.sql`
    } catch (err: any) {
      logger.error(ERROR_MESSAGES.SCHEMA_DUMP.TABLE(table), err);
      throw err
    }
  }
}