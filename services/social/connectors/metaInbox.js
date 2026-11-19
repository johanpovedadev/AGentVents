require('dotenv').config();

const { getJson } = require('../http');

/**
 * Bandeja de entrada de Meta: conversaciones de Instagram Direct y de Messenger
 * (página de Facebook) vía Graph API — API oficial, nada de scraping (ADR-005).
 *
 * Necesita un token de PÁGINA (FB_PAGE_ACCESS_TOKEN) con los permisos
 * pages_messaging, pages_read_engagement e instagram_manage_messages, y el id
 * de la página (FB_PAGE_ID). Igual que las métricas propias (ADR-006), hoy solo
 * sirve para la cuenta conectada de Johan; la de cada cliente llega con OAuth.
 */

const CONVERSATION_LIMIT = 25;
const MESSAGE_LIMIT = 25;
const MESSAGE_FIELDS = 'id,message,created_time,from';
const PLATFORMS = { instagram: 'instagram', facebook: 'messenger' };

function config() {
  return {
    base: process.env.META_GRAPH_BASE_URL || 'https://graph.facebook.com/v21.0',
    token: process.env.FB_PAGE_ACCESS_TOKEN || process.env.IG_ACCESS_TOKEN,
    pageId: process.env.FB_PAGE_ID,
    igId: process.env.IG_BUSINESS_ACCOUNT_ID
  };
}

function requireConfig() {
  const c = config();
  if (!c.token || !c.pageId) {
    throw new Error('Faltan FB_PAGE_ACCESS_TOKEN o FB_PAGE_ID para leer los mensajes de redes.');
  }
  return c;
}

/** Nombre visible de quien escribe: @usuario en Instagram, nombre en Facebook. */
function displayName(person) {
  if (!person) return null;
  if (person.username) return `@${person.username}`;
  return person.name || null;
}

/**
 * Pasa una conversación de la Graph API al formato común:
 * { conversationId, contactId, contactName, messages: [{ id, direction, body, sentAt }] }
 * Los mensajes salen en orden cronológico. Un mensaje sin texto (sticker, foto,
 * audio) se guarda con body null: existe, pero no hay texto que mostrar.
 * `ownIds` son los ids de nuestra página/cuenta: lo que viene de ahí es OUTBOUND.
 */
function normalizeConversation(conv, ownIds) {
  const own = new Set(ownIds.filter(Boolean).map(String));
  const messages = ((conv.messages && conv.messages.data) || [])
    .filter((m) => m && m.id && m.created_time && m.from && m.from.id)
    .map((m) => ({
      id: String(m.id),
      direction: own.has(String(m.from.id)) ? 'OUTBOUND' : 'INBOUND',
      body: m.message ? String(m.message) : null,
      sentAt: new Date(m.created_time).toISOString(),
      from: m.from
    }))
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt));

  const participants = (conv.participants && conv.participants.data) || [];
  const contact = participants.find((p) => p && p.id && !own.has(String(p.id)))
    || (messages.find((m) => m.direction === 'INBOUND') || {}).from
    || null;
  if (!contact || !contact.id) return null;

  return {
    conversationId: String(conv.id),
    contactId: String(contact.id),
    contactName: displayName(contact),
    messages: messages.map(({ from, ...rest }) => rest)
  };
}

/**
 * Conversaciones recientes de una red ('instagram' o 'facebook'), las más
 * recientes primero. Lanza error si Meta rechaza (token vencido, sin permiso):
 * el recolector lo registra por red sin frenar la otra.
 */
async function fetchConversations(platform, deps = {}) {
  const fetchJson = deps.getJson || getJson;
  const c = requireConfig();
  const metaPlatform = PLATFORMS[platform];
  if (!metaPlatform) throw new Error(`Red sin bandeja de mensajes: ${platform}`);
  const fields = `id,updated_time,participants,messages.limit(${MESSAGE_LIMIT}){${MESSAGE_FIELDS}}`;
  const url = `${c.base}/${c.pageId}/conversations?platform=${metaPlatform}&limit=${CONVERSATION_LIMIT}`
    + `&fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(c.token)}`;
  const body = await fetchJson(url);
  const ownIds = [c.pageId, c.igId];
  return (body.data || []).map((conv) => normalizeConversation(conv, ownIds)).filter(Boolean);
}

module.exports = { fetchConversations, normalizeConversation, displayName, PLATFORMS };
