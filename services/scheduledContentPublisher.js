const lionPlatformClient = require('./lionPlatformClient');
const metaPublisher = require('./metaPublisher');

const CANAL_POR_PLATAFORMA = { FACEBOOK: 'facebook' };

function hoyIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatList(items, mapper) {
  return items.map(mapper).join('\n');
}

/**
 * Publica automaticamente los posts del calendario de contenido (Lion
 * Platform) que ya llegaron a su fecha programada. Solo Facebook por ahora
 * -- Instagram necesita una imagen y ContentPost todavia no tiene un campo
 * para eso, asi que esos posts se reportan como pendientes, no se inventan.
 * Un post SCHEDULED sin body (solo tema, sin texto real escrito) tampoco se
 * publica solo: se avisa para que alguien lo redacte primero.
 */
async function publishDueScheduledContent() {
  const startedAt = Date.now();
  const result = await lionPlatformClient.listContentPosts();
  if (!result.success) return result;

  const hoy = hoyIso();
  const vencidos = result.data.filter((post) => post.status === 'SCHEDULED' && post.scheduledFor && post.scheduledFor <= hoy);

  const publicados = [];
  const sinContenido = [];
  const noSoportados = [];
  const fallidos = [];

  for (const post of vencidos) {
    const canal = CANAL_POR_PLATAFORMA[post.platform];
    if (!canal) {
      noSoportados.push(post);
      continue;
    }
    if (!post.body || !post.body.trim()) {
      sinContenido.push(post);
      continue;
    }

    const publishResult = await metaPublisher.publish(canal, { texto: post.body });
    if (!publishResult.success) {
      fallidos.push({ post, error: publishResult.error });
      continue;
    }

    const externalUrl = `https://www.facebook.com/${publishResult.data.id}`;
    await lionPlatformClient.updateContentPost(post.id, { status: 'PUBLISHED', externalUrl });
    publicados.push({ post, externalUrl });
  }

  const secciones = [
    publicados.length === 0
      ? 'Sin publicaciones nuevas hoy.'
      : `✅ ${publicados.length} publicado(s):\n${formatList(publicados, ({ post, externalUrl }) => `• [${post.platform}] ${post.topic} — ${externalUrl}`)}`,
    sinContenido.length === 0
      ? null
      : `📝 ${sinContenido.length} vencido(s) sin texto escrito todavía — complétalos en el Calendario de Contenido:\n${formatList(sinContenido, (p) => `• [${p.platform}] ${p.topic} — vencía ${p.scheduledFor}`)}`,
    noSoportados.length === 0
      ? null
      : `📌 ${noSoportados.length} vencido(s) en plataformas sin publicación automática todavía — publícalos a mano:\n${formatList(noSoportados, (p) => `• [${p.platform}] ${p.topic} — vencía ${p.scheduledFor}`)}`,
    fallidos.length === 0
      ? null
      : `❌ ${fallidos.length} fallo(s) al publicar:\n${formatList(fallidos, ({ post, error }) => `• [${post.platform}] ${post.topic} — ${error}`)}`
  ].filter(Boolean);

  const texto = secciones.join('\n\n');
  const elapsedSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(2));
  return {
    success: true,
    data: texto,
    elapsedSeconds,
    counts: { publicados: publicados.length, sinContenido: sinContenido.length, noSoportados: noSoportados.length, fallidos: fallidos.length }
  };
}

module.exports = { publishDueScheduledContent };
