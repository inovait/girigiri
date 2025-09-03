export const MIGRATION_HISTORY_TABLE = 'migration_history'
export const TEMP_PREFIX = 'tmp__'
export const CONTAINER_SERVICE = 'mysqldb' // see docker compose.yml as a reference
export const DOCKER_UP_COMMAND = 'docker compose --env-file .env up -d --build mysqldb';
export const DOCKER_DOWN_COMMAND = 'docker compose --env-file .env rm -sfv mysqldb';
export const MAIN_DB_TMP = 'main_tmp'
export const SNAPSHOT_NORMALIZED = 'snapshot_normalized.sql'
export const TEMP_NORMALIZED = 'temp_normalized.sql'

export const SELECT_TRIGGERS = (databaseName: string): string => `
  SELECT trigger_name as name
  FROM information_schema.triggers
  WHERE trigger_schema = '${databaseName}';
`;

export const SELECT_PROCEDURES = (databaseName: string): string => `
  SELECT routine_name as name
  FROM information_schema.routines
  WHERE routine_type = 'PROCEDURE' AND routine_schema = '${databaseName}';
`;

export const SELECT_VIEWS = (databaseName: string): string => `
  SELECT table_name as name
  FROM information_schema.views
  WHERE table_schema = '${databaseName}';
`;

export const SELECT_EVENTS = (databaseName: string): string => `
  SELECT event_name as name
  FROM information_schema.events
  WHERE event_schema = '${databaseName}';
`;

export const SELECT_FUNCTIONS = (databaseName: string): string => `
  SELECT routine_name as name
  FROM information_schema.routines
  WHERE routine_type = 'FUNCTION' and routine_schema = '${databaseName}';
`;