/**
 * Base de datos falsa para pruebas: guarda cada consulta y responde según el
 * primer patrón que coincida con el SQL. Así las pruebas no necesitan Postgres.
 */
function createFakeDb(routes = []) {
  const calls = [];
  let nextId = 100;
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      for (const [pattern, handler] of routes) {
        if (pattern.test(sql)) return typeof handler === 'function' ? handler(params, sql) : handler;
      }
      if (/RETURNING id/.test(sql)) {
        nextId += 1;
        return [{ id: nextId }];
      }
      return [];
    },
    count(pattern) {
      return calls.filter((c) => pattern.test(c.sql)).length;
    }
  };
}

module.exports = { createFakeDb };
