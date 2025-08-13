import dotenv from 'dotenv';
import { execSync, exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { removeSqlComments, envToBool } from './helpers.js';
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
const outputDir = 'schemas';
let _NO_COMMENTS = envToBool(NO_COMMENTS!)
let _NO_TRAIL = envToBool(NO_TRAIL!)


// dumpo the table
async function dump_table(table: string) {
    const outputPath = path.join(outputDir, `${table}.sql`);
    const args = [
        `-u ${DB_USER}`,
        `-p${DB_PASSWORD}`,
        `-h ${DB_HOST}`,
        `-P ${DB_PORT}`,
        '--no-data',
        '--compact',
        DB_NAME,
        table // dump this table only
    ];

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
        exec(dumpCommand, (error, _stdout, _stderr) => {
            if (error) {
                logger.error(`Error dumping table ${table}: ${error.message}`);
                return reject(error);
            }
            if (_stderr) {
                logger.warn(`Stderr for ${table}: ${_stderr}`);
            }

            // clean the file of comments if env variable set
            const sqlContent = fs.readFileSync(outputPath, 'utf8');
            if (_NO_COMMENTS) logger.info("Removing comments from sql content")
            let cleanSqlContent = _NO_COMMENTS ? removeSqlComments(sqlContent) : sqlContent
            fs.writeFileSync(outputPath, cleanSqlContent);

            logger.info(`Dumped table schema to ${outputPath}`);
            resolve();
        });
    })
}

// get the list of tables
async function get_tables() {
    try {
        const listTablesCmd = `mysql -N -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -p${DB_PASSWORD} -e "SHOW TABLES;" ${DB_NAME}`;
        const tableListOutput = execSync(listTablesCmd, { encoding: 'utf8' });

        // split the output into the list of tables
        return tableListOutput.trim().split('\n').filter(Boolean);
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
    // itterate over the tables and dump
    for (const table of tables) {
        try {
            await dump_table(table)
        } catch (err: any) {
            logger.error(`Stopping table dumping due to error: ${err}`)
            throw err; // rethrow
        }
    }
}


(async () => {
    try {
        logger.info("Running sql dump")
        await dump_schema()
        logger.info("Dump successfully completed")
    } catch (err: any) {
        logger.error("Exiting sql dump")
        process.exit(1)
    }
})();