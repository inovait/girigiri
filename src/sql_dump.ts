import dotenv from 'dotenv';
import { execSync, exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { removeSqlComments } from './helpers.js';
import logger from './logger.js';

dotenv.config();

const {
    DB_HOST,
    DB_USER,
    DB_PASSWORD,
    DB_NAME,
    DB_PORT
} = process.env;

// predefined folder for table schemas
const outputDir = 'schemas';

// check if directory exist - if not create
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    logger.info(`Created directory: ${outputDir}`);
} else {
    logger.info(`Using existing directory: ${outputDir}`);
}

// get the list of tables
let tables: string[] = [];
try {
    // table list command
    const listTablesCmd = `mysql -u ${DB_USER} -p${DB_PASSWORD} -h ${DB_HOST} -P ${DB_PORT} -N -e "SHOW TABLES;" ${DB_NAME}`;
    // execute command to dump all the tables
    const tableListOutput = execSync(listTablesCmd, { encoding: 'utf8' });
    // split the output into the list of tables
    tables = tableListOutput.trim().split('\n').filter(Boolean);
} catch (err: any) {
    logger.error(`Failed to fetch tables: ${err.message}`);
    process.exit(1);
}

logger.info(`Found ${tables.length} tables in ${DB_NAME}`);

// dump each table into its own file (execute the command for each table)
tables.forEach((table) => {
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
    const mysqldumpCmd = `mysqldump ${args.join(' ')}`;
    // use the pipe to remove trailing 
    const sedCmd = `sed -E 's/ (ENGINE|AUTO_INCREMENT|DEFAULT CHARSET|COLLATE)=[^ ]+//g'`;
    // build the dump command
    const dumpCommand = `${mysqldumpCmd} | ${sedCmd} > ${outputPath}`;

    // exec the dump command
    exec(dumpCommand, (error, _stdout, _stderr) => {
        if (error) {
            logger.error(`Error dumping table ${table}: ${error.message}`);
            return;
        }
        if (_stderr) {
            logger.warn(`Stderr for ${table}: ${_stderr}`);
        }

        // Clean the file of comments
        const sqlContent = fs.readFileSync(outputPath, 'utf8');
        const cleanSql = removeSqlComments(sqlContent);
        fs.writeFileSync(outputPath, cleanSql);

        logger.info(`Dumped table schema to ${outputPath}`);
    });
});
