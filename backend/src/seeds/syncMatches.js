import pool from '../config/database.js';
import { importMatches } from '../services/matchesImporter.js';

/**
 * Atualiza a tabela de jogos a partir da API (não-destrutivo).
 *   npm run sync:matches
 */
(async () => {
  try {
    const res = await importMatches();
    console.log('Resultado:', res);
  } catch (err) {
    console.error('❌ Erro ao sincronizar jogos:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
