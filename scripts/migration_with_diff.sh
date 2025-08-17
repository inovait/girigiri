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
mkdir -p "$BEFORE_DUMP_DIR" "$AFTER_DUMP_DIR"

restore_schema() {
  local sql_dir="$1"

  echo "Restoring schema from $sql_dir into database $TMP_DB_NAME..."
  mysql --defaults-extra-file="$TMP_MY_CNF" "$TMP_DB_NAME" <<EOF
  SET FOREIGN_KEY_CHECKS = 0;
  $(for sql_file in "$sql_dir"/*.sql; do cat "$sql_file"; echo; done)
  SET FOREIGN_KEY_CHECKS = 1;
EOF
}


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

# temporary database name
TMP_DB_NAME="tmp_migration_db_$(date +%s)"

# function to cleanup DB and temp folders
cleanup() {
  echo "Cleaning up temporary database: $TMP_DB_NAME"
  mysql --defaults-extra-file="$TMP_MY_CNF" -e "DROP DATABASE IF EXISTS $TMP_DB_NAME;" || true
  echo "Removing temporary dump directories"
  rm -rf "$BEFORE_DUMP_DIR" "$AFTER_DUMP_DIR"
  rm -f "$TMP_MY_CNF"
}
trap cleanup ERR

# run initial dump:schema
echo "Running initial dump:schema..."
export SCHEMA_OUTPUT_DIR="$BEFORE_DUMP_DIR"
npm run dump:schema -- --output "$BEFORE_DUMP_DIR"

# create temporary database
echo "Creating temporary database: $TMP_DB_NAME"
mysql --defaults-extra-file="$TMP_MY_CNF" -e "CREATE DATABASE $TMP_DB_NAME;"

# restore schema into temporary database
echo "Restoring schema into temporary database..."
restore_schema "$BEFORE_DUMP_DIR"

# override DB env variable to point to the temp database
export DB_NAME="$TMP_DB_NAME"

# run migration
echo "Running migrations"
npm run migrate

# run dump:schema again
echo "Running final dump:schema"
export SCHEMA_OUTPUT_DIR="$AFTER_DUMP_DIR"
npm run dump:schema -- --output "$AFTER_DUMP_DIR"

# compare schemas
DIFF_LOG="$TMP_DIR/schema_diff_$(date +%Y%m%d_%H%M%S).log"
echo "Comparing schema directories"
diff -urN "$BEFORE_DUMP_DIR" "$AFTER_DUMP_DIR" \
  | grep -vE '^(---|\+\+\+|\\ No newline at end of file)' \
  > "$DIFF_LOG"

echo "Check the log for the diff: $DIFF_LOG"
cleanup # clean the tmp files
echo "All commands executed successfully."
