import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  // Conecta sem selecionar database (o schema cria/usa o DB)
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'bolao',
    password: process.env.DB_PASSWORD || 'bolao2026',
    multipleStatements: true,
  });

  try {
    console.log('🔧 Aplicando schema.sql...');
    await conn.query(sql);
    console.log('✅ Schema aplicado com sucesso.');
  } catch (err) {
    console.error('❌ Erro ao aplicar schema:', err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

migrate();
