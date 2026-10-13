require('dotenv').config();

const { addAccount } = require('../services/social/accountService');
const db = require('../services/social/db');

/**
 * Registra una cuenta para seguir.
 *   node scripts/addAccount.js --tenant 1 --red instagram --usuario rutadeviajelion
 *   node scripts/addAccount.js --tenant 1 --red youtube --usuario @canal --competencia
 * Si no se pasa --tenant, usa SOCIAL_TENANT_ID.
 */
function parseArgs(argv) {
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    tenantId: get('--tenant') || process.env.SOCIAL_TENANT_ID,
    platform: get('--red'),
    handle: get('--usuario'),
    isCompetitor: argv.includes('--competencia')
  };
}

async function main() {
  const result = await addAccount(parseArgs(process.argv.slice(2)));
  if (!result.success) {
    console.error(`No se registró: ${result.error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Cuenta registrada (id ${result.data.id}): ${result.data.followers ?? 's/d'} seguidores, ${result.data.publicaciones} publicaciones recientes.`);
}

main()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => db.close());
