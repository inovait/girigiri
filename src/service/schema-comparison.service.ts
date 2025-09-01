import type { FileConfig } from '../interface/file-config.interface.ts';
import { MAIN_DB_TMP, MIGRATION_HISTORY_TABLE } from '../constants/constants.ts';
import { execAsync } from '../utils.ts';

export class SchemaComparisonService {
  private static readonly EXCLUDED_TABLES = [
    `${MIGRATION_HISTORY_TABLE}.sql`
  ] as const;

  private static readonly EXCLUDED_FILES = [
    `${MAIN_DB_TMP}.sql`
  ] as const;

  /**
   * Run `diff` and return true if schemas are identical (no diff output), false otherwise.
   */
  public async compareSchemasBash(
    sourceControlConfig: FileConfig,
    tempDbConfig: FileConfig
  ): Promise<boolean> {
    const sourceDir = sourceControlConfig.schemaOutputDir;
    const tempDir = tempDbConfig.schemaOutputDir;

    const excludePatterns = [
      ...SchemaComparisonService.EXCLUDED_TABLES,
      ...SchemaComparisonService.EXCLUDED_FILES
    ].map(pattern => `--exclude="${pattern}"`);

    const diffCommand = [
      'diff',
      '--recursive',
      '--unified=3',
      '--ignore-blank-lines',
      '--ignore-space-change',
      ...excludePatterns,
      '--exclude=".*"',
      `"${sourceDir}"`,
      `"${tempDir}"`
    ].join(' ');

    const { stdout } = await execAsync(diffCommand).catch(err => ({ stdout: err?.stdout || '' }));
    return !stdout.trim(); // if no diff output -> identical
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
