#!/usr/bin/env bash
set -euo pipefail

# load .env variables
export $(grep -v '^#' .env | xargs)

# create a temporary directory for schema dumps
TMP_DIR="schemas"
mkdir -p "$TMP_DIR"

# create directories for dumps
BEFORE_DUMP_DIR="$TMP_DIR/schema_dump_before_migrate"
AFTER_DUMP_DIR="$TMP_DIR/schema_dump_after_migrate"

mkdir -p "$BEFORE_DUMP_DIR"
mkdir -p "$AFTER_DUMP_DIR"

# run initial dump:schema
echo "Running initial dump:schema..."
# export the schema output dir to be used in ts file
export SCHEMA_OUTPUT_DIR="$BEFORE_DUMP_DIR"
npm run dump:schema -- --output "$BEFORE_DUMP_DIR"

# create temporary database
TMP_DB_NAME="tmp_migration_db_$(date +%s)"
echo "Creating temporary database: $TMP_DB_NAME"
mysql -u "$DB_USER" -p"$DB_PASSWORD" -h "$DB_HOST" -P "$DB_PORT" -e "CREATE DATABASE $TMP_DB_NAME;"

# ensure temp DB is dropped on exit
trap 'echo "Cleaning up temporary database: $TMP_DB_NAME"; mysql -u "$DB_USER" -p"$DB_PASSWORD" -h "$DB_HOST" -P "$DB_PORT" -e "DROP DATABASE IF EXISTS $TMP_DB_NAME;"' EXIT

echo "Restoring schema into temporary database..."

for sql_file in "$BEFORE_DUMP_DIR"/*.sql; do
  echo "Restoring $sql_file..."
  mysql -u "$DB_USER" -p"$DB_PASSWORD" -h "$DB_HOST" -P "$DB_PORT" "$TMP_DB_NAME" < "$sql_file"
done


# override DB env variable to point to the temp database
export DB_NAME="$TMP_DB_NAME"

# run migration
echo "Running migrations..."
npm run migrate

# run dump:schema again
echo "Running final dump:schema..."
# export the schema output dir to be used in ts file
export SCHEMA_OUTPUT_DIR="$AFTER_DUMP_DIR"
npm run dump:schema -- --output "$AFTER_DUMP_DIR"

# compare schemas
DIFF_LOG="$TMP_DIR/schema_diff_$(date +%Y%m%d_%H%M%S).log"

echo "Comparing schema directories..."
# use unified format for cleaner output
diff -urN "$BEFORE_DUMP_DIR" "$AFTER_DUMP_DIR" | tee "$DIFF_LOG"

# check if differences exist
if [ -s "$DIFF_LOG" ]; then
  echo "Schema mismatch. Check the log: $DIFF_LOG"
  exit 1
else
  echo "Migrations are in sync"
fi


echo "All commands executed successfully."
