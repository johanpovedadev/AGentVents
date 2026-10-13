const test = require('node:test');
const assert = require('node:assert/strict');

// Driver de Postgres falso: la prueba nunca abre una conexión real.
const created = [];
const pgPath = require.resolve('pg');
require.cache[pgPath] = {
  id: pgPath,
  filename: pgPath,
  loaded: true,
  exports: {
    Pool: class {
      constructor(options) { this.options = options; this.ended = false; created.push(this); }
      async query(text, params) { return { rows: [{ text, params }] }; }
      async end() { this.ended = true; }
    }
  }
};
delete require.cache[require.resolve('../../services/social/db')];
const db = require('../../services/social/db');

test('query exige DATABASE_URL', async () => {
  delete process.env.DATABASE_URL;
  await assert.rejects(db.query('SELECT 1'), /DATABASE_URL/);
});

test('query reutiliza un solo pool con SSL y close lo libera', async () => {
  process.env.DATABASE_URL = 'postgresql://u:p@neon.test/db';
  const rows = await db.query('SELECT $1', [1]);
  await db.query('SELECT 2');
  assert.deepEqual(rows, [{ text: 'SELECT $1', params: [1] }]);
  assert.equal(created.length, 1);
  assert.equal(created[0].options.ssl.rejectUnauthorized, true);
  await db.close();
  assert.equal(created[0].ended, true);
  await db.close();
});

test('DATABASE_SSL=false desactiva SSL para una base local de pruebas', async () => {
  process.env.DATABASE_SSL = 'false';
  await db.query('SELECT 1');
  assert.equal(created.at(-1).options.ssl, false);
  delete process.env.DATABASE_SSL;
  await db.close();
});
