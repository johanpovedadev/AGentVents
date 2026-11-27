/**
 * Plan de seguimiento de la mañana (Johan, 15 nov 2026: "la idea es que en la mañana me
 * ayude con plan de seguimiento de los contactos").
 *
 * Toma los prospectos de Lion Platform con seguimiento para hoy o vencido, los ordena
 * (calientes primero, luego los que más llevan esperando) y para cada uno arma un
 * mensaje corto de WhatsApp listo para mandar, con su enlace wa.me. El mensaje lo
 * escribe Gemini a partir del próximo paso y el resumen; si no hay IA o falla, se
 * usa una plantilla. Johan revisa y manda él: aquí no se envía nada a nadie.
 *
 * Desde el 27 nov 2026 (Johan: "dimos precios y no cerramos"):
 *  - Además de los seguimientos, el plan trae NEGOCIOS NUEVOS para el primer mensaje (10 por defecto), con su
 *    enlace wa.me: Johan los toca en el celular y envía desde su WhatsApp. Así la venta no depende de su PC.
 *  - Técnica "preguntar antes del precio" para todo lo nuevo: el primer mensaje termina con una pregunta sobre
 *    SU problema; si responde, las 3 preguntas (qué quiere resolver, para cuándo, cuánto pensaba invertir, esta de
 *    última y con rangos) y el cierre es una llamada de 15 minutos. Los prospectos que ya venían en conversación
 *    antes de esa fecha siguen con el seguimiento de siempre.
 *  - Los negocios ya sugeridos se guardan en data/ventas_sugeridos.json (en el servidor) para no repetirlos.
 */

const fs = require('fs');
const path = require('path');

const CLOSED_STAGES = new Set(['PERDIDO', 'CLIENTE_ACTIVO', 'CERRADO_GANADO', 'CERRADO_PERDIDO']);
const TEMP_ORDER = { HOT: 0, WARM: 1, COLD: 2 };
const TEMP_ICON = { HOT: '🔥', WARM: '🟡', COLD: '🔵' };
const DEFAULT_LIMIT = 8;
const DEFAULT_NEW_LIMIT = 10;
const TECHNIQUE_SINCE = '2026-11-27';
const RESUGGEST_DAYS = 21;
// Regla de Johan (27 nov 2026, "la idea sería siempre llegar a acuerdos, déjalo en reglas"): cada mensaje busca cerrar
// un ACUERDO concreto del siguiente paso (qué hacemos y cuándo), no dejar la conversación abierta.
const AGREEMENT_RULE = 'REGLA: busca siempre llegar a un ACUERDO concreto del siguiente paso (qué hacemos y cuándo): por ejemplo, ofrece dos opciones de día y hora, o "¿te parece si el jueves te mando el demo con tus productos?". Nunca dejes la conversación en "cualquier cosa me avisas".';
const FOOD = /helad|restaur|comida|pana|caf[eé]|pastel|pizz|hambur|asad|postre|fruter|jugo|almuerz|piquete|reposter|sushi|pollo|pescad|mariscos|arepa|empanad|crepe|perro|burger|wok|parrill/i;

function digits(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) return `57${d}`;
  return d.length >= 11 ? d : '';
}

function firstName(name) {
  const clean = String(name || '').replace(/\(.*?\)/g, '').trim();
  return clean.split(/\s+/)[0] || '';
}

/**
 * Prospectos que toca contactar hoy, en orden.
 * @param {Array<object>} prospects  respuesta de /prospects
 * @param {string} today  YYYY-MM-DD (Bogotá)
 */
function selectDue(prospects, today, limit = DEFAULT_LIMIT) {
  return (Array.isArray(prospects) ? prospects : [])
    .filter((p) => p && p.nextActionDate && p.nextActionDate <= today && !CLOSED_STAGES.has(p.stage) && digits(p.phone))
    .sort((a, b) => (TEMP_ORDER[a.temperature] ?? 3) - (TEMP_ORDER[b.temperature] ?? 3) || a.nextActionDate.localeCompare(b.nextActionDate))
    .slice(0, limit);
}

/** ¿Este prospecto va con la técnica de preguntas? (contactado por primera vez desde el 27 nov 2026) */
function usesQuestions(p) {
  const first = p && (p.firstContactAt || p.lastOutreachSentAt || p.createdAt);
  return Boolean(first) && String(first).slice(0, 10) >= TECHNIQUE_SINCE;
}

/** Celular colombiano válido para WhatsApp (57 + 3xxxxxxxxx). */
function mobile(phone) {
  const d = digits(phone);
  return /^573\d{9}$/.test(d) ? d : '';
}

/** Una sola sede por cadena: "Storia D'Amore Calle 93" y "Storia D'Amore zona T" cuentan como la misma. */
function chainKey(name) {
  return String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !['restaurante', 'the', 'los', 'las', 'del'].includes(w))
    .slice(0, 2).join(' ');
}

/**
 * Negocios para el primer mensaje: por contactar, nunca contactados, con celular, sin sugerir en los últimos
 * RESUGGEST_DAYS días. Primero comida y pedidos (los que más sufren el WhatsApp), luego mejor calificación.
 * @param {Array<object>} prospects
 * @param {{ limit?: number, suggested?: Object<string,string>, today: string }} opts
 */
function selectNew(prospects, opts) {
  const { limit = DEFAULT_NEW_LIMIT, suggested = {}, today } = opts;
  const cutoff = new Date(new Date(`${today}T12:00:00Z`).getTime() - RESUGGEST_DAYS * 86400000).toISOString().slice(0, 10);
  const pool = (Array.isArray(prospects) ? prospects : [])
    .filter((p) => p && p.stage === 'POR_CONTACTAR' && !p.lastOutreachSentAt && !p.nextActionDate && mobile(p.phone))
    .filter((p) => !(suggested[p.id] && suggested[p.id] >= cutoff))
    .map((p) => ({ p, food: FOOD.test(`${p.businessType || ''} ${p.businessName || ''}`) ? 0 : 1, rating: Number(p.googleRating) || 0 }))
    .sort((a, b) => a.food - b.food || b.rating - a.rating || Number(a.p.id) - Number(b.p.id));
  const seen = new Set();
  const out = [];
  for (const { p } of pool) {
    const key = chainKey(p.businessName);
    if (key && seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

const OPENERS = ['Hola', 'Buenos días', '¿Qué tal?', 'Hola, ¿cómo van?', 'Buen día', 'Hola, buenas'];
const QUESTIONS = [
  '¿Hoy quién les contesta el WhatsApp cuando están llenos?',
  '¿Se les quedan mensajes sin responder en la hora pico?',
  '¿Cuántos mensajes de WhatsApp les llegan en un día bueno?',
  '¿Les pasa que preguntan precios y después no vuelven a escribir?',
  '¿Quién les responde los pedidos cuando el domiciliario está en la calle?',
  '¿Qué es lo que más les preguntan por WhatsApp?'
];

/** Primer mensaje de respaldo (sin IA): distinto según el negocio, sin precio y con una pregunta sobre SU problema. */
function firstTemplate(p, i = 0) {
  const n = Number(p.id) || i;
  const opener = OPENERS[n % OPENERS.length];
  const question = QUESTIONS[(n + i) % QUESTIONS.length];
  const name = String(p.businessName || '').trim();
  return `${opener}${name ? `, ${name}` : ''}. Soy Johan y ayudo a negocios como el suyo a que nadie se quede sin respuesta en WhatsApp: un asistente con IA que contesta menú, precios, horario y domicilios a cualquier hora. Estoy abriendo 5 cupos de fundador con la instalación gratis. ${question}`;
}

/**
 * Primeros mensajes con la técnica de preguntas: IA si hay (simulada en pruebas), plantilla si no.
 * @returns {Promise<Array<{ p: object, text: string, fromAi: boolean }>>}
 */
async function writeFirstMessages(items, writer) {
  const out = [];
  for (const [i, p] of items.entries()) {
    let text = '';
    if (writer) {
      try {
        const prompt = [
          'Escribe el PRIMER mensaje de WhatsApp (3 a 4 líneas, español de Colombia, cercano, que suene a persona y no a plantilla) para un negocio que no conoce a Johan.',
          'Idea: soy Johan, ayudo a negocios como el suyo a que nadie se quede sin respuesta en WhatsApp con un asistente con IA que contesta menú, precios, horario y domicilios a cualquier hora; estoy abriendo 5 cupos de fundador con la instalación gratis.',
          'REGLAS: sin precios, sin enlaces, sin comillas, sin "les ha pasado que". Termina con UNA pregunta sobre SU problema con el WhatsApp (por ejemplo quién les contesta cuando están llenos), nunca con "¿les muestro?".',
          `Negocio: ${p.businessName}`,
          `Tipo: ${p.businessType || 'sin dato'}`,
          `Zona: ${p.zone || p.city || 'Bogotá'}`,
          `Calificación en Google: ${p.googleRating || 'sin dato'}`
        ].join('\n');
        text = String(await writer(prompt) || '').trim().replace(/^["“]|["”]$/g, '');
        if (/https?:\/\/|\$\s?\d/.test(text)) text = ''; // nunca enlaces ni precios en el primer mensaje
      } catch (_) {
        text = '';
      }
    }
    out.push({ p, text: text || firstTemplate(p, i), fromAi: Boolean(text) });
  }
  return out;
}

/** Mensaje de respaldo (sin IA): corto, con el nombre y una pregunta. */
function templateMessage(p) {
  const name = firstName(p.businessName);
  const hola = name ? `Hola ${name}` : 'Hola';
  return `${hola}, te escribe Johan de Service Store VIP 🦁 ¿Cómo vas con lo que hablamos? Si quieres lo retomamos hoy, ¿te queda bien?`;
}

function waLink(p, text) {
  return `https://wa.me/${digits(p.phone)}?text=${encodeURIComponent(text)}`;
}

/**
 * @param {Array<object>} items  prospectos seleccionados
 * @param {(prompt: string) => Promise<string>} [writer]  devuelve el texto de la IA (o lanza)
 * @returns {Promise<Array<{ p: object, text: string, fromAi: boolean }>>}
 */
async function writeMessages(items, writer) {
  const out = [];
  for (const p of items) {
    let text = '';
    if (writer) {
      try {
        const technique = usesQuestions(p)
          ? 'TÉCNICA PREGUNTAR ANTES DEL PRECIO: no des precio. Según el próximo paso, haz la siguiente de estas preguntas que falte, una sola: qué quiere resolver con su WhatsApp, para cuándo lo necesita, o (de última y con rangos) cuánto pensaba invertir al mes, "¿algo como 40 mil, 65 mil o más?". Si ya respondió las 3, propón una llamada de 15 minutos con dos opciones de día y hora.'
          : 'Seguimiento normal: retoma con amabilidad; puedes mencionar los 5 cupos de fundador con la instalación gratis y ofrecer mostrarle el demo.';
        const prompt = [
          'Escribe UN mensaje corto de WhatsApp (máximo 3 líneas, español de Colombia, cercano y profesional) para retomar el contacto con este prospecto.',
          'Lo firma Johan de Service Store VIP (bots de WhatsApp con IA y tecnología). Termina con una pregunta concreta. Sin precios, sin inventar datos, sin comillas.',
          AGREEMENT_RULE,
          technique,
          `Nombre: ${p.businessName}`,
          `Próximo paso acordado: ${p.nextStep || 'retomar la conversación'}`,
          `Contexto: ${p.priorityReason || 'sin contexto'}`,
          `Temperatura: ${p.temperature || 'sin dato'}`
        ].join('\n');
        text = String(await writer(prompt) || '').trim().replace(/^["“]|["”]$/g, '');
      } catch (_) {
        text = '';
      }
    }
    out.push({ p, text: text || templateMessage(p), fromAi: Boolean(text) });
  }
  return out;
}

function formatPlan(planned, today) {
  if (!planned.length) return `🗓️ Plan de seguimiento ${today}\n✅ Hoy no hay contactos con seguimiento pendiente.`;
  const lines = [`🗓️ Plan de seguimiento ${today} — ${planned.length} contacto(s). Toca el enlace, revisa el mensaje y envíalo:`];
  planned.forEach(({ p, text }, i) => {
    const icon = TEMP_ICON[p.temperature] || '⚪';
    const late = p.nextActionDate < today ? ` (vencía ${p.nextActionDate})` : '';
    lines.push('');
    lines.push(`${i + 1}. ${icon} ${p.businessName}${late}`);
    if (p.nextStep) lines.push(`   👉 ${p.nextStep}`);
    lines.push(`   💬 ${text}`);
    lines.push(`   📲 ${waLink(p, text)}`);
  });
  return lines.join('\n');
}

function formatNew(planned, today) {
  if (!planned.length) return `🆕 Negocios nuevos ${today}\n⚠️ Ya no quedan negocios por contactar con celular: toca buscar más prospectos.`;
  const lines = [`🆕 ${planned.length} negocios nuevos para hoy (envíalos de 9:30 a 11:30, uno cada 4 a 9 minutos). Toca el enlace, revisa y envía desde tu WhatsApp:`];
  planned.forEach(({ p, text }, i) => {
    const extra = [p.businessType, p.zone || p.city, p.googleRating ? `⭐ ${p.googleRating}` : ''].filter(Boolean).join(' · ');
    lines.push('');
    lines.push(`${i + 1}. ${p.businessName}${extra ? ` — ${extra}` : ''}`);
    lines.push(`   💬 ${text}`);
    lines.push(`   📲 ${waLink(p, text)}`);
  });
  lines.push('');
  lines.push('Si responden: no des el precio todavía. 1) ¿Qué quieres resolver? 2) ¿Para cuándo? 3) ¿Cuánto pensabas invertir al mes? (con rangos). Luego, llamada de 15 min.');
  lines.push('🤝 Regla: cada conversación termina en un ACUERDO concreto (qué sigue y cuándo, con día y hora). Nada de "cualquier cosa me avisas".');
  return lines.join('\n');
}

/** Registro de negocios ya sugeridos (en el servidor, fuera del repo). */
function fileStore(file = path.join(__dirname, '..', 'data', 'ventas_sugeridos.json')) {
  return {
    load() {
      try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return {}; }
    },
    save(data) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data, null, 1));
    }
  };
}

/**
 * @param {{ listProspects: Function }} client
 * @param {{ today: string, writer?: Function, limit?: number, newLimit?: number, store?: { load: Function, save: Function } }} opts
 */
async function generateFollowUpPlan(client, opts) {
  const res = await client.listProspects();
  if (!res.success) return { success: false, error: res.error };
  const due = selectDue(res.data, opts.today, opts.limit);
  const planned = await writeMessages(due, opts.writer);
  const parts = [formatPlan(planned, opts.today)];
  let fresh = [];
  const newLimit = opts.newLimit === undefined ? DEFAULT_NEW_LIMIT : opts.newLimit;
  if (newLimit > 0) {
    const store = opts.store || fileStore();
    const suggested = store.load() || {};
    const picked = selectNew(res.data, { limit: newLimit, suggested, today: opts.today });
    fresh = await writeFirstMessages(picked, opts.writer);
    for (const { p } of fresh) suggested[p.id] = opts.today;
    if (fresh.length) store.save(suggested);
    parts.push(formatNew(fresh, opts.today));
  }
  return { success: true, data: parts.join('\n\n'), count: planned.length, newCount: fresh.length };
}

/** Escritor con Gemini (el mismo modelo del informe de ventas). Sin clave: sin IA. */
function geminiWriter() {
  if (!process.env.GEMINI_API_KEY) return undefined;
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: 'gemini-flash-latest' });
  return async (prompt) => (await model.generateContent(prompt)).response.text();
}

/** Hoy en Bogotá, YYYY-MM-DD. */
function todayBogota(now = new Date()) {
  return new Date(now.getTime() - 5 * 3600000).toISOString().slice(0, 10);
}

module.exports = {
  generateFollowUpPlan, selectDue, writeMessages, formatPlan, templateMessage, waLink, digits, geminiWriter, todayBogota,
  selectNew, writeFirstMessages, formatNew, firstTemplate, usesQuestions, chainKey, mobile, fileStore, TECHNIQUE_SINCE, AGREEMENT_RULE
};
