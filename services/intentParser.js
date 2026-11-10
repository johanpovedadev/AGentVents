require('dotenv').config();

const { GoogleGenerativeAI } = require('@google/generative-ai');

const VALID_TYPES = ['crear_prospecto', 'publicar_post', 'generar_informe', 'informe_marketing', 'acciones_embudo', 'informe_redes'];

/** Convierte lenguaje natural en la intención estructurada que consume el agente de redes y ventas. */
async function parseIntent(message) {
  if (!message || !message.trim()) return { success: false, error: 'Debes indicar una instrucción para el agente.' };
  if (!process.env.GEMINI_API_KEY) return { success: false, error: 'Falta la variable de entorno GEMINI_API_KEY.' };

  const schema = `{"tipo":"${VALID_TYPES.join('|')}","datos":{}}`;
  const prompt = `Convierte esta instrucción al siguiente JSON exacto: ${schema}. Responde SOLO JSON válido, sin Markdown ni explicación.
Reglas por tipo:
- crear_prospecto: datos {nombre, telefono, fuente} — fuente es una de GOOGLE_MAPS, INSTAGRAM, FACEBOOK, REFERIDO, MARKETPLACE, VISITA_PRESENCIAL, OTRO.
- publicar_post: datos {canal ('facebook' o 'instagram'), texto} y, si aplica, enlace (Facebook), imagenUrl (Instagram con una imagen) o imagenes (arreglo de 2 a 10 URLs para un carrusel de Instagram).
- generar_informe: sin datos; es el diagnóstico de ventas del embudo en Lion Platform.
- informe_marketing: sin datos; resumen semanal de prospectos nuevos por canal.
- acciones_embudo: sin datos; acciones de mejora del embudo de esta semana (seguimientos vencidos, estancados, pagos atrasados, pedir reseña).
- informe_redes: datos opcionales {dias} (por defecto 7); ganadores de redes propias y de la competencia, crecimiento de seguidores.
Instrucción: ${message}`;

  try {
    const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // Alias "latest" en vez de una versión fija — evita que el intérprete se
    // rompa cada vez que Google retira un modelo (pasó con gemini-1.5-flash).
    const model = gemini.getGenerativeModel({ model: 'gemini-flash-latest', generationConfig: { responseMimeType: 'application/json' } });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().replace(/^```json\s*|\s*```$/g, '');
    const intencion = JSON.parse(text);
    if (!VALID_TYPES.includes(intencion.tipo) || !intencion.datos || typeof intencion.datos !== 'object') {
      return { success: false, error: 'Gemini devolvió una intención con una estructura no válida.' };
    }
    return { success: true, data: intencion };
  } catch (error) {
    return { success: false, error: `No fue posible interpretar la instrucción: ${error.message}` };
  }
}

module.exports = { parseIntent, VALID_TYPES };
