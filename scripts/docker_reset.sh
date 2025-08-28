#!/bin/bash

read -p "Are you sure you want to reset the 'mysqldb' container and its volumes? (y/n): " choice
case "$choice" in
  y|Y ) 
    echo "Proceeding with reset of mysqldb..."
    docker compose --env-file .env rm -sfv mysqldb
    docker compose --env-file .env up -d --build mysqldb
    ;;
  * ) 
    echo "Cancelled by user"
    exit 0
    ;;
esac
