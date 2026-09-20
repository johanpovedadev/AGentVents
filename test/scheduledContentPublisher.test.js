const test = require('node:test');
const assert = require('node:assert/strict');
const lionPlatform = require('../services/lionPlatformClient');
const metaPublisher = require('../services/metaPublisher');
const { publishDueScheduledContent } = require('../services/scheduledContentPublisher');

function daysOffset(n) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

test.beforeEach(() => {
  metaPublisher.publish = async () => { throw new Error('no debería llamarse en este test'); };
  lionPlatform.updateContentPost = async () => { throw new Error('no debería llamarse en este test'); };
});

test('publica en Facebook un post SCHEDULED vencido con texto y lo marca PUBLISHED', async () => {
  lionPlatform.listContentPosts = async () => ({
    success: true,
    data: [{ id: '1', platform: 'FACEBOOK', topic: 'Puente mentalidad', body: 'Texto real del post', status: 'SCHEDULED', scheduledFor: daysOffset(-1) }]
  });
  let updateCall;
  lionPlatform.updateContentPost = async (id, datos) => { updateCall = { id, datos }; return { success: true }; };
  metaPublisher.publish = async (canal, datos) => {
    assert.equal(canal, 'facebook');
    assert.equal(datos.texto, 'Texto real del post');
    return { success: true, data: { id: '999_888' } };
  };

  const result = await publishDueScheduledContent();
  assert.equal(result.success, true);
  assert.equal(result.counts.publicados, 1);
  assert.match(result.data, /Puente mentalidad/);
  assert.match(result.data, /facebook\.com\/999_888/);
  assert.deepEqual(updateCall, { id: '1', datos: { status: 'PUBLISHED', externalUrl: 'https://www.facebook.com/999_888' } });
});

test('no publica un post que todavia no vence', async () => {
  lionPlatform.listContentPosts = async () => ({
    success: true,
    data: [{ id: '1', platform: 'FACEBOOK', topic: 'Futuro', body: 'Texto', status: 'SCHEDULED', scheduledFor: daysOffset(3) }]
  });

  const result = await publishDueScheduledContent();
  assert.equal(result.counts.publicados, 0);
  assert.match(result.data, /Sin publicaciones nuevas hoy/);
});

test('no publica un post SCHEDULED vencido sin texto escrito', async () => {
  lionPlatform.listContentPosts = async () => ({
    success: true,
    data: [{ id: '1', platform: 'FACEBOOK', topic: 'Idea sin redactar', body: null, status: 'SCHEDULED', scheduledFor: daysOffset(-1) }]
  });

  const result = await publishDueScheduledContent();
  assert.equal(result.counts.publicados, 0);
  assert.equal(result.counts.sinContenido, 1);
  assert.match(result.data, /sin texto escrito/);
  assert.match(result.data, /Idea sin redactar/);
});

test('reporta como no soportada una plataforma sin publicación automática (ej. Instagram, sin campo de imagen todavía)', async () => {
  lionPlatform.listContentPosts = async () => ({
    success: true,
    data: [{ id: '1', platform: 'INSTAGRAM', topic: 'Reel demo', body: 'Texto listo', status: 'SCHEDULED', scheduledFor: daysOffset(-1) }]
  });

  const result = await publishDueScheduledContent();
  assert.equal(result.counts.publicados, 0);
  assert.equal(result.counts.noSoportados, 1);
  assert.match(result.data, /Reel demo/);
});

test('ignora posts que no estan en SCHEDULED (ya publicados, cancelados, ideas)', async () => {
  lionPlatform.listContentPosts = async () => ({
    success: true,
    data: [
      { id: '1', platform: 'FACEBOOK', topic: 'Ya publicado', body: 'Texto', status: 'PUBLISHED', scheduledFor: daysOffset(-5) },
      { id: '2', platform: 'FACEBOOK', topic: 'Cancelado', body: 'Texto', status: 'CANCELLED', scheduledFor: daysOffset(-1) },
      { id: '3', platform: 'FACEBOOK', topic: 'Solo idea', body: 'Texto', status: 'IDEA', scheduledFor: null }
    ]
  });

  const result = await publishDueScheduledContent();
  assert.equal(result.counts.publicados, 0);
  assert.equal(result.counts.sinContenido, 0);
  assert.equal(result.counts.noSoportados, 0);
});

test('reporta un fallo de publicación sin detener el resto ni marcar el post como publicado', async () => {
  lionPlatform.listContentPosts = async () => ({
    success: true,
    data: [
      { id: '1', platform: 'FACEBOOK', topic: 'Falla al publicar', body: 'Texto', status: 'SCHEDULED', scheduledFor: daysOffset(-1) },
      { id: '2', platform: 'FACEBOOK', topic: 'Este si funciona', body: 'Otro texto', status: 'SCHEDULED', scheduledFor: daysOffset(-1) }
    ]
  });
  metaPublisher.publish = async (canal, datos) => {
    if (datos.texto === 'Texto') return { success: false, error: 'Facebook respondió 400' };
    return { success: true, data: { id: 'ok_123' } };
  };
  lionPlatform.updateContentPost = async () => ({ success: true });

  const result = await publishDueScheduledContent();
  assert.equal(result.counts.publicados, 1);
  assert.equal(result.counts.fallidos, 1);
  assert.match(result.data, /Falla al publicar/);
  assert.match(result.data, /Facebook respondió 400/);
});

test('propaga un fallo de Lion Platform sin lanzar', async () => {
  lionPlatform.listContentPosts = async () => ({ success: false, error: 'backend caído' });
  const result = await publishDueScheduledContent();
  assert.equal(result.success, false);
  assert.equal(result.error, 'backend caído');
});
