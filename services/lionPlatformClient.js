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

// Fuentes que acepta Lion Platform para un prospecto (enum del backend).
const VALID_SOURCES = new Set(['GOOGLE_MAPS', 'INSTAGRAM', 'FACEBOOK', 'REFERIDO', 'MARKETPLACE', 'VISITA_PRESENCIAL', 'OTRO']);

/**
 * Crea un prospecto en Lion Platform. `nombre` es el negocio o la persona;
 * `fuente` es el canal de donde llegó (INSTAGRAM, FACEBOOK…). Una fuente que
 * el backend no conoce se guarda como OTRO en vez de fallar.
 */
async function createProspect(datos) {
  const nombre = (datos && datos.nombre ? String(datos.nombre) : '').trim();
  const telefono = datos && datos.telefono ? String(datos.telefono) : undefined;
  const businessName = nombre || telefono || '';
  if (!businessName) {
    return { success: false, error: 'Se requiere nombre o telefono para crear el prospecto.' };
  }
  const fuente = datos && datos.fuente ? String(datos.fuente).toUpperCase() : 'OTRO';
  return lionRequest('/prospects', {
    method: 'POST',
    body: JSON.stringify({
      businessName,
      phone: telefono,
      source: VALID_SOURCES.has(fuente) ? fuente : 'OTRO'
    })
  });
}

/** Lista todos los prospectos del tenant autenticado. */
async function listProspects() {
  return lionRequest('/prospects');
}

/**
 * Lista todos los tenants con sus productos licenciados. Solo SUPER_ADMIN puede
 * llamar /admin/tenants — el agente inicia sesión con esa cuenta para poder
 * verificar licencias de todos los clientes.
 */
async function listTenants() {
  return lionRequest('/admin/tenants');
}

module.exports = { createProspect, listProspects, listTenants };
