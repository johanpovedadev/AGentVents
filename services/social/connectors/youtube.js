require('dotenv').config();

const { getJson, toNumber } = require('../http');

/**
 * Conector de YouTube vía YouTube Data API v3 con API key. Los datos públicos
 * (suscriptores, vistas, likes, comentarios) se leen igual para un canal propio
 * o de la competencia, así que sirve para cualquier tenant desde ya. La
 * retención segundo a segundo de canales propios llega después con OAuth
 * (YouTube Analytics API).
 */

const BASE = 'https://www.googleapis.com/youtube/v3';
const VIDEO_LIMIT = 30;

function apiKey() {
  if (!process.env.YOUTUBE_API_KEY) throw new Error('Falta la variable de entorno YOUTUBE_API_KEY.');
  return process.env.YOUTUBE_API_KEY;
}

/** Duración ISO 8601 de YouTube ("PT1H2M3S") a segundos. null si no se reconoce. */
function parseDuration(iso) {
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(iso || ''));
  if (!match || iso === 'P' || iso === 'PT') return null;
  const [, d, h, m, s] = match.map((v) => Number(v || 0));
  return d * 86400 + h * 3600 + m * 60 + s;
}

/** Busca el canal por @handle (o por id si empieza con UC). */
async function resolveChannel(account, key) {
  const raw = String(account.external_id || account.handle || '').trim();
  const query = raw.startsWith('UC') ? `id=${encodeURIComponent(raw)}` : `forHandle=${encodeURIComponent(raw.startsWith('@') ? raw : `@${raw}`)}`;
  const body = await getJson(`${BASE}/channels?part=snippet,statistics,contentDetails&${query}&key=${key}`);
  const channel = body.items && body.items[0];
  if (!channel) throw new Error(`No existe el canal de YouTube ${raw}.`);
  return channel;
}

function normalizeVideo(video) {
  const stats = video.statistics || {};
  return {
    platformMediaId: String(video.id),
    mediaType: 'VIDEO',
    caption: (video.snippet && video.snippet.title) || null,
    publishedAt: (video.snippet && video.snippet.publishedAt) || null,
    durationS: parseDuration(video.contentDetails && video.contentDetails.duration),
    permalink: `https://www.youtube.com/watch?v=${video.id}`,
    metrics: {
      views: toNumber(stats.viewCount),
      likes: toNumber(stats.likeCount),
      comments: toNumber(stats.commentCount),
      shares: null,
      saves: null,
      reach: null,
      avgWatchS: null,
      skipRate: null
    }
  };
}

/** Interfaz común de conectores: datos del canal y sus videos recientes. */
async function fetchAccount(account) {
  const key = apiKey();
  const channel = await resolveChannel(account, key);
  const stats = channel.statistics || {};
  const uploads = channel.contentDetails && channel.contentDetails.relatedPlaylists && channel.contentDetails.relatedPlaylists.uploads;
  let media = [];
  if (uploads) {
    const list = await getJson(`${BASE}/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=${VIDEO_LIMIT}&key=${key}`);
    const ids = (list.items || []).map((i) => i.contentDetails && i.contentDetails.videoId).filter(Boolean);
    if (ids.length > 0) {
      const videos = await getJson(`${BASE}/videos?part=snippet,statistics,contentDetails&id=${ids.join(',')}&key=${key}`);
      media = (videos.items || []).map(normalizeVideo);
    }
  }
  return {
    account: {
      externalId: String(channel.id),
      followers: stats.hiddenSubscriberCount ? null : toNumber(stats.subscriberCount),
      mediaCount: toNumber(stats.videoCount)
    },
    media
  };
}

module.exports = { fetchAccount, parseDuration, normalizeVideo };
