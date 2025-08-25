export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  waitForConnections: boolean;
  multipleStatements: boolean;
  connectionLimits: number
  queveLimit: number
}
