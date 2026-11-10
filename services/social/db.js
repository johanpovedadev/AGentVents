require('dotenv').config();

let pool = null;

/**
 * Pool de conexiones a Postgres (Neon). Se crea al primer uso — así las pruebas
 * que inyectan una base falsa nunca cargan el driver ni abren conexiones.
 */
function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('Falta la variable de entorno DATABASE_URL.');
    const { Pool } = require('pg');
    // Neon exige SSL. DATABASE_SSL=false solo para una base local de pruebas.
    const ssl = process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: true };
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, ssl });
  }
  return pool;
}

/** Ejecuta una consulta parametrizada y devuelve las filas. */
async function query(text, params = []) {
  const result = await getPool().query(text, params);
  return result.rows;
}

/** Cierra el pool al final de un script para que el proceso termine. */
async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { query, close };
