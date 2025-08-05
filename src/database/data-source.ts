import { config } from "dotenv";
import path from "path";
import { DataSource } from "typeorm";
import { fileURLToPath } from "url";
config()

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
console.log(__dirname)

export const MySqlDataSource = new DataSource({
    type: "mysql",
    host: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT!),
    username: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
    synchronize: true, // configure to true only if on dev
    logging: true,
    entities: [path.join(__dirname, 'entity', '**', '*.{js,ts}')],
});

