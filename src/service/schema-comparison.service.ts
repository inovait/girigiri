import { MAIN_DB_TMP, MIGRATION_HISTORY_TABLE, SNAPSHOT_NORMALIZED, TEMP_NORMALIZED } from '../constants/constants.js';
import { execAsync } from '../utils.js';
import * as path from 'path';
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
   * normalize sql dump
   */
  private async normalizeDump(filePath: string): Promise<string> {
    let content = FileManager.readFile(filePath);

    // remove comments and timestamps
    content = content.replace(/^--.*$/gm, '');

    // remove definer clauses
    content = content.replace(/DEFINER=`[^`]+`@`[^`]+`/g, '');

    // remove auto increment values
    content = content.replace(/AUTO_INCREMENT=\d+/g, '');

    
    content = content.replace(
    /CREATE TABLE `migration_history`[\s\S]*?;\n?/gi, '');


    // trim whitespace
    content = content.split('\n').map(line => line.trim()).join('\n');

    // sort create statements
    const statements = content
      .split(/;\s*\n/)      
      .map(stmt => stmt.trim())
      .filter(Boolean)
      .sort(); 

    return statements.join(';\n') + ';';
  }

  /**
   * 
   */
  public async compareSchemasBash(
    snapshotPath: string,
    tempDbDumpPath: string
  ): Promise<SchemaComparison> {
    
    const sourceFile = `${snapshotPath}/${FileManager.readDirectory(snapshotPath)[0]}`
    const tempFile = `${tempDbDumpPath}/${FileManager.readDirectory(tempDbDumpPath)[0]}`

    let normalizedSourcePath: string | null = null;
    let normalizedTempPath: string | null = null;

    // normalize dumps for comparison
    const normalizedSource = await this.normalizeDump(sourceFile);
    const normalizedTemp = await this.normalizeDump(tempFile);
    
    try {
      normalizedSourcePath = path.join(snapshotPath, SNAPSHOT_NORMALIZED);
      normalizedTempPath = path.join(tempDbDumpPath, TEMP_NORMALIZED);
      
      // write normalized file
      FileManager.writeFile(normalizedSourcePath, normalizedSource)
      FileManager.writeFile(normalizedTempPath, normalizedTemp)

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
        normalizedSourcePath,
        normalizedTempPath
      ].join(' ');

      const { stdout } = await execAsync(diffCommand).catch(err => ({ stdout: err?.stdout || '' }));

      return {
        isIdentical: !stdout.trim(),
        diff: stdout.trim()
      };
    } catch (error: any) {
      throw new Error()
    } finally {
      if (normalizedSourcePath !== undefined && normalizedSourcePath !== null) {
        FileManager.removeFile(normalizedSourcePath)
      }

      if (normalizedTempPath !== undefined && normalizedTempPath !== null) {
        FileManager.removeFile(normalizedTempPath)
      }
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
