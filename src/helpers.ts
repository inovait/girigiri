import { exec } from "child_process";
import logger from "./logging/logger.ts";

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


/**
 * Executes a shell command and handles logging, errors.
 * @param command The shell command to execute
 * @param mysqlPwd Pw passed to the command but not visible in CI
 */
export function runCommand(
    command: string,
    mysqlPwd?: string
): Promise<void> {
    return new Promise((resolve, reject) => {
        exec(command, { env: { ...process.env, MYSQL_PWD: mysqlPwd} }, (error, _stdout, _stderr) => {
            if (error) {
                logger.error(`Error executing command "${command}": ${error.message}`);
                return reject(error);
            }

            if (_stderr) {
                logger.warn(`Stderr for command "${command}": ${_stderr}`);
            }

            logger.info(`Command executed successfully: ${command}`);
            resolve();
        });
    });
}
