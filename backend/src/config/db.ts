import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config({ override: true });

const dbOptions: mysql.PoolOptions = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,//process.env.INSTANCE_UNIX_SOCKET ? undefined : (process.env.DB_HOST || 'localhost'),
  port: Number(process.env.DB_PORT), 
  socketPath: process.env.INSTANCE_UNIX_SOCKET || undefined,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbOptions);

export default pool;
