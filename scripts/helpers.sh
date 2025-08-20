# create a temporary mysql config file
create_tmp_my_cnf() {
  local user="$1"
  local password="$2"
  local host="$3"
  local port="$4"

  local tmp_cnf
  tmp_cnf=$(mktemp)
  chmod 600 "$tmp_cnf"

  cat >"$tmp_cnf" <<EOF
[client]
user=$user
password=$password
host=$host
port=$port
EOF

  echo "$tmp_cnf"
}

# mysql dump
dump_mysql_db() {
  local cnf_file="$1"
  local db_name="$2"
  local output_file="$3"

  echo "Dumping database $db_name into $output_file..."
  mysqldump \
    --defaults-extra-file="$cnf_file" \
    --no-data \
    --single-transaction --routines --triggers --events \
    --databases "$db_name" > "$output_file"
}

dump_mysql_db_table() {
  local cnf_file="$1"
  local db_name="$2"
  local table_name="$3"
  local output_file="$4"
  local with_data="$5"

  local DUMP_FLAGS="--single-transaction --routines --triggers --events"
  if [[ "$with_data" == "false" || "$with_data" == "false" ]]; then
  # Structure only
    DUMP_FLAGS="$DUMP_FLAGS --no-data"
  fi

  echo "Dumping table $db_name.$table_name into $output_file..."

  mysqldump --defaults-extra-file="$cnf_file" \
  $DUMP_FLAGS \
  "$db_name" "$table_name" > "$output_file"
}

# create temporary db from sql dump
create_temp_db_from_dump() {
  local cnf_file="$1"
  local dump_file="$2"
  local prefix="$3"

  local temp_db="${prefix}_$(date +%s)"
  echo "Creating temporary database: $temp_db" >&2
  mysql --defaults-extra-file="$cnf_file" -e "CREATE DATABASE $temp_db;"

  # standard dump contains 'use' statements. Statements only after the last use might take effect
  # via mysql, therefore we strip them out
  sed '/^USE /d' "$dump_file" > "${dump_file}.tmp"

  echo "Restoring dump into $temp_db..." >&2
  mysql --defaults-extra-file="$cnf_file" "$temp_db" < "${dump_file}.tmp"

  # Return the temp database name
  echo "$temp_db"
}
