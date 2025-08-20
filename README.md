# girigiri

A simple applicaton that triggers migrations based on the defined sql files.
If a query fails, it safely rollsback the last changes. 
The successful migrations are inserted into a migrations table.

## Prerequisites
Before you begin, ensure you have the following installed on your machine:

- Node.js (v18.x or higher is recommended)
- npm or Yarn

## Configuration

Create a .env file:
Copy the .env.example file and rename it to local.env. Fill in your environment-specific variables. (for local development)

```sh
[DB_VALUES]
DB_HOST=dbHost
DB_PORT=dbPort
DB_USER=dbUser
DB_PASSWORD=dbPassword
DB_NAME=dbName

DB_MIGRATION_HOST=dbMigHost
DB_MIGRATION_PORT=dbMigPort
DB_MIGRATION_USER=dbMigUser
DB_MIGRATION_PASSWORD=dbMigPassword
DB_MIGRATION_NAME=dbMigName

[SQL_DUMP]
NO_COMMENTS=false # with or without comments
NO_TRAIL=false # with or without table options
SCHEMA_OUTPUT_DIR=dir # output directory for schema dump 
```

## Installation
Follow these steps to get the project up and running locally:

Clone the repository;

```sh
git clone https://github.com/inovait/girigiri.git
cd girigiri
```

Install dependencies:

```sh
npm install
or
yarn install
```

## Usage
Run the application with the following command:
```sh
    npm run migrate or npm run dev ( for local instance - setup the .local.env accordingly)
```

Run the sql schema dump with the following command:
```sh
    npm run dump:schema
```

Run with the following command to create the database migration history table:
```sh
    npm run docker:init-mig-database
```

To run using docker, use the following command;
CAUTION: this resets the containers, do not use in production
```sh
    npm run docker:reset
```

Starts the mysql service in a container. If container already exists, does nothing. Defined by DB_MIGRATION parameters
```sh
    npm run docker:start
```

### Additional info
To check which migrations were successful, please query your database with;
```sh
    Select * from migrations
```

To generate a dump of a temp migrated database run;
```sh
    npm run check:migrations
```

To generate a diff the migrations would create in a log file run;
```sh
    npm run check:migrations:diff
```