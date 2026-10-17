const licenseService = require('../licenseService');

/**
 * Recolector diario. Por cada cuenta activa de social.account:
 *   1. Verifica que su tenant tenga licencia SOCIAL activa en Lion Platform.
 *      Sin licencia → se omite (no se consulta la red ni se guarda nada).
 *   2. Pide los datos al conector de su red.
 *   3. Guarda la foto del día de la cuenta y de cada publicación.
 *
 * Es idempotente: correrlo dos veces el mismo día sobrescribe la foto de ese
 * día en vez de duplicarla. Un error en una cuenta se registra y no frena a las
 * demás. Si las licencias no se pueden verificar, no se procesa ninguna cuenta.
 */

const RECENT_DAYS = 30;

/** Dependencias reales, cargadas solo cuando no se inyectan (las pruebas inyectan las suyas). */
function defaultDeps() {
  return {
    db: require('./db'),
    connectors: {
      instagram: require('./connectors/instagram'),
      youtube: require('./connectors/youtube')
    },
    loadLicenses: licenseService.loadLicenses
  };
}

/** Fecha YYYY-MM-DD en UTC. */
function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Retención (SOC-RNF-07): publicaciones de los últimos 30 días se fotografían a
 * diario; las más viejas solo los lunes, para no llenar los 0,5 GB de Neon.
 */
function shouldSnapshot(publishedAt, today) {
  if (!publishedAt) return true;
  const ageDays = (today.getTime() - new Date(publishedAt).getTime()) / 86400000;
  return ageDays <= RECENT_DAYS || today.getUTCDay() === 1;
}

async function saveAccountData(db, account, data, today) {
  const day = isoDay(today);
  await db.query('UPDATE social.account SET external_id = COALESCE(external_id, $2) WHERE id = $1', [account.id, data.account.externalId]);
  await db.query(
    `INSERT INTO social.account_snapshot (account_id, day, followers, media_count) VALUES ($1, $2, $3, $4)
     ON CONFLICT (account_id, day) DO UPDATE SET followers = EXCLUDED.followers, media_count = EXCLUDED.media_count`,
    [account.id, day, data.account.followers, data.account.mediaCount]
  );

  let snapshots = 0;
  for (const m of data.media) {
    const [row] = await db.query(
      `INSERT INTO social.media (account_id, platform_media_id, media_type, caption, published_at, duration_s, permalink)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (account_id, platform_media_id) DO UPDATE SET caption = EXCLUDED.caption, media_type = EXCLUDED.media_type,
         duration_s = COALESCE(EXCLUDED.duration_s, social.media.duration_s), permalink = EXCLUDED.permalink
       RETURNING id`,
      [account.id, m.platformMediaId, m.mediaType, m.caption, m.publishedAt, m.durationS, m.permalink]
    );
    if (!shouldSnapshot(m.publishedAt, today)) continue;
    const x = m.metrics;
    await db.query(
      `INSERT INTO social.media_snapshot (media_id, day, views, likes, comments, shares, saves, reach, avg_watch_s, skip_rate)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (media_id, day) DO UPDATE SET views = EXCLUDED.views, likes = EXCLUDED.likes, comments = EXCLUDED.comments,
         shares = EXCLUDED.shares, saves = EXCLUDED.saves, reach = EXCLUDED.reach, avg_watch_s = EXCLUDED.avg_watch_s, skip_rate = EXCLUDED.skip_rate`,
      [row.id, day, x.views, x.likes, x.comments, x.shares, x.saves, x.reach, x.avgWatchS, x.skipRate]
    );
    snapshots += 1;
  }
  return snapshots;
}

/** Corre la recolección completa y devuelve el resumen (también queda en social.job_run). */
async function collect(deps = {}, today = new Date()) {
  const { db, connectors, loadLicenses } = { ...defaultDeps(), ...deps };
  const [run] = await db.query("INSERT INTO social.job_run (job) VALUES ('collect') RETURNING id");
  const summary = { procesadas: 0, fotos: 0, omitidas: [], errores: [] };

  const licenses = await loadLicenses();
  if (!licenses.success) {
    summary.errores.push({ cuenta: null, error: licenses.error });
    await db.query("UPDATE social.job_run SET finished_at = now(), status = 'FAILED', summary = $2 WHERE id = $1", [run.id, summary]);
    return { success: false, error: licenses.error, summary };
  }

  const accounts = await db.query('SELECT * FROM social.account WHERE active ORDER BY tenant_id, id');
  for (const account of accounts) {
    const label = `${account.platform} @${account.handle} (tenant ${account.tenant_id})`;
    if (!licenseService.hasProduct(licenses.data, account.tenant_id, licenseService.PRODUCTS.SOCIAL)) {
      summary.omitidas.push({ cuenta: label, motivo: 'sin licencia SOCIAL activa' });
      continue;
    }
    const connector = connectors[account.platform];
    if (!connector) {
      summary.omitidas.push({ cuenta: label, motivo: 'red sin conector todavía' });
      continue;
    }
    try {
      const data = await connector.fetchAccount(account);
      summary.fotos += await saveAccountData(db, account, data, today);
      summary.procesadas += 1;
    } catch (error) {
      summary.errores.push({ cuenta: label, error: error.message });
    }
  }

  const status = summary.errores.length === 0 ? 'OK' : 'PARTIAL';
  await db.query('UPDATE social.job_run SET finished_at = now(), status = $2, summary = $3 WHERE id = $1', [run.id, status, summary]);
  return { success: true, summary };
}

/** Texto corto para Telegram cuando la corrida tuvo errores u omisiones. */
function formatSummary(result) {
  const s = result.summary;
  const lines = [`Recolección de redes: ${s.procesadas} cuenta(s), ${s.fotos} foto(s) de publicaciones.`];
  for (const o of s.omitidas) lines.push(`⏭️ ${o.cuenta}: ${o.motivo}`);
  for (const e of s.errores) lines.push(`⚠️ ${e.cuenta || 'general'}: ${e.error}`);
  return lines.join('\n');
}

module.exports = { collect, formatSummary, shouldSnapshot, isoDay };
