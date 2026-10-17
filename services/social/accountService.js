const licenseService = require('../licenseService');
const { cleanHandle } = require('./connectors/instagram');

const PLATFORMS = ['instagram', 'youtube'];
const MAX_COMPETITORS = 10;

function defaultDeps() {
  return {
    db: require('./db'),
    connectors: {
      instagram: require('./connectors/instagram'),
      youtube: require('./connectors/youtube')
    },
    requireProduct: licenseService.requireProduct
  };
}

/**
 * Registra una cuenta (propia o de competencia) para un tenant. Antes de
 * guardarla verifica, en este orden:
 *   1. que el tenant tenga licencia SOCIAL activa,
 *   2. que la red sea soportada y no se pase el tope de competidores,
 *   3. que la cuenta exista y se pueda consultar (SOC-RF-03) — se hace una
 *      consulta real al conector y, si falla, se devuelve el motivo.
 */
async function addAccount({ tenantId, platform, handle, isCompetitor }, deps = {}) {
  const { db, connectors, requireProduct } = { ...defaultDeps(), ...deps };
  const red = String(platform || '').toLowerCase();
  const usuario = cleanHandle(handle);
  if (!tenantId || !usuario) return { success: false, error: 'Se requieren tenant y usuario de la cuenta.' };
  if (!PLATFORMS.includes(red)) return { success: false, error: `Red no soportada todavía: ${platform}. Disponibles: ${PLATFORMS.join(', ')}.` };

  const license = await requireProduct(tenantId, licenseService.PRODUCTS.SOCIAL);
  if (!license.success) return license;

  if (isCompetitor) {
    const [{ total }] = await db.query(
      'SELECT count(*)::int AS total FROM social.account WHERE tenant_id = $1 AND platform = $2 AND is_competitor AND active',
      [tenantId, red]
    );
    if (total >= MAX_COMPETITORS) return { success: false, error: `Máximo ${MAX_COMPETITORS} competidores por red.` };
  }

  const candidate = { tenant_id: tenantId, platform: red, handle: usuario, is_competitor: Boolean(isCompetitor), external_id: null };
  let data;
  try {
    data = await connectors[red].fetchAccount(candidate);
  } catch (error) {
    return { success: false, error: `No se pudo validar @${usuario} en ${red}: ${error.message}` };
  }

  const [row] = await db.query(
    `INSERT INTO social.account (tenant_id, platform, handle, external_id, is_competitor)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id, platform, handle) DO UPDATE SET active = TRUE, is_competitor = EXCLUDED.is_competitor,
       external_id = EXCLUDED.external_id
     RETURNING id`,
    [tenantId, red, usuario, data.account.externalId, Boolean(isCompetitor)]
  );
  return { success: true, data: { id: row.id, followers: data.account.followers, publicaciones: data.media.length } };
}

module.exports = { addAccount, PLATFORMS, MAX_COMPETITORS };
