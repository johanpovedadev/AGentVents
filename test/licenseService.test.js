const test = require('node:test');
const assert = require('node:assert/strict');
const lionPlatform = require('../services/lionPlatformClient');
const license = require('../services/licenseService');

const TENANTS = [
  { id: 1, name: 'Johan (propio)', status: 'ACTIVE', products: ['CRM', 'BOT', 'SOCIAL'] },
  { id: 2, name: 'Heladería', status: 'ACTIVE', products: ['BOT'] },
  { id: 3, name: 'Clínica moroso', status: 'SUSPENDED', products: ['SOCIAL'] },
  { id: 4, name: 'Sin productos', status: 'ACTIVE' }
];

test.beforeEach(() => {
  lionPlatform.listTenants = async () => ({ success: true, data: TENANTS });
});

test('loadLicenses arma el mapa de productos por tenant', async () => {
  const result = await license.loadLicenses();
  assert.equal(result.success, true);
  assert.equal(result.data.get('1').products.has('SOCIAL'), true);
  assert.equal(result.data.get('4').products.size, 0);
});

test('hasProduct exige tenant existente, ACTIVO y con el producto', async () => {
  const { data } = await license.loadLicenses();
  assert.equal(license.hasProduct(data, 1, 'SOCIAL'), true);
  assert.equal(license.hasProduct(data, '1', 'CRM'), true);
  assert.equal(license.hasProduct(data, 2, 'SOCIAL'), false, 'solo tiene BOT');
  assert.equal(license.hasProduct(data, 3, 'SOCIAL'), false, 'suspendido por no pago');
  assert.equal(license.hasProduct(data, 99, 'SOCIAL'), false, 'tenant desconocido');
});

test('tenantsWithProduct lista solo los activos licenciados', async () => {
  const { data } = await license.loadLicenses();
  assert.deepEqual(license.tenantsWithProduct(data, license.PRODUCTS.SOCIAL), ['1']);
  assert.deepEqual(license.tenantsWithProduct(data, license.PRODUCTS.BOT), ['1', '2']);
});

test('requireProduct devuelve un error legible si no hay licencia', async () => {
  assert.equal((await license.requireProduct(1, 'SOCIAL')).success, true);
  const denied = await license.requireProduct(2, 'SOCIAL');
  assert.equal(denied.success, false);
  assert.match(denied.error, /tenant 2 no tiene licencia activa de SOCIAL/);
});

test('falla cerrado si Lion Platform no responde', async () => {
  lionPlatform.listTenants = async () => ({ success: false, error: 'Koyeb dormido' });
  const result = await license.requireProduct(1, 'SOCIAL');
  assert.equal(result.success, false);
  assert.match(result.error, /No se pudieron verificar licencias: Koyeb dormido/);
});

test('una respuesta sin lista se trata como cero tenants', async () => {
  lionPlatform.listTenants = async () => ({ success: true, data: null });
  const { data } = await license.loadLicenses();
  assert.equal(data.size, 0);
});
