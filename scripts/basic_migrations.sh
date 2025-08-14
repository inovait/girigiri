#!/usr/bin/env bash
set -euo pipefail

# load .env variables
export $(grep -v '^#' .env | xargs)

# create a temporary directory for schema dumps
TMP_DIR="schemas"
mkdir -p "$TMP_DIR"

# run initial dump:schema
echo "Running initial dump:schema"
npm run dump:schema

# create temporary database
TMP_DB_NAME="tmp_migration_db_$(date +%s)"
echo "Creating temporary database: $TMP_DB_NAME"
mysql -u "$DB_USER" -p"$DB_PASSWORD" -h "$DB_HOST" -P "$DB_PORT" -e "CREATE DATABASE $TMP_DB_NAME;"

# ensure temp DB is dropped on exit
trap 'echo "Cleaning up temporary database: $TMP_DB_NAME"; mysql -u "$DB_USER" -p"$DB_PASSWORD" -h "$DB_HOST" -P "$DB_PORT" -e "DROP DATABASE IF EXISTS $TMP_DB_NAME;"' EXIT

echo "Restoring schema into temporary database..."
for sql_file in "$TMP_DIR"/*.sql; do
  echo "Restoring $sql_file..."
  mysql -u "$DB_USER" -p"$DB_PASSWORD" -h "$DB_HOST" -P "$DB_PORT" "$TMP_DB_NAME" < "$sql_file"
done


# override DB env variable to point to the temp database
export DB_NAME="$TMP_DB_NAME"

# run migration
echo "Running migrations"
npm run migrate

# run dump:schema again
echo "Running final dump:schema..."
# export the schema output dir to be used in ts file
npm run dump:schema

echo "All commands executed successfully."
