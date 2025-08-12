// This is a union type to accommodate both pg.QueryResult and mysql2.QueryResult.
export type QueryResult = import('pg').QueryResult | import('mysql2/promise').QueryResult;

// Define a generic type for a database connection.
// This is a union type to accommodate both pg.PoolClient and mysql2.PoolConnection.
export type Connection = import('pg').PoolClient | import('mysql2/promise').PoolConnection;

export interface DatabaseClient {

  /**
   * Establishes a connection to the database. For transactional operations,
   * this should acquire a single client from the pool.
   * @returns {Promise<void>}
   */
  connect(): Promise<Connection>

  /**
   * Executes a SQL query.
   * @param {string} sql - The SQL query string with placeholders.
   * @param {Array} [params=[]] - An array of parameters for the query.
   * @returns {Promise<Array<Object>>} - A promise that resolves to an array of result objects.
   */
  query(sql: string, params:[]): Promise<QueryResult>


  beginTransaction(): Promise<void>
  
  /**
   * Commits the current transaction.
   * @returns {Promise<void>}
   */
  commit(): Promise<void>

  /**
   * Rolls back the current transaction.
   * @returns {Promise<void>}
   */
  rollback(): Promise<void>

  /**
   * Disconnects from the database, releasing the client.
   * @returns {Promise<void>}
   */
  disconnect(): Promise<void>
}