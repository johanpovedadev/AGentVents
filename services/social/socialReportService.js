require('dotenv').config();

const licenseService = require('../licenseService');
const analytics = require('./analytics');

const TOP = 3;
const LOOKBACK_DAYS = 30;

function defaultDeps() {
  return { db: require('./db'), requireProduct: licenseService.requireProduct };
}

function fmt(n) {
  return typeof n === 'number' ? n.toLocaleString('es-CO') : 's/d';
}

function shortCaption(text) {
  const clean = String(text || '(sin texto)').replace(/\s+/g, ' ').trim();
  return clean.length > 60 ? `${clean.slice(0, 57).trimEnd()}…` : clean;
}

/**
 * Informe de redes de un tenant: crecimiento de seguidores, ganadores propios y
 * ganadores de la competencia. Cada publicación se compara contra la mediana de
 * su propia cuenta (últimos 30 días) y se listan las publicadas en los últimos
 * `dias` días. Exige licencia SOCIAL activa del tenant.
 */
async function generateSocialReport(datos = {}, deps = {}) {
  const { db, requireProduct } = { ...defaultDeps(), ...deps };
  const tenantId = datos.tenantId || process.env.SOCIAL_TENANT_ID;
  const dias = Number(datos.dias) > 0 ? Number(datos.dias) : 7;
  if (!tenantId) return { success: false, error: 'Falta el tenant (SOCIAL_TENANT_ID).' };

  const license = await requireProduct(tenantId, licenseService.PRODUCTS.SOCIAL);
  if (!license.success) return license;

  const followers = await db.query(
    `SELECT a.id, a.platform, a.handle, a.is_competitor,
            (SELECT followers FROM social.account_snapshot s WHERE s.account_id = a.id ORDER BY day DESC LIMIT 1) AS actual,
            (SELECT followers FROM social.account_snapshot s WHERE s.account_id = a.id AND s.day <= current_date - $2::int ORDER BY day DESC LIMIT 1) AS anterior
       FROM social.account a WHERE a.tenant_id = $1 AND a.active ORDER BY a.is_competitor, a.platform, a.handle`,
    [tenantId, dias]
  );
  const rows = await db.query(
    `SELECT a.id AS account_id, a.platform, a.handle, a.is_competitor, m.caption, m.permalink, m.published_at,
            s.views, s.likes, s.comments
       FROM social.account a
       JOIN social.media m ON m.account_id = a.id
       JOIN LATERAL (SELECT views, likes, comments FROM social.media_snapshot ms WHERE ms.media_id = m.id ORDER BY day DESC LIMIT 1) s ON TRUE
      WHERE a.tenant_id = $1 AND a.active AND m.published_at >= now() - ($2::int * interval '1 day')`,
    [tenantId, LOOKBACK_DAYS]
  );

  if (followers.length === 0) {
    return { success: true, data: 'Todavía no hay cuentas registradas para este tenant.', ganadores: [] };
  }

  const byAccount = new Map();
  for (const r of rows) {
    if (!byAccount.has(r.account_id)) byAccount.set(r.account_id, []);
    byAccount.get(r.account_id).push({ ...r, views: r.views === null ? null : Number(r.views), likes: r.likes === null ? null : Number(r.likes) });
  }

  const cutoff = Date.now() - dias * 86400000;
  const winners = [];
  const lowSample = [];
  for (const [, media] of byAccount) {
    const scored = analytics.scoreAccountMedia(media);
    if (!scored.enoughSample) lowSample.push(`@${media[0].handle} (${scored.sampleSize})`);
    for (const m of scored.media) {
      if (m.label === 'ganador' && new Date(m.published_at).getTime() >= cutoff) winners.push(m);
    }
  }
  winners.sort((a, b) => b.score - a.score);
  const own = winners.filter((w) => !w.is_competitor).slice(0, TOP);
  const rivals = winners.filter((w) => w.is_competitor).slice(0, TOP);

  const lines = [`Últimos ${dias} días`, '', 'Seguidores:'];
  for (const f of followers) {
    const growth = analytics.followerGrowth(f.actual === null ? null : Number(f.actual), f.anterior === null ? null : Number(f.anterior));
    const delta = growth === null ? '' : ` (${growth >= 0 ? '+' : ''}${fmt(growth)})`;
    lines.push(`• ${f.is_competitor ? '[competencia] ' : ''}${f.platform} @${f.handle}: ${fmt(f.actual === null ? null : Number(f.actual))}${delta}`);
  }
  const line = (w) => `• ${w.score}× ${w.metric === 'views' ? 'vistas' : 'likes'} — @${w.handle}: "${shortCaption(w.caption)}" ${w.permalink || ''}`.trim();
  lines.push('', 'Tus ganadores (frente a tu propia mediana):', ...(own.length ? own.map(line) : ['• Ninguno esta semana.']));
  lines.push('', 'Ganadores de la competencia:', ...(rivals.length ? rivals.map(line) : ['• Ninguno esta semana.']));
  if (lowSample.length) {
    lines.push('', `⚠️ Poca muestra (menos de ${analytics.MIN_SAMPLE} publicaciones en 30 días): ${lowSample.join(', ')}. Tómalo como pista, no como patrón.`);
  }

  return { success: true, data: lines.join('\n'), ganadores: [...own, ...rivals] };
}

module.exports = { generateSocialReport, shortCaption };
