#!/usr/bin/env bash
source ./scripts/helpers.sh

# env variables
export $(grep -v '^#' .env | xargs)

# SQL file to run
SQL_FILE="database/init_migrations.sql"

# create temporary MySQL credentials file
TMP_MY_CNF_MIG=$(create_tmp_my_cnf "$DB_MIGRATION_USER" "$DB_MIGRATION_PASSWORD" "$DB_MIGRATION_HOST" "$DB_MIGRATION_PORT")

# ensure temp files are deleted
trap 'rm -f "$TMP_MY_CNF_MIG"' EXIT


# check if MySQL is reachable
SERVICE_STATUS=$(mysqladmin --defaults-extra-file="$TMP_MY_CNF_MIG" ping --silent)
if [[ "$SERVICE_STATUS" == "mysqld is alive" ]]; then
  echo "MySQL is reachable at $DB_MIGRATION_HOST:$DB_MIGRATION_PORT. Proceeding..."
  echo "Running $SQL_FILE against database \"$DB_MIGRATION_NAME\"..."

  read -p "Proceed with running the SQL file? (y/n): " choice
  case "$choice" in 
    y|Y ) echo "Proceeding...";;
    * ) echo "Cancelled by user."; exit 0;;
  esac

  # trigger sql
  mysql --defaults-extra-file="$TMP_MY_CNF_MIG" "$DB_MIGRATION_NAME" < "$SQL_FILE"

  echo "Finished initialization"
else
  echo "MySQL is NOT reachable at $DB_MIGRATION_HOST:$DB_MIGRATION_PORT."
fi
