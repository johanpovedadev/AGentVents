const licenseService = require('../licenseService');

/**
 * Escucha de mensajes de redes (Instagram Direct y Messenger).
 * Johan, 19 nov 2026: "necesitamos escuchar también los mensajes de redes".
 *
 * Por cada corrida:
 *   1. Verifica la licencia SOCIAL del tenant dueño de la cuenta conectada
 *      (falla cerrado si Lion Platform no responde, ADR-002).
 *   2. Trae las conversaciones recientes de cada red y guarda los mensajes en
 *      social.message (idempotente: un mensaje ya guardado no se repite).
 *   3. Si el tenant también tiene CRM, pasa cada conversación a Lion Platform:
 *      crea el prospecto (etiqueta ig:<id> o fb:<id>) o le suma los mensajes.
 *   4. Devuelve las conversaciones sin responder que recibieron mensajes nuevos,
 *      para avisar por Telegram solo cuando hay algo que atender.
 */

const MAX_CRM_MESSAGES = 40;
const SOURCES = { instagram: 'INSTAGRAM', facebook: 'FACEBOOK' };
const TAG_PREFIX = { instagram: 'ig', facebook: 'fb' };

function defaultDeps() {
  return {
    db: require('./db'),
    inbox: require('./connectors/metaInbox'),
    loadLicenses: licenseService.loadLicenses,
    crm: require('../lionPlatformClient')
  };
}

/**
 * Tenant dueño de la cuenta conectada: SOCIAL_INBOX_TENANT_ID si está, si no el
 * de la cuenta propia de Instagram registrada en social.account.
 */
async function resolveTenant(db, env = process.env) {
  if (env.SOCIAL_INBOX_TENANT_ID) return String(env.SOCIAL_INBOX_TENANT_ID);
  const rows = await db.query(
    "SELECT DISTINCT tenant_id FROM social.account WHERE active AND NOT is_competitor AND platform = 'instagram' ORDER BY tenant_id"
  );
  if (rows.length === 1) return String(rows[0].tenant_id);
  return null;
}

function contactTag(platform, contactId) {
  return `${TAG_PREFIX[platform]}:${contactId}`;
}

/** Guarda los mensajes de una conversación; devuelve los que eran nuevos. */
async function saveConversation(db, tenantId, platform, conv) {
  const fresh = [];
  for (const m of conv.messages) {
    const rows = await db.query(
      `INSERT INTO social.message (tenant_id, platform, conversation_id, platform_message_id, contact_id, contact_name, direction, body, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (tenant_id, platform, platform_message_id) DO NOTHING
       RETURNING id`,
      [tenantId, platform, conv.conversationId, m.id, conv.contactId, conv.contactName, m.direction, m.body, m.sentAt]
    );
    if (rows.length) fresh.push(m);
  }
  return fresh;
}

/** Pasa una conversación al CRM: busca el prospecto por su etiqueta de red o lo crea. */
async function syncToCrm(crm, prospectsByTag, platform, conv, result) {
  const tag = contactTag(platform, conv.contactId);
  const label = conv.contactName || tag;
  let prospect = prospectsByTag.get(tag);
  if (!prospect) {
    const firstInbound = conv.messages.find((m) => m.direction === 'INBOUND' && m.body);
    const created = await crm.createProspect({
      nombre: conv.contactName || tag,
      fuente: SOURCES[platform],
      resumen: firstInbound ? `Escribió por ${platform}: ${firstInbound.body}` : `Conversación por ${platform}`,
      siguientePaso: `Responder el mensaje de ${platform}`,
      temperatura: 'WARM'
    });
    if (!created.success) {
      result.errores.push(`${label} (CRM): ${created.error}`);
      return;
    }
    prospect = created.data;
    prospectsByTag.set(tag, prospect);
    result.crm.creados.push(label);
    const tagged = await crm.updateTags(prospect.id, [...new Set([...(prospect.tags || []), tag, 'redes'])]);
    if (!tagged.success) result.errores.push(`${label} (etiquetas): ${tagged.error}`);
  } else {
    result.crm.actualizados.push(label);
  }
  const messages = conv.messages
    .filter((m) => m.body)
    .slice(-MAX_CRM_MESSAGES)
    .map((m) => ({ direction: m.direction, body: m.body.slice(0, 4000), sentAt: m.sentAt }));
  if (messages.length) {
    const saved = await crm.recordMessages(prospect.id, messages);
    if (!saved.success) result.errores.push(`${label} (mensajes): ${saved.error}`);
  }
}

/** Índice de prospectos por sus etiquetas ig:/fb:. */
async function loadProspectsByTag(crm) {
  const listed = await crm.listProspects();
  if (!listed.success) return { error: listed.error };
  const map = new Map();
  for (const p of listed.data || []) {
    for (const t of p.tags || []) {
      if (/^(ig|fb):/.test(t) && !map.has(t)) map.set(t, p);
    }
  }
  return { map };
}

async function collectMessages(deps = {}, env = process.env) {
  const { db, inbox, loadLicenses, crm } = { ...defaultDeps(), ...deps };
  const [run] = await db.query("INSERT INTO social.job_run (job) VALUES ('inbox') RETURNING id");
  const result = {
    conversaciones: 0,
    nuevos: 0,
    sinResponder: [],
    crm: { creados: [], actualizados: [], omitido: null },
    errores: []
  };
  const finish = async (status) => {
    await db.query('UPDATE social.job_run SET finished_at = now(), status = $2, summary = $3 WHERE id = $1', [run.id, status, result]);
  };

  const licenses = await loadLicenses();
  if (!licenses.success) {
    result.errores.push(`Licencias: ${licenses.error}`);
    await finish('FAILED');
    return { success: false, error: licenses.error, result };
  }
  const tenantId = await resolveTenant(db, env);
  if (!tenantId) {
    const error = 'No sé de qué tenant es la cuenta conectada: define SOCIAL_INBOX_TENANT_ID.';
    result.errores.push(error);
    await finish('FAILED');
    return { success: false, error, result };
  }
  if (!licenseService.hasProduct(licenses.data, tenantId, licenseService.PRODUCTS.SOCIAL)) {
    result.errores.push(`Tenant ${tenantId} sin licencia SOCIAL activa: no se leen sus mensajes.`);
    await finish('SKIPPED');
    return { success: true, result };
  }

  const withCrm = licenseService.hasProduct(licenses.data, tenantId, licenseService.PRODUCTS.CRM);
  let prospectsByTag = null;
  if (withCrm) {
    const loaded = await loadProspectsByTag(crm);
    if (loaded.error) result.crm.omitido = `no pude leer los prospectos: ${loaded.error}`;
    else prospectsByTag = loaded.map;
  } else {
    result.crm.omitido = 'el tenant no tiene licencia CRM';
  }

  for (const platform of Object.keys(SOURCES)) {
    let conversations;
    try {
      conversations = await inbox.fetchConversations(platform);
    } catch (error) {
      result.errores.push(`${platform}: ${error.message}`);
      continue;
    }
    for (const conv of conversations) {
      result.conversaciones += 1;
      const fresh = await saveConversation(db, tenantId, platform, conv);
      result.nuevos += fresh.length;
      const last = conv.messages[conv.messages.length - 1];
      if (last && last.direction === 'INBOUND' && fresh.some((m) => m.direction === 'INBOUND')) {
        result.sinResponder.push({ plataforma: platform, contacto: conv.contactName || contactTag(platform, conv.contactId), texto: last.body, enviado: last.sentAt });
      }
      if (prospectsByTag && fresh.length) await syncToCrm(crm, prospectsByTag, platform, conv, result);
    }
  }

  await finish(result.errores.length ? 'PARTIAL' : 'OK');
  return { success: true, result };
}

/** Texto para Telegram. Nunca más de 10 conversaciones ni 120 caracteres por mensaje. */
function formatSummary(outcome) {
  const r = outcome.result;
  const lines = [`💬 Mensajes de redes: ${r.nuevos} nuevo(s) en ${r.conversaciones} conversación(es).`];
  if (r.sinResponder.length) {
    lines.push(`🔔 Sin responder (${r.sinResponder.length}):`);
    for (const s of r.sinResponder.slice(0, 10)) {
      const texto = s.texto ? `"${s.texto.slice(0, 120)}${s.texto.length > 120 ? '…' : ''}"` : '(sin texto: foto, audio o sticker)';
      lines.push(`• ${s.plataforma} ${s.contacto}: ${texto}`);
    }
  }
  if (r.crm.creados.length) lines.push(`🆕 Prospectos nuevos en Lion Platform: ${r.crm.creados.slice(0, 10).join(', ')}`);
  if (r.crm.omitido) lines.push(`⏭️ CRM: ${r.crm.omitido}`);
  for (const e of r.errores.slice(0, 5)) lines.push(`⚠️ ${e}`);
  return lines.join('\n');
}

/** ¿Vale la pena avisar? Solo si hay algo nuevo sin responder o algo falló. */
function shouldNotify(outcome) {
  return !outcome.success || outcome.result.sinResponder.length > 0 || outcome.result.errores.length > 0;
}

module.exports = { collectMessages, formatSummary, shouldNotify, resolveTenant, contactTag, saveConversation };
