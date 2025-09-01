export const MIGRATION_HISTORY_TABLE = 'migration_history'
export const TEMP_PREFIX = 'tmp__'
export const CONTAINER_SERVICE = 'mysqldb' // see docker compose.yml as a reference
export const DOCKER_UP_COMMAND = 'docker compose --env-file .env up -d --build mysqldb';
export const DOCKER_DOWN_COMMAND = 'docker compose --env-file .env rm -sfv mysqldb';
export const MAIN_DB_TMP = 'main_tmp'