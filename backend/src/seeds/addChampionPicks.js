import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'bolao',
  password: process.env.DB_PASSWORD || 'bolao2026',
  database: process.env.DB_NAME || 'bolao_copa2026',
});

try {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS champion_picks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      player_id INT NOT NULL UNIQUE,
      team_id INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY (team_id) REFERENCES teams(id)
    )
  `);
  console.log('✅ Tabela champion_picks criada (ou já existia).');
} catch (err) {
  console.error('❌ Erro:', err.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
