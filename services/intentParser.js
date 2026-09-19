require('dotenv').config();

const { GoogleGenerativeAI } = require('@google/generative-ai');

/** Convierte lenguaje natural en la intención estructurada que consume el agente CRM. */
async function parseIntent(message) {
  if (!message || !message.trim()) return { success: false, error: 'Debes indicar una instrucción para el agente.' };
  if (!process.env.GEMINI_API_KEY) return { success: false, error: 'Falta la variable de entorno GEMINI_API_KEY.' };

  const schema = '{"tipo":"crear_contacto|crear_deal|actualizar_deal|actualizar_contacto|generar_informe|publicar_post|informe_marketing","datos":{}}';
  const prompt = `Convierte esta instrucción CRM al siguiente JSON exacto: ${schema}. Responde SOLO JSON válido, sin Markdown ni explicación. Para crear_deal usa contactId si está disponible; para actualizar_deal usa dealId y dealstage; para actualizar_contacto usa contactId y propiedades; para publicar_post usa canal ('facebook' o 'instagram'), texto y, si aplica, enlace (Facebook) o imagenUrl (Instagram con una sola imagen) o imagenes (arreglo de 2 a 10 URLs, para un carrusel de Instagram); informe_marketing no lleva datos, es el resumen semanal de prospectos nuevos por canal en Lion Platform. Instrucción: ${message}`;

  try {
    const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = gemini.getGenerativeModel({ model: 'gemini-1.5-flash', generationConfig: { responseMimeType: 'application/json' } });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().replace(/^```json\s*|\s*```$/g, '');
    const intencion = JSON.parse(text);
    const validTypes = ['crear_contacto', 'crear_deal', 'actualizar_deal', 'actualizar_contacto', 'generar_informe', 'publicar_post', 'informe_marketing'];
    if (!validTypes.includes(intencion.tipo) || !intencion.datos || typeof intencion.datos !== 'object') {
      return { success: false, error: 'Gemini devolvió una intención con una estructura no válida.' };
    }
    return { success: true, data: intencion };
  } catch (error) {
    return { success: false, error: `No fue posible interpretar la instrucción: ${error.message}` };
  }
}

module.exports = { parseIntent };
