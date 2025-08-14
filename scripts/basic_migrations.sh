#!/usr/bin/env bash
set -euo pipefail

# load .env variables
export $(grep -v '^#' .env | xargs)

# determin tmp dir from env_variables or else use schemas
TMP_DIR="${SCHEMA_OUTPUT_DIR:-schemas}"
mkdir -p "$TMP_DIR"

# run initial dump:schema
echo "Running initial dump:schema..."
npm run dump:schema

# create temporary MySQL credentials file - safer approach
TMP_MY_CNF=$(mktemp)
chmod 600 "$TMP_MY_CNF"
cat > "$TMP_MY_CNF" <<EOF
[client]
user=$DB_USER
password=$DB_PASSWORD
host=$DB_HOST
port=$DB_PORT
EOF

# ensure temp credentials file is removed on exit
trap 'rm -f "$TMP_MY_CNF"' EXIT

# create temporary database
TMP_DB_NAME="tmp_migration_db_$(date +%s)"
echo "Creating temporary database: $TMP_DB_NAME"
mysql --defaults-extra-file="$TMP_MY_CNF" -e "CREATE DATABASE $TMP_DB_NAME;"

# ensure temp DB is dropped on exit
trap 'echo "Cleaning up temporary database: $TMP_DB_NAME"; \
  mysql --defaults-extra-file="$TMP_MY_CNF" -e "DROP DATABASE IF EXISTS $TMP_DB_NAME;"' EXIT

echo "Restoring schema into temporary database"
for sql_file in "$TMP_DIR"/*.sql; do
  echo "Restoring $sql_file..."
  mysql --defaults-extra-file="$TMP_MY_CNF" "$TMP_DB_NAME" < "$sql_file"
done

# override DB env variable to point to the temp database
export DB_NAME="$TMP_DB_NAME"

# run migration
echo "Running migrations"
npm run migrate

# run dump:schema again
echo "Running final dump:schema"
npm run dump:schema

echo "All commands executed successfully."
