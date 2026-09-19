require('dotenv').config();

const LION_BASE_URL = process.env.LION_PLATFORM_BASE_URL || 'http://localhost:8081/api/v1';

let cachedToken = null;

/** Inicia sesión en Lion Platform y cachea el JWT en memoria para el resto del proceso. */
async function login() {
  const email = process.env.LION_EMAIL || 'super@lionplatform.com';
  const password = process.env.LION_PASSWORD || 'password123';
  const response = await fetch(`${LION_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.token) {
    throw new Error(`No fue posible iniciar sesión en Lion Platform (${response.status}).`);
  }
  cachedToken = body.token;
  return cachedToken;
}

/** Ejecuta una petición autenticada contra la API de Lion Platform, renovando el JWT si hace falta. */
async function lionRequest(path, options = {}) {
  try {
    if (!cachedToken) await login();
    const response = await fetch(`${LION_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${cachedToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        success: false,
        error: `Lion Platform respondió ${response.status}: ${body.message || 'No fue posible completar la operación.'}`
      };
    }
    return { success: true, data: body };
  } catch (error) {
    return { success: false, error: `No fue posible conectar con Lion Platform: ${error.message}` };
  }
}

/** Crea un prospecto a partir de los mismos datos usados para un contacto de HubSpot. */
async function createProspect(datos) {
  const businessName = [datos && datos.firstname, datos && datos.lastname].filter(Boolean).join(' ').trim()
    || (datos && datos.phone) || '';
  if (!businessName) {
    return { success: false, error: 'Se requiere firstname, lastname o phone para crear el prospecto.' };
  }
  return lionRequest('/prospects', {
    method: 'POST',
    body: JSON.stringify({
      businessName,
      phone: datos && datos.phone,
      source: 'OTRO'
    })
  });
}

/** Lista todos los prospectos del tenant autenticado. */
async function listProspects() {
  return lionRequest('/prospects');
}

module.exports = { createProspect, listProspects };
