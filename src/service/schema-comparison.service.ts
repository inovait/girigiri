import { MAIN_DB_TMP, MIGRATION_HISTORY_TABLE, SNAPSHOT_NORMALIZED, TEMP_NORMALIZED } from '../constants/constants.js';
import { execAsync } from '../utils.js';
import { FileManager } from '../manager/file.manager.js';

export interface SchemaComparison {
  isIdentical: boolean;
  diff: string;
}

export class SchemaComparisonService {
  private static readonly EXCLUDED_TABLES = [
    `${MIGRATION_HISTORY_TABLE}.sql`
  ] as const;

  private static readonly EXCLUDED_FILES = [
    `${MAIN_DB_TMP}.sql`
  ] as const;

  /**
   * 
   */
  public async compareSchemasBash(
    snapshotPath: string,
    tempDbDumpPath: string
  ): Promise<SchemaComparison> {
    
    const sourceFile = `${snapshotPath}/${FileManager.readDirectory(snapshotPath)[0]}`
    const tempFile = `${tempDbDumpPath}/${FileManager.readDirectory(tempDbDumpPath)[0]}`

    try {
      // diff command
      const excludePatterns = [
        ...SchemaComparisonService.EXCLUDED_TABLES,
        ...SchemaComparisonService.EXCLUDED_FILES
      ].map(pattern => `--exclude="${pattern}"`);

      const diffCommand = [
        'diff',
        '--unified=5',
        '--ignore-blank-lines',
        '--ignore-space-change',
        '--strip-trailing-cr',
        ...excludePatterns,
        sourceFile,
        tempFile
      ].join(' ');

      try {
        await execAsync(diffCommand);
        // exit code 0 = identical schemas
        return { isIdentical: true, diff: '' };
      } catch (err: any) {
        if (err.code === 1) {
            // exit code 1 = schemas differ
            return { isIdentical: false, diff: err.stdout || '' };
        }
        throw err;
      }
    } catch (error: any) {
      throw new Error()
    } 
  }

  public formatResult(isIdentical: boolean): string {
    return isIdentical ? 'Schemas are identical.' : 'Schemas differ.';
  }

  public static getExcludedTables(): readonly string[] {
    return SchemaComparisonService.EXCLUDED_TABLES;
  }

  public static getExcludedFiles(): readonly string[] {
    return SchemaComparisonService.EXCLUDED_FILES;
  }
}
