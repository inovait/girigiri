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

[SQL_DUMP]
NO_COMMENTS=false # with or without comments
NO_TRAIL=false # with or without table options
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

To run using docker, use the following command;
```sh
    npm run docker:reset
```

### Additional info
To check which migrations were successful, please query your database with;
```sh
    Select * from migrations
```