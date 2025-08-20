#!/bin/bash

read -p "Are you sure you want to reset Docker containers and volumes? This will delete all the instances of your running containers (y/n): " choice
case "$choice" in
  y|Y ) 
    echo "Proceeding..."
    docker compose --env-file .env down -v
    docker compose --env-file .env up -d --build
    ;;
  * ) 
    echo "Cancelled by user"
    exit 0
    ;;
esac
