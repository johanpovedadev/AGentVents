const lionPlatformClient = require('./lionPlatformClient');

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_DAYS = 10;
const MAX_LISTED = 8;
const TERMINAL_STAGES = new Set(['CLIENTE_ACTIVO', 'PERDIDO']);
// Solo estas etapas cuentan para "estancado": el prospecto ya mostró interés
// real (agendó demo, la hizo, recibió propuesta, está negociando). Silencio
// en POR_CONTACTAR/CONTACTADO/SIN_WHATSAPP es esperado — no se le insiste a
// quien no respondió al outreach frío, por regla explícita del negocio.
const ENGAGED_STAGES = new Set(['DEMO_AGENDADA', 'DEMO_REALIZADA', 'PROPUESTA_ENVIADA', 'EN_NEGOCIACION']);

const SOURCE_LABELS = {
  GOOGLE_MAPS: 'Google Maps',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  REFERIDO: 'Referido',
  MARKETPLACE: 'Marketplace',
  VISITA_PRESENCIAL: 'Visita presencial',
  OTRO: 'Otro',
  SIN_FUENTE: 'Sin fuente registrada'
};

/** Formatea la clave de fuente de Lion Platform a un texto legible. */
function formatSourceLabel(source) {
  return SOURCE_LABELS[source] || source;
}

/** Convierte el conteo por fuente en las líneas del reporte, de mayor a menor. */
function formatBreakdown(porFuente) {
  return Object.entries(porFuente)
    .sort((a, b) => b[1] - a[1])
    .map(([fuente, cantidad]) => `• ${formatSourceLabel(fuente)}: ${cantidad}`)
    .join('\n');
}

/**
 * Genera el resumen semanal de qué canal está trayendo prospectos nuevos.
 * Usa el createdAt real de cada prospecto en Lion Platform — nunca una fecha
 * inventada — así que un prospecto sin createdAt (dato viejo, previo a esta
 * migración) simplemente no cuenta como "nuevo esta semana".
 */
async function generateWeeklyMarketingReport() {
  const startedAt = Date.now();
  const result = await lionPlatformClient.listProspects();
  if (!result.success) return result;

  const cutoff = Date.now() - SEVEN_DAYS_MS;
  const nuevos = result.data.filter((prospecto) => {
    if (!prospecto.createdAt) return false;
    const createdAtMs = new Date(prospecto.createdAt).getTime();
    return !Number.isNaN(createdAtMs) && createdAtMs >= cutoff;
  });

  const porFuente = {};
  for (const prospecto of nuevos) {
    const clave = prospecto.source || 'SIN_FUENTE';
    porFuente[clave] = (porFuente[clave] || 0) + 1;
  }

  const texto = nuevos.length === 0
    ? 'No se registraron prospectos nuevos en los últimos 7 días.'
    : `${nuevos.length} prospectos nuevos en los últimos 7 días:\n${formatBreakdown(porFuente)}`;

  const elapsedSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(2));
  return { success: true, data: texto, elapsedSeconds, totalNuevos: nuevos.length };
}

/** true si la fecha (solo YYYY-MM-DD o ISO) ya pasó respecto a ahora. */
function isPast(dateStr) {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  return !Number.isNaN(t) && t < Date.now();
}

/** Días transcurridos desde una fecha ISO, o null si no es una fecha válida. */
function daysSince(dateStr) {
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}

/** Renderiza hasta MAX_LISTED filas de una lista, con un resumen del resto para no saturar el mensaje. */
function formatList(items, mapper) {
  const shown = items.slice(0, MAX_LISTED).map(mapper).join('\n');
  const resto = items.length > MAX_LISTED ? `\n• …y ${items.length - MAX_LISTED} más` : '';
  return shown + resto;
}

/**
 * Genera las acciones de mejora del embudo para conseguir y mantener clientes —
 * basado en principios de Romuald Fons (velocidad de respuesta, retención por
 * encima de captación, pedir reseña cuando el cliente está sano y contento).
 * Todo se deriva del mismo listado de prospectos, sin fechas inventadas: un
 * prospecto sin nextActionDate/lastInteractionAt simplemente no entra en esas
 * listas.
 */
async function generateFunnelHealthReport() {
  const startedAt = Date.now();
  const result = await lionPlatformClient.listProspects();
  if (!result.success) return result;

  const prospectos = result.data;

  const vencidos = prospectos.filter((p) => p.stage && !TERMINAL_STAGES.has(p.stage) && isPast(p.nextActionDate));
  const estancados = prospectos.filter((p) => p.stage && ENGAGED_STAGES.has(p.stage)
    && p.lastInteractionAt && daysSince(p.lastInteractionAt) >= STALE_DAYS);
  const pagoAtrasado = prospectos.filter((p) => p.stage === 'CLIENTE_ACTIVO' && p.paymentStatus === 'VENCIDO');
  const clientesSanos = prospectos.filter((p) => p.stage === 'CLIENTE_ACTIVO' && p.paymentStatus === 'AL_DIA'
    && !(Array.isArray(p.tags) && p.tags.includes('testimonio')));

  const secciones = [
    vencidos.length === 0
      ? '✅ Sin seguimientos vencidos.'
      : `📌 ${vencidos.length} seguimiento(s) vencido(s) — la velocidad genera confianza, no los dejes esperando:\n${formatList(vencidos, (p) => `• ${p.businessName} — vencía ${p.nextActionDate}`)}`,
    estancados.length === 0
      ? '✅ Sin prospectos estancados.'
      : `🐌 ${estancados.length} prospecto(s) sin contacto hace ${STALE_DAYS}+ días:\n${formatList(estancados, (p) => `• ${p.businessName} — última interacción hace ${daysSince(p.lastInteractionAt)} días`)}`,
    pagoAtrasado.length === 0
      ? '✅ Sin clientes con pago atrasado.'
      : `⚠️ ${pagoAtrasado.length} cliente(s) activo(s) con pago atrasado — riesgo de retención:\n${formatList(pagoAtrasado, (p) => `• ${p.businessName}`)}`,
    clientesSanos.length === 0
      ? 'Sin clientes sanos pendientes de pedir reseña.'
      : `🌟 ${clientesSanos.length} cliente(s) al día sin reseña/testimonio registrado — buen momento para pedirla u ofrecer más (el cliente contento trae más clientes):\n${formatList(clientesSanos, (p) => `• ${p.businessName}`)}`
  ];

  const texto = secciones.join('\n\n');
  const elapsedSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(2));
  return {
    success: true,
    data: texto,
    elapsedSeconds,
    counts: { vencidos: vencidos.length, estancados: estancados.length, pagoAtrasado: pagoAtrasado.length, clientesSanos: clientesSanos.length }
  };
}

module.exports = { generateWeeklyMarketingReport, generateFunnelHealthReport };
