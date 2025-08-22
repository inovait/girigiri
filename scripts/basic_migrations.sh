source ./scripts/helpers.sh

#!/usr/bin/env bash
set -euo pipefail

# load .env variables
if [[ "${1:-}" == "--integration-test" ]]; then
  export $(grep -v '^#' .env.integration | xargs)  
else
  export $(grep -v '^#' .env | xargs)
fi

# default behavior: drop DB at the end
DROP_TMP_DB=true

# parse optional flag - used for testing purposes
if [[ "${2:-}" == "--keep-tmp-db" ]]; then
  DROP_TMP_DB=false
fi

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
# true = with data
dump_mysql_db_table "$TMP_MY_CNF_MIG" "$DB_MIGRATION_NAME" "migration_history" "db_migration_dump.sql" "true"

# ensure temporary dump files are deleted 
trap 'rm -f db_dump.sql db_migration_dump.sql db_dump.sql.tmp db_migration_dump.sql.tmp' EXIT

# create temporary database
TEMP_DB=$(create_temp_db_from_dump "$TMP_MY_CNF" "db_dump.sql" "tmp_main")
TEMP_DB_MIG=$(create_temp_db_from_dump "$TMP_MY_CNF_MIG" "db_migration_dump.sql" "tmp_migration_history")

# should be true in all cases other than integration testing
# should be true in all cases other than integration testing
if [[ "$DROP_TMP_DB" == true ]]; then
  trap '
    echo "Dropping temporary databases..."

    echo "Dropping main temp database: $TEMP_DB"
    mysql --defaults-extra-file="$TMP_MY_CNF" -e "DROP DATABASE IF EXISTS $TEMP_DB;"

    echo "Dropping migration temp database: $TEMP_DB_MIG"
    mysql --defaults-extra-file="$TMP_MY_CNF_MIG" -e "DROP DATABASE IF EXISTS $TEMP_DB_MIG;"

    echo "Removing temporary dump files..."
    rm -f db_dump.sql db_migration_dump.sql db_dump.sql.tmp db_migration_dump.sql.tmp

    rm -f "$TMP_MY_CNF" "$TMP_MY_CNF_MIG"
  ' EXIT
else
  trap '
    echo "Removing temporary dump files..."
    rm -f db_dump.sql db_migration_dump.sql db_dump.sql.tmp db_migration_dump.sql.tmp

    rm -f "$TMP_MY_CNF" "$TMP_MY_CNF_MIG"
  ' EXIT
fi


# export for tooling
export DB_NAME="$TEMP_DB"
export DB_MIGRATION_NAME="$TEMP_DB_MIG"

echo "Running migrations..."
npm run migrate

echo "Running final dump..."
npm run dump:schema

echo "All commands executed successfully."
