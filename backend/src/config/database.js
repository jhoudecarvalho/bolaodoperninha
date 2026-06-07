import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'bolao',
  password: process.env.DB_PASSWORD || 'bolao2026',
  database: process.env.DB_NAME || 'bolao_copa2026',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z', // armazenamos/comparamos tudo em UTC
});

export async function testConnection() {
  const conn = await pool.getConnection();
  try {
    await conn.query('SELECT 1');
    console.log('✅ MySQL conectado:', process.env.DB_NAME);
  } finally {
    conn.release();
  }
}

export default pool;
