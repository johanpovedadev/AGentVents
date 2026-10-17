require('dotenv').config();

const { GoogleGenerativeAI } = require('@google/generative-ai');
const lionPlatformClient = require('./lionPlatformClient');

/** Cuenta prospectos por etapa del embudo; los que no tienen etapa van a SIN_ETAPA. */
function countByStage(prospectos) {
  const porEtapa = {};
  for (const p of prospectos) {
    const etapa = p.stage || 'SIN_ETAPA';
    porEtapa[etapa] = (porEtapa[etapa] || 0) + 1;
  }
  return porEtapa;
}

/**
 * Diagnóstico de ventas con los prospectos reales de Lion Platform (antes leía
 * deals de HubSpot). A Gemini solo se le pasan campos de embudo — etapa, fuente,
 * estado de pago, fechas — nunca teléfonos, para no mandar datos personales.
 */
async function generateSalesReport() {
  const startedAt = Date.now();
  const result = await lionPlatformClient.listProspects();
  if (!result.success) return result;
  if (!process.env.GEMINI_API_KEY) {
    return { success: false, error: 'Falta la variable de entorno GEMINI_API_KEY.' };
  }

  const prospectos = Array.isArray(result.data) ? result.data : [];
  const resumen = {
    total: prospectos.length,
    porEtapa: countByStage(prospectos),
    prospectos: prospectos.map((p) => ({
      negocio: p.businessName,
      etapa: p.stage,
      fuente: p.source,
      pago: p.paymentStatus,
      ultimaInteraccion: p.lastInteractionAt,
      proximaAccion: p.nextActionDate
    }))
  };

  try {
    const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = gemini.getGenerativeModel({ model: 'gemini-flash-latest' });
    const prompt = `Actúa como analista de ventas de un negocio pequeño en Colombia. Con este embudo de Lion Platform, escribe en español un diagnóstico breve: 3 hallazgos y 3 acciones concretas para esta semana. No inventes cifras que no estén en los datos.\n${JSON.stringify(resumen)}`;
    const response = await model.generateContent(prompt);
    const elapsedSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(2));
    return { success: true, data: response.response.text(), elapsedSeconds, porEtapa: resumen.porEtapa };
  } catch (error) {
    return { success: false, error: `No fue posible generar el informe con Gemini: ${error.message}` };
  }
}

module.exports = { generateSalesReport, countByStage };
