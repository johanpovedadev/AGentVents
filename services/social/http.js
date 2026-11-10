/**
 * GET que devuelve JSON o lanza un error con el mensaje que manda la API (Meta y
 * Google responden { error: { message } }). Los conectores dejan que el error
 * suba: el recolector lo captura por cuenta, sin frenar a las demás.
 */
async function getJson(url) {
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (body && body.error && (body.error.message || body.error)) || `HTTP ${response.status}`;
    throw new Error(String(message));
  }
  return body;
}

/** Convierte un string numérico de la API ("1234") en número; null si no viene. */
function toNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

module.exports = { getJson, toNumber };
