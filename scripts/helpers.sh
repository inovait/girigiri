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
    --single-transaction --routines --triggers --events \
    --databases "$db_name" > "$output_file"
}

# create temporary db from sql dump
create_temp_db_from_dump() {
  local cnf_file="$1"
  local dump_file="$2"
  local prefix="$3"

  local temp_db="${prefix}_$(date +%s)"
  echo "Creating temporary database: $temp_db"
  mysql --defaults-extra-file="$cnf_file" -e "CREATE DATABASE $temp_db;"

  # temp db dropped on exit ( and temp files )
  trap "echo 'Dropping temp database: $temp_db'; \
        mysql --defaults-extra-file='$cnf_file' -e 'DROP DATABASE IF EXISTS $temp_db;'; \
        echo 'Removing dump file: $dump_file'; \
        rm -f '$dump_file'" EXIT

  echo "Restoring dump into $temp_db..."
  mysql --defaults-extra-file="$cnf_file" "$temp_db" < "$dump_file"

  # return tmp db name
  echo "$temp_db"
}
