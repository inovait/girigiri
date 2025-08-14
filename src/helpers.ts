export function validateEnvVar(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function removeSqlComments(sql: string): string {
    return sql
    // Remove block comments and semicolon right after them
    .replace(/\/\*[\s\S]*?\*\/\s*;?/g, '')
    // Remove -- comments and semicolon after them
    .replace(/--.*;?$/gm, '')
    // Remove # comments and semicolon after them
    .replace(/#.*;?$/gm, '')
    // Remove blank lines left behind
    .replace(/^\s*$(?:\r\n?|\n)/gm, '')
    .trim();
}

// change the env value to a boolean value 
export function envToBool(value: string): Boolean {
  if (!value) return false;
  return ["true", "1", "yes", "on"].includes(value.toLowerCase());
}