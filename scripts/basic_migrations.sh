source ./scripts/helpers.sh

#!/usr/bin/env bash
set -euo pipefail

# load .env variables
export $(grep -v '^#' .env | xargs)

# determin tmp dir from env_variables or else use schemas
TMP_DIR="${SCHEMA_OUTPUT_DIR:-schemas}"
mkdir -p "$TMP_DIR"


# create temporary MySQL credentials file 
TMP_MY_CNF=$(create_tmp_my_cnf "$DB_USER" "$DB_PASSWORD" "$DB_HOST" "$DB_PORT")
TMP_MY_CNF_MIG=$(create_tmp_my_cnf "$DB_MIGRATION_USER" "$DB_MIGRATION_PASSWORD" "$DB_MIGRATION_HOST" "$DB_MIGRATION_PORT")

# ensure temp files are deleted
trap 'rm -f "$TMP_MY_CNF" "$TMP_MY_CNF_MIG"' EXIT

# run initial dump:schema
dump_mysql_db "$TMP_MY_CNF" "$DB_NAME" "db_dump.sql"
dump_mysql_db "$TMP_MY_CNF_MIG" "$DB_MIGRATION_NAME" "db_migration_dump.sql"


# create temporary database
TEMP_DB=$(create_temp_db_from_dump "$TMP_MY_CNF" "db_dump.sql" "tmp_main")
TEMP_DB_MIG=$(create_temp_db_from_dump "$TMP_MY_CNF_MIG" "db_migration_dump.sql" "tmp_migration")


# export for tooling
export TEMP_DB_NAME="$TEMP_DB"
export TEMP_DB_MIGRATION_NAME="$TEMP_DB_MIG"

echo "Running migrations..."
npm run migrate

echo "Running final dump..."
npm run dump:schema

echo "All commands executed successfully."
