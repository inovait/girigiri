import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import { exec } from 'child_process';
import logger from "./logging/logger.js";
import { promisify } from 'util';
import { FileManager } from './manager/file.manager.js';

export function getPaths(metaUrl: string) {
  const __filename = fileURLToPath(metaUrl);
  const __dirname = dirname(__filename);
  return { __filename, __dirname };
}

/**
 * Move up the directory tree and find the root lvl (where package.json and node modules resign)
 * 
 */
export function findHostRoot(startDir = __dirname) {
    let currentDir = startDir;

    while (true) {
        const hasPackageJson = FileManager.checkDirectory(path.join(currentDir, 'package.json'));
        const hasNodeModules = FileManager.checkDirectory(path.join(currentDir, 'node_modules'));

        if (hasPackageJson && hasNodeModules) {
            return currentDir; // found host project root
        }

        const parentDir = path.resolve(currentDir, '..');
        if (parentDir === currentDir) {
            // reached filesystem root
            return null;
        }

        currentDir = parentDir;
    }
}


/**
 * Executes a shell command and handles logging, errors.
 * @param command The shell command to execute
 * @param mysqlPwd Pw passed to the command but not visible in CI
 */
export function runMySqlCommand(
    command: string,
    mysqlPwd?: string,
    prependMkdir: boolean = true
): Promise<void> {
    return new Promise((resolve, reject) => {

       // detect redirection with ">"
        const redirectMatch = command.match(/>\s*([^\s]+)/);
        if (redirectMatch && prependMkdir) {
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



const _execAsync = promisify(exec);
export async function execAsync(command: string): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await _execAsync(command, { shell: '/bin/bash' });
  return { stdout, stderr };
}

