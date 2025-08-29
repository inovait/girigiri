// src/utils/getPaths.ts
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import { exec } from 'child_process';
import logger from "./logging/logger.ts";

export function getPaths(metaUrl: string) {
  const __filename = fileURLToPath(metaUrl);
  const __dirname = dirname(__filename);
  return { __filename, __dirname };
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

       // detect redirection with ">"
        const redirectMatch = command.match(/>\s*([^\s]+)/);
        if (redirectMatch) {
            const outputFile = redirectMatch[1];
            const dir = path.dirname(outputFile);

            // prepend mkdir -p
            command = `mkdir -p ${dir} && ${command}`;
        }
        
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


