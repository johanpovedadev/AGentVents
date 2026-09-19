require('dotenv').config();

const GRAPH_BASE_URL = process.env.META_GRAPH_BASE_URL || 'https://graph.facebook.com/v21.0';

/** Lee una variable de entorno requerida o lanza un error descriptivo. */
function requireConfig(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}.`);
  return value;
}

/** Publica texto y, opcionalmente, un enlace en la Página de Facebook configurada. */
async function publishToFacebook({ texto, enlace } = {}) {
  try {
    const pageId = requireConfig('FB_PAGE_ID');
    const token = requireConfig('FB_PAGE_ACCESS_TOKEN');
    if (!texto) return { success: false, error: 'Se requiere texto para publicar en Facebook.' };

    const params = new URLSearchParams({ message: texto, access_token: token });
    if (enlace) params.set('link', enlace);

    const response = await fetch(`${GRAPH_BASE_URL}/${pageId}/feed`, { method: 'POST', body: params });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { success: false, error: `Facebook respondió ${response.status}: ${(body.error && body.error.message) || 'error desconocido'}` };
    }
    return { success: true, data: { id: body.id } };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Publica una imagen con pie de foto en la cuenta de Instagram Business vinculada.
 * Sigue el flujo de dos pasos de Graph API: crear el contenedor de medios y luego publicarlo.
 */
async function publishToInstagram({ imagenUrl, texto } = {}) {
  try {
    const igUserId = requireConfig('IG_BUSINESS_ACCOUNT_ID');
    const token = requireConfig('FB_PAGE_ACCESS_TOKEN');
    if (!imagenUrl) return { success: false, error: 'Se requiere imagenUrl para publicar en Instagram.' };

    const containerParams = new URLSearchParams({ image_url: imagenUrl, caption: texto || '', access_token: token });
    const containerResponse = await fetch(`${GRAPH_BASE_URL}/${igUserId}/media`, { method: 'POST', body: containerParams });
    const containerBody = await containerResponse.json().catch(() => ({}));
    if (!containerResponse.ok || !containerBody.id) {
      return { success: false, error: `Instagram (crear contenedor) respondió ${containerResponse.status}: ${(containerBody.error && containerBody.error.message) || 'error desconocido'}` };
    }

    const publishParams = new URLSearchParams({ creation_id: containerBody.id, access_token: token });
    const publishResponse = await fetch(`${GRAPH_BASE_URL}/${igUserId}/media_publish`, { method: 'POST', body: publishParams });
    const publishBody = await publishResponse.json().catch(() => ({}));
    if (!publishResponse.ok) {
      return { success: false, error: `Instagram (publicar) respondió ${publishResponse.status}: ${(publishBody.error && publishBody.error.message) || 'error desconocido'}` };
    }
    return { success: true, data: { id: publishBody.id } };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

const MIN_CAROUSEL_ITEMS = 2;
const MAX_CAROUSEL_ITEMS = 10;

/** Crea el contenedor hijo (is_carousel_item) de una imagen del carrusel y devuelve su id. */
async function createCarouselItemContainer(igUserId, token, imagenUrl) {
  const params = new URLSearchParams({ image_url: imagenUrl, is_carousel_item: 'true', access_token: token });
  const response = await fetch(`${GRAPH_BASE_URL}/${igUserId}/media`, { method: 'POST', body: params });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.id) {
    const detalle = (body.error && body.error.message) || 'error desconocido';
    throw new Error(`Instagram (crear elemento del carrusel) respondió ${response.status}: ${detalle}`);
  }
  return body.id;
}

/**
 * Publica un carrusel de 2 a 10 imágenes en la cuenta de Instagram Business vinculada.
 * Cada imagen se sube primero como contenedor hijo, luego se agrupan en un
 * contenedor padre de tipo CAROUSEL y por último se publica ese contenedor.
 */
async function publishInstagramCarousel({ imagenes, texto } = {}) {
  try {
    const igUserId = requireConfig('IG_BUSINESS_ACCOUNT_ID');
    const token = requireConfig('FB_PAGE_ACCESS_TOKEN');
    if (!Array.isArray(imagenes) || imagenes.length < MIN_CAROUSEL_ITEMS || imagenes.length > MAX_CAROUSEL_ITEMS) {
      return { success: false, error: `Un carrusel de Instagram necesita entre ${MIN_CAROUSEL_ITEMS} y ${MAX_CAROUSEL_ITEMS} imágenes.` };
    }

    const childIds = [];
    for (const imagenUrl of imagenes) {
      childIds.push(await createCarouselItemContainer(igUserId, token, imagenUrl));
    }

    const containerParams = new URLSearchParams({ media_type: 'CAROUSEL', caption: texto || '', children: childIds.join(','), access_token: token });
    const containerResponse = await fetch(`${GRAPH_BASE_URL}/${igUserId}/media`, { method: 'POST', body: containerParams });
    const containerBody = await containerResponse.json().catch(() => ({}));
    if (!containerResponse.ok || !containerBody.id) {
      return { success: false, error: `Instagram (crear carrusel) respondió ${containerResponse.status}: ${(containerBody.error && containerBody.error.message) || 'error desconocido'}` };
    }

    const publishParams = new URLSearchParams({ creation_id: containerBody.id, access_token: token });
    const publishResponse = await fetch(`${GRAPH_BASE_URL}/${igUserId}/media_publish`, { method: 'POST', body: publishParams });
    const publishBody = await publishResponse.json().catch(() => ({}));
    if (!publishResponse.ok) {
      return { success: false, error: `Instagram (publicar) respondió ${publishResponse.status}: ${(publishBody.error && publishBody.error.message) || 'error desconocido'}` };
    }
    return { success: true, data: { id: publishBody.id } };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/** Publica en el canal indicado: 'facebook' o 'instagram'. Un arreglo en datos.imagenes publica un carrusel. */
async function publish(canal, datos) {
  if (canal === 'facebook') return publishToFacebook(datos);
  if (canal === 'instagram') {
    return datos && Array.isArray(datos.imagenes) ? publishInstagramCarousel(datos) : publishToInstagram(datos);
  }
  return { success: false, error: `Canal no soportado: ${canal}. Usa 'facebook' o 'instagram'.` };
}

module.exports = { publish, publishToFacebook, publishToInstagram, publishInstagramCarousel };
