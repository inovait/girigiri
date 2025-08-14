import dotenv from 'dotenv';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { removeSqlComments, envToBool, validateEnvVar } from './helpers.js';
import logger from './logger.js';

dotenv.config();

const {
    DB_HOST,
    DB_USER,
    DB_PASSWORD,
    DB_NAME,
    DB_PORT,
    NO_COMMENTS,
    NO_TRAIL
} = process.env;


// predefined folder for table schemas
const outputDir = process.env['SCHEMA_OUTPUT_DIR'] || 'schemas';
let _NO_COMMENTS = envToBool(NO_COMMENTS!)
let _NO_TRAIL = envToBool(NO_TRAIL!)


// dumpo the table
async function dump_table(table: string) {
    const outputPath = path.join(outputDir, `${table}.sql`);
    let args = [
        `-u ${DB_USER}`,
        `-h ${DB_HOST}`,
        `-P ${DB_PORT}`,
        '--no-data',
        '--compact',
        DB_NAME,
        table // dump this table only
    ];

    if (table === 'migrations') {
        // Filter out the '--no-data' argument
        args = args.filter(arg => arg !== '--no-data');
    }
    // build the command from the arguments
    let mysqldumpCmd = `mysqldump ${args.join(' ')}`;
    // use the pipe to remove trailing 
    const sedCmd = ` | sed -E 's/ (ENGINE|AUTO_INCREMENT|DEFAULT CHARSET|COLLATE)=[^ ]+//g'`;
    // if no trail is set remove the table options
    if (_NO_TRAIL) mysqldumpCmd = mysqldumpCmd + sedCmd;
    // build the command
    const dumpCommand = `${mysqldumpCmd} > ${outputPath}`
    return new Promise<void>((resolve, reject) => {
        // exec the dump command - dont allow the variables to be outputed
        exec(dumpCommand, { env: { ...process.env, MYSQL_PWD: DB_PASSWORD } }, (error, _stdout, _stderr) => {
            if (error) {
                logger.error(`Error dumping table ${table}: ${error.message}`);
                return reject(error);
            }

            if (_stderr) {
                logger.warn(`Stderr for ${table}: ${_stderr}`);
            }

            
            // read dump content
            let sqlContent = fs.readFileSync(outputPath, 'utf8');

            // optionally remove comments
            if (_NO_COMMENTS) {
                logger.info("Removing comments from SQL content");
                sqlContent = removeSqlComments(sqlContent);
            }

            // wrap dump in FK disable/enable
            sqlContent = `SET FOREIGN_KEY_CHECKS=0;\n${sqlContent}\nSET FOREIGN_KEY_CHECKS=1;`;
            fs.writeFileSync(outputPath, sqlContent);

            logger.info(`Dumped table schema to ${outputPath}`);
            resolve();
        });
    })
}

// get the list of tables
async function get_tables() {
    try {
        // -N skips column names
        const listTablesCmd = `mysql -N -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -e "SHOW TABLES;" ${DB_NAME}`;
        return new Promise<string[]>((resolve, reject) => {
            return exec(listTablesCmd, { env: { ...process.env, MYSQL_PWD: DB_PASSWORD }, encoding: 'utf8' }, (error, _stdout, _stderr) => {
                if (error) {
                    logger.error(`Error while retrieving tables: ${error.message}`);
                    return reject(error);
                }

                if (_stderr) {
                    logger.warn(`Stderr for table retrieval: ${_stderr}`);
                }

                const tables = _stdout.trim().split('\n')
                logger.info("Successfully retrieved tables")
                resolve(tables)
            })
        })
    } catch (err: any) {
        logger.error(`Failed to fetch tables: ${err.message}`);
        throw err; // rethrow
    }
}

async function dump_schema() {
    // check if directory exist - if not create
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        logger.info(`Created directory: ${outputDir}`);
    } else {
        logger.info(`Using existing directory: ${outputDir}`);
    }

    // get all the tables from the db schema
    let tables = await get_tables()
    // iterate over the tables and dump
    for (const table of tables) {
        try {
            await dump_table(table)
        } catch (err: any) {
            logger.error(`Stopping table dumping due to error: ${err}`)
            throw err; // rethrow
        }
    }
}

async function validateEnvVariables(): Promise<void> {
    logger.info('Validating env variables')
    validateEnvVar('DB_HOST', DB_HOST)
    validateEnvVar('DB_PORT', DB_PORT)
    validateEnvVar('DB_USER', DB_USER)
    validateEnvVar('DB_PASSWORD', DB_PASSWORD)
    validateEnvVar('DB_NAME', DB_NAME)
    validateEnvVar('NO_TRAIL', NO_TRAIL)
    validateEnvVar('NO_COMMENTS', NO_COMMENTS)
}

(async () => {
    try {
        logger.info("Running SQL dump")
        await validateEnvVariables()
        await dump_schema()
        logger.info("Dump successfully completed")
    } catch (err: any) {
        logger.error("Exiting SQL dump")
        process.exit(1)
    }
})();