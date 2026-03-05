import mysql from 'mysql2/promise';

const {
  DB_HOST = 'localhost',
  DB_PORT = 3306,
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'northwind'
} = process.env;

export const pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  namedPlaceholders: true
});

export const execute = async (sql, params = {}) => {
  const [rows] = await pool.execute(sql, params);
  return rows;
};

export const executeRaw = (sql, params = {}) => pool.execute(sql, params);

export const testConnection = async () => {
  const [row] = await execute('SELECT 1 AS ok');
  return row?.ok === 1;
};
