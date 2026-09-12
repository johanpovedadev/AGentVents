require('dotenv').config();

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getDeals } = require('./hubspotClient');

/** Genera con Gemini un diagnóstico conciso a partir de los deals del CRM. */
async function generateSalesReport() {
  const dealsResult = await getDeals();
  if (!dealsResult.success) return dealsResult;
  if (!process.env.GEMINI_API_KEY) {
    return { success: false, error: 'Falta la variable de entorno GEMINI_API_KEY.' };
  }

  try {
    const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const prompt = `Actúa como analista de ventas. Genera un diagnóstico breve en español, con hallazgos y acciones recomendadas, usando estos deals de HubSpot:\n${JSON.stringify(dealsResult.data.results || [])}`;
    const result = await model.generateContent(prompt);
    return { success: true, data: result.response.text() };
  } catch (error) {
    return { success: false, error: `No fue posible generar el informe con Gemini: ${error.message}` };
  }
}

module.exports = { generateSalesReport };
