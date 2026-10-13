require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const db = require('../services/social/db');

/**
 * Aplica en orden los .sql de /migrations que todavía no se aplicaron. Lleva el
 * registro en social.schema_migrations. Regla (igual que Flyway en el CRM):
 * nunca se edita una migración ya aplicada; se crea una nueva.
 */
async function main() {
  await db.query('CREATE SCHEMA IF NOT EXISTS social');
  await db.query('CREATE TABLE IF NOT EXISTS social.schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const applied = new Set((await db.query('SELECT name FROM social.schema_migrations')).map((r) => r.name));
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await db.query('BEGIN');
    try {
      await db.query(sql);
      await db.query('INSERT INTO social.schema_migrations (name) VALUES ($1)', [file]);
      await db.query('COMMIT');
      console.log(`Aplicada: ${file}`);
    } catch (error) {
      await db.query('ROLLBACK');
      throw new Error(`Falló ${file}: ${error.message}`);
    }
  }
  console.log('Migraciones al día.');
}

main()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => db.close());
