import bcrypt from 'bcryptjs';
import pool from '../config/database.js';
import { normalizePhone } from '../utils/phone.js';

/**
 * Recria a tabela `users` e cadastra os usuários de acesso.
 * A tabela `users` é independente (sem FKs), então recriá-la NÃO afeta
 * jogadores, palpites ou jogos. A lista abaixo é a fonte da verdade.
 *
 *   npm run seed:users
 *
 * Papéis:
 *   - user  → participa (dá palpites)
 *   - admin → cadastra jogadores e vê tudo, mas NÃO dá palpites
 *
 * Login pode ser por telefone (normalizado) ou por username (ex.: 'Admin').
 */

// Credenciais NÃO ficam versionadas — leia do .env (veja .env.example).
const USERS = [
  {
    name: process.env.SEED_USER_NAME,
    phone: process.env.SEED_USER_PHONE,
    password: process.env.SEED_USER_PASSWORD,
    role: 'user',
  },
  {
    name: process.env.SEED_ADMIN_NAME || 'Admin',
    phone: process.env.SEED_ADMIN_PHONE,
    password: process.env.SEED_ADMIN_PASSWORD,
    role: 'admin',
  },
].filter((u) => u.name && u.phone && u.password);

async function seedUsers() {
  if (!USERS.length) {
    console.error(
      '⚠️  Nenhum usuário configurado. Defina SEED_ADMIN_PHONE/SEED_ADMIN_PASSWORD ' +
        '(e opcionalmente SEED_USER_*) no backend/.env. Veja backend/.env.example.'
    );
    await pool.end();
    process.exitCode = 1;
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.query('DROP TABLE IF EXISTS users');
    await conn.query(`
      CREATE TABLE users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(60) NOT NULL,
        username VARCHAR(40) DEFAULT NULL UNIQUE,
        phone VARCHAR(20) DEFAULT NULL UNIQUE,
        password_hash VARCHAR(100) NOT NULL,
        role ENUM('admin','user') NOT NULL DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    for (const u of USERS) {
      const username = u.username || null;
      const phone = u.phone ? normalizePhone(u.phone) : null;
      const hash = await bcrypt.hash(u.password, 10);
      await conn.query(
        `INSERT INTO users (name, username, phone, password_hash, role)
         VALUES (?, ?, ?, ?, ?)`,
        [u.name, username, phone, hash, u.role || 'user']
      );
      const login = username || phone;
      console.log(`✅ ${u.role === 'admin' ? '[ADMIN]' : '[user] '} ${u.name} (login: ${login})`);
    }

    console.log('🎉 Seed de usuários concluído.');
  } catch (err) {
    console.error('❌ Erro no seed de usuários:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

seedUsers();
