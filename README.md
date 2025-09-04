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
# the target db config
[DB_VALUES]
DB_HOST=dbHost
DB_PORT=dbPort
DB_USER=dbUser
DB_PASSWORD=dbPassword
DB_NAME=dbName


# the temp database config
DB_MIGRATION_HOST=dbMigHost
DB_MIGRATION_PORT=dbMigPort
DB_MIGRATION_USER=dbMigUser
DB_MIGRATION_PASSWORD=dbMigPassword
DB_MIGRATION_NAME=dbMigName

DB_CONTAINER_PORT=4401 # container port of the throwaway database - see docker compose

[SQL_DUMP]
MIGRATIONS_DIR=migrations # migration file dir
SCHEMA_OUTPUT_DIR=dir # output directory for schema dump 
SCHEMA_SNAPSHOT_DIR=snapshot # directory of the db snapshot - used by check:migrations
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
Run the sql schema dump with the following command:
```sh
    npm run dump:schema
```

Run with the following command to create the database migration history table:
```sh
    npm run docker:init-mig-database
```

Run the migration with the following command:
```sh
    npm run migrate or npm run dev ( for local instance - setup the .local.env accordingly)
```
Note: database parameters defined inside env variables.

To run using docker, use the following command;
CAUTION: this resets the containers, do not use in production
```sh
    npm run docker:reset
```

Starts the mysql service in a container. If container already exists, does nothing. Defined by DB_MIGRATION parameters
```sh
    npm run docker:start
```

## Testing
To use tests run:

```sh
    npm run tests
```

You will need to setup a .env.integration file and have a working database instance:
The lower part is needed for the tests to grab the appropriate files (currently not working, grabbing .env file)
```sh
    DB_HOST=dbHost
    DB_PORT=dbPort
    DB_USER=dbUser
    DB_PASSWORD=dbPassword
    DB_NAME=dbName
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

The consumer should have a package.json in its root, it should look like this 
```sh
{
  "name": "my-dotnet-client",
  "version": "1.0.0",
    "scripts": {
    "copy-env": "cp .env node_modules/girigiri/.env",
    "prepare:tool": "npm run build:tool && npm run copy-env",
    "build:tool": "npm run build --prefix node_modules/girigiri",
    "dump:schema": "node node_modules/girigiri/dist/main.js dump:schema",
    "check:migrations": "node node_modules/girigiri/dist/main.js check:migrations",
    "migrate": "node node_modules/girigiri/dist/main.js migrate"
  },
  "dependencies": {
    "girigiri": "git+https://github.com/inovait/girigiri.git#main" - or a branch
  },
  "devDependencies": {
    "cross-env": "^10.0.0",
    "tsx": "^4.20.5"
  }
}
