/**
 * Importa a Lion Platform los chats de clientes que la tarea programada de Claude
 * leyó en el WhatsApp Web de Johan (Chrome). Johan, 14 nov 2026: "quiero escucha
 * para llenar Lion Platform", sin programas no oficiales vinculados al 313.
 *
 * La tarea deja archivos JSON en data/chats_entrantes/ con este formato:
 *   { "generado": "2026-11-14T20:45:00-05:00",
 *     "chats": [{ "nombre": "Kate", "telefono": "573214497185", "fuente": "OTRO",
 *                 "etiqueta": "blog", "resumen": "Termales de Chipaque, 3 adultos y 3 niños",
 *                 "temperatura": "WARM", "siguientePaso": "Mandar opciones con niños",
 *                 "fechaSeguimiento": "2026-11-16", "nota": "opcional: queda en el historial",
 *                 "etiquetas": ["opcional", "se suman a las que ya tenga"],
 *                 "mensajes": [{ "direction": "INBOUND", "body": "Hola...", "sentAt": "2026-11-10T16:35:00Z" }] }] }
 *
 * Por cada chat: si ya hay un prospecto con ese teléfono lo actualiza (mensajes y
 * próximo paso); si no, lo crea. Nunca duplica: compara los últimos 10 dígitos
 * del teléfono, y Lion Platform descarta los mensajes repetidos.
 */

const MAX_MENSAJES = 40;

/** Últimos 10 dígitos: "+57 321 449 7185", "573214497185" y "3214497185" son el mismo. */
function phoneKey(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : '';
}

function validDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

function cleanMessages(mensajes) {
  if (!Array.isArray(mensajes)) return [];
  return mensajes
    .filter((m) => m && (m.direction === 'INBOUND' || m.direction === 'OUTBOUND') && String(m.body || '').trim() && !Number.isNaN(Date.parse(m.sentAt)))
    .slice(-MAX_MENSAJES)
    .map((m) => ({ direction: m.direction, body: String(m.body).slice(0, 4000), sentAt: new Date(m.sentAt).toISOString() }));
}

/**
 * @param {Array<object>} chats
 * @param {{ listProspects: Function, createProspect: Function, recordMessages: Function, updateNextAction: Function }} client
 * @returns {Promise<{ creados: string[], actualizados: string[], calientes: string[], errores: string[] }>}
 */
async function importChats(chats, client) {
  const result = { creados: [], actualizados: [], calientes: [], errores: [] };
  const existing = await client.listProspects();
  if (!existing.success) {
    result.errores.push(`No pude leer los prospectos: ${existing.error}`);
    return result;
  }
  const byPhone = new Map();
  for (const p of existing.data || []) {
    const key = phoneKey(p.phone);
    if (key && !byPhone.has(key)) byPhone.set(key, p);
  }

  for (const chat of Array.isArray(chats) ? chats : []) {
    const nombre = String((chat && chat.nombre) || '').trim();
    const key = phoneKey(chat && chat.telefono);
    const etiqueta = nombre || (key ? `…${key.slice(-4)}` : 'sin nombre');
    if (!key) {
      result.errores.push(`${etiqueta}: sin teléfono, no se importa`);
      continue;
    }
    let prospect = byPhone.get(key);
    const wasExisting = Boolean(prospect);
    if (!prospect) {
      const created = await client.createProspect({
        nombre: nombre || chat.telefono,
        telefono: String(chat.telefono),
        fuente: chat.fuente,
        canal: 'WHATSAPP',
        resumen: [chat.etiqueta ? `[${chat.etiqueta}]` : '', chat.resumen || ''].join(' ').trim(),
        siguientePaso: chat.siguientePaso,
        temperatura: chat.temperatura
      });
      if (!created.success) {
        result.errores.push(`${etiqueta}: ${created.error}`);
        continue;
      }
      prospect = created.data;
      byPhone.set(key, prospect);
      result.creados.push(etiqueta);
    } else {
      result.actualizados.push(etiqueta);
    }

    const mensajes = cleanMessages(chat.mensajes);
    if (mensajes.length && prospect && prospect.id !== undefined) {
      const saved = await client.recordMessages(prospect.id, mensajes);
      if (!saved.success) result.errores.push(`${etiqueta} (mensajes): ${saved.error}`);
    }
    if (validDate(chat.fechaSeguimiento) && prospect && prospect.id !== undefined) {
      const next = await client.updateNextAction(prospect.id, chat.siguientePaso || 'Hacer seguimiento por WhatsApp', chat.fechaSeguimiento);
      if (!next.success) result.errores.push(`${etiqueta} (seguimiento): ${next.error}`);
    }
    const id = prospect && prospect.id;
    if (id !== undefined && chat.nota && client.addNote) {
      const note = await client.addNote(id, chat.nota);
      if (!note.success) result.errores.push(`${etiqueta} (nota): ${note.error}`);
    }
    if (id !== undefined && Array.isArray(chat.etiquetas) && chat.etiquetas.length && client.updateTags) {
      const tags = [...new Set([...(prospect.tags || []), ...chat.etiquetas.map((x) => String(x).trim()).filter(Boolean)])];
      const tagged = await client.updateTags(id, tags);
      if (!tagged.success) result.errores.push(`${etiqueta} (etiquetas): ${tagged.error}`);
    }
    // Al crear, la temperatura ya va en el prospecto; en uno existente se actualiza aparte.
    const temp = String(chat.temperatura || '').toUpperCase();
    if (id !== undefined && wasExisting && ['HOT', 'WARM', 'COLD'].includes(temp) && client.updateTemperature) {
      const t2 = await client.updateTemperature(id, temp);
      if (!t2.success) result.errores.push(`${etiqueta} (temperatura): ${t2.error}`);
    }
    if (temp === 'HOT') result.calientes.push(etiqueta);
  }
  return result;
}

/** Resumen corto para Telegram. */
function formatSummary(result) {
  const lines = ['📥 Chats de WhatsApp → Lion Platform'];
  lines.push(`🆕 Nuevos: ${result.creados.length}${result.creados.length ? ` (${result.creados.slice(0, 10).join(', ')})` : ''}`);
  lines.push(`🔄 Actualizados: ${result.actualizados.length}`);
  if (result.calientes.length) lines.push(`🔥 Calientes: ${result.calientes.join(', ')}`);
  if (result.errores.length) lines.push(`⚠️ ${result.errores.length} con problema: ${result.errores.slice(0, 5).join(' · ')}`);
  return lines.join('\n');
}

module.exports = { importChats, formatSummary, phoneKey, cleanMessages };
