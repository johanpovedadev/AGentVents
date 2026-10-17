require('dotenv').config();

const { getJson, toNumber } = require('../http');

/**
 * Conector de Instagram vía Graph API (Instagram API con Facebook Login).
 *
 * - Cuenta propia: métricas privadas (alcance, vistas, guardados, compartidos,
 *   tiempo medio). Hoy solo para la cuenta conectada en IG_BUSINESS_ACCOUNT_ID;
 *   las cuentas propias de clientes llegan con OAuth por tenant (fase 6).
 * - Competencia: Business Discovery — solo datos públicos (seguidores, likes,
 *   comentarios) de cuentas Business o Creator. Funciona para cualquier tenant
 *   porque la consulta se hace con nuestra cuenta.
 */

const MEDIA_FIELDS = 'id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count';
const MEDIA_LIMIT = 30;
// Métricas actuales (las viejas "impressions" y "plays" se retiraron en 2025).
const REELS_METRICS = 'reach,views,saved,shares,ig_reels_avg_watch_time';
const FEED_METRICS = 'reach,views,saved,shares';
const FALLBACK_METRICS = 'reach,saved';

function config() {
  return {
    base: process.env.META_GRAPH_BASE_URL || 'https://graph.facebook.com/v21.0',
    token: process.env.IG_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN,
    igId: process.env.IG_BUSINESS_ACCOUNT_ID
  };
}

function requireConfig() {
  const c = config();
  if (!c.token || !c.igId) {
    throw new Error('Faltan IG_ACCESS_TOKEN (o FB_PAGE_ACCESS_TOKEN) o IG_BUSINESS_ACCOUNT_ID.');
  }
  return c;
}

function cleanHandle(handle) {
  return String(handle || '').trim().replace(/^@/, '').toLowerCase();
}

/** Pasa una publicación de la Graph API al formato común de los conectores. */
function normalizeMedia(item, insights = {}) {
  return {
    platformMediaId: String(item.id),
    mediaType: item.media_product_type === 'REELS' ? 'REELS' : (item.media_type || null),
    caption: item.caption || null,
    publishedAt: item.timestamp || null,
    durationS: null,
    permalink: item.permalink || null,
    metrics: {
      views: toNumber(insights.views),
      likes: toNumber(item.like_count),
      comments: toNumber(item.comments_count),
      shares: toNumber(insights.shares),
      saves: toNumber(insights.saved),
      reach: toNumber(insights.reach),
      avgWatchS: insights.ig_reels_avg_watch_time !== undefined && insights.ig_reels_avg_watch_time !== null
        ? Number((Number(insights.ig_reels_avg_watch_time) / 1000).toFixed(2))
        : null,
      skipRate: null
    }
  };
}

/** Lee la respuesta de /insights (values[0].value o total_value.value) como { métrica: valor }. */
function parseInsights(body) {
  const out = {};
  for (const entry of (body && body.data) || []) {
    const value = entry.total_value ? entry.total_value.value
      : (Array.isArray(entry.values) && entry.values[0] ? entry.values[0].value : null);
    out[entry.name] = value;
  }
  return out;
}

/**
 * Métricas privadas de una publicación propia. Si la red rechaza alguna métrica
 * (pasa con publicaciones viejas o tipos sin soporte) se reintenta con un set
 * mínimo, y si también falla se devuelve vacío: mejor sin dato que un 0 falso.
 */
async function fetchInsights(c, item) {
  const metrics = item.media_product_type === 'REELS' ? REELS_METRICS : FEED_METRICS;
  for (const set of [metrics, FALLBACK_METRICS]) {
    try {
      const body = await getJson(`${c.base}/${item.id}/insights?metric=${set}&access_token=${encodeURIComponent(c.token)}`);
      return parseInsights(body);
    } catch (error) {
      // Se intenta el siguiente set de métricas.
    }
  }
  return {};
}

/** Cuenta propia: perfil + últimas publicaciones con sus métricas privadas. */
async function fetchOwn(account) {
  const c = requireConfig();
  if (account.external_id && String(account.external_id) !== String(c.igId)) {
    throw new Error('Cuenta propia sin conexión: necesita OAuth del cliente (fase 6).');
  }
  const profile = await getJson(`${c.base}/${c.igId}?fields=username,followers_count,media_count&access_token=${encodeURIComponent(c.token)}`);
  if (cleanHandle(profile.username) !== cleanHandle(account.handle)) {
    throw new Error(`La cuenta conectada es @${profile.username}, no @${cleanHandle(account.handle)}: necesita OAuth del cliente (fase 6).`);
  }
  const list = await getJson(`${c.base}/${c.igId}/media?fields=${MEDIA_FIELDS}&limit=${MEDIA_LIMIT}&access_token=${encodeURIComponent(c.token)}`);
  const media = [];
  for (const item of list.data || []) {
    media.push(normalizeMedia(item, await fetchInsights(c, item)));
  }
  return {
    account: { externalId: String(c.igId), followers: toNumber(profile.followers_count), mediaCount: toNumber(profile.media_count) },
    media
  };
}

/** Competidor: datos públicos vía Business Discovery. Falla si la cuenta no es Business/Creator. */
async function fetchCompetitor(account) {
  const c = requireConfig();
  const handle = cleanHandle(account.handle);
  const fields = `business_discovery.username(${handle}){id,username,followers_count,media_count,media.limit(${MEDIA_LIMIT}){${MEDIA_FIELDS}}}`;
  const body = await getJson(`${c.base}/${c.igId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(c.token)}`);
  const bd = body.business_discovery;
  if (!bd) throw new Error(`@${handle} no se puede consultar: debe ser una cuenta Business o Creator.`);
  return {
    account: { externalId: String(bd.id), followers: toNumber(bd.followers_count), mediaCount: toNumber(bd.media_count) },
    media: ((bd.media && bd.media.data) || []).map((item) => normalizeMedia(item))
  };
}

/** Interfaz común de conectores: datos de la cuenta y sus publicaciones recientes. */
async function fetchAccount(account) {
  return account.is_competitor ? fetchCompetitor(account) : fetchOwn(account);
}

module.exports = { fetchAccount, parseInsights, normalizeMedia, cleanHandle };
