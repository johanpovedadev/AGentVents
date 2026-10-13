const lionPlatformClient = require('./lionPlatformClient');

/**
 * Productos que se licencian por tenant en Lion Platform (enum TenantProduct
 * del backend). Cada servicio del agente exige el suyo:
 *   - SOCIAL: recolección, analítica e informe de redes.
 *   - CRM:    prospectos, embudo e informes de ventas.
 *   - BOT:    bot de WhatsApp (lo valida lion-platform-api, no este repo).
 */
const PRODUCTS = Object.freeze({ SOCIAL: 'SOCIAL', CRM: 'CRM', BOT: 'BOT' });

/**
 * Lion Platform es la única fuente de verdad de las licencias: aquí no se
 * guarda ninguna copia. Si no se puede consultar, se falla cerrado — nadie
 * recibe el servicio — en vez de asumir que todos tienen licencia.
 */
async function loadLicenses() {
  const result = await lionPlatformClient.listTenants();
  if (!result.success) {
    return { success: false, error: `No se pudieron verificar licencias: ${result.error}` };
  }
  const tenants = Array.isArray(result.data) ? result.data : [];
  const byTenant = new Map();
  for (const tenant of tenants) {
    byTenant.set(String(tenant.id), {
      id: String(tenant.id),
      name: tenant.name,
      active: tenant.status === 'ACTIVE',
      products: new Set(Array.isArray(tenant.products) ? tenant.products : [])
    });
  }
  return { success: true, data: byTenant };
}

/** true solo si el tenant existe, está ACTIVO y tiene el producto. Un tenant SUSPENDED no recibe servicio. */
function hasProduct(licenses, tenantId, product) {
  const tenant = licenses.get(String(tenantId));
  return Boolean(tenant && tenant.active && tenant.products.has(product));
}

/** Ids de los tenants activos con el producto, para filtrar trabajos por lote (p. ej. el recolector diario). */
function tenantsWithProduct(licenses, product) {
  return [...licenses.values()].filter((t) => t.active && t.products.has(product)).map((t) => t.id);
}

/** Verifica un solo tenant contra Lion Platform y devuelve un error legible si no está licenciado. */
async function requireProduct(tenantId, product) {
  const loaded = await loadLicenses();
  if (!loaded.success) return loaded;
  if (!hasProduct(loaded.data, tenantId, product)) {
    return { success: false, error: `El tenant ${tenantId} no tiene licencia activa de ${product}.` };
  }
  return { success: true };
}

module.exports = { PRODUCTS, loadLicenses, hasProduct, tenantsWithProduct, requireProduct };
