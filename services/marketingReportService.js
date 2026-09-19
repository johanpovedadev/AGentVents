const lionPlatformClient = require('./lionPlatformClient');

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

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

module.exports = { generateWeeklyMarketingReport };
