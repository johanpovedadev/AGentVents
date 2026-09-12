require('dotenv').config();

const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

/** Ejecuta una petición autenticada a la API REST v3 de HubSpot. */
async function hubspotRequest(path, options = {}) {
  if (!process.env.HUBSPOT_ACCESS_TOKEN) {
    return { success: false, error: 'Falta la variable de entorno HUBSPOT_ACCESS_TOKEN.' };
  }

  try {
    const response = await fetch(`${HUBSPOT_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        success: false,
        error: `HubSpot respondió ${response.status}: ${body.message || 'No fue posible completar la operación.'}`
      };
    }

    return { success: true, data: body };
  } catch (error) {
    return { success: false, error: `No fue posible conectar con HubSpot: ${error.message}` };
  }
}

/** Obtiene los deals disponibles junto con sus propiedades principales. */
async function getDeals() {
  return hubspotRequest('/crm/v3/objects/deals?limit=100&properties=dealname,amount,dealstage,pipeline');
}

/** Actualiza la etapa de un deal existente. */
async function updateDealStage(dealId, dealstage) {
  if (!dealId || !dealstage) {
    return { success: false, error: 'Se requieren dealId y dealstage para actualizar el deal.' };
  }
  return hubspotRequest(`/crm/v3/objects/deals/${dealId}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: { dealstage } })
  });
}

/** Busca un contacto exacto por su número de teléfono. */
async function searchContactByPhone(phone) {
  if (!phone) return { success: false, error: 'Se requiere un teléfono para buscar el contacto.' };
  return hubspotRequest('/crm/v3/objects/contacts/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'phone', operator: 'EQ', value: String(phone) }] }],
      properties: ['firstname', 'lastname', 'email', 'phone'],
      limit: 1
    })
  });
}

/** Crea un contacto con los campos básicos permitidos por el CRM. */
async function createContact(datos) {
  const properties = Object.fromEntries(
    ['firstname', 'lastname', 'email', 'phone']
      .filter((key) => datos && datos[key] !== undefined && datos[key] !== '')
      .map((key) => [key, datos[key]])
  );
  if (Object.keys(properties).length === 0) {
    return { success: false, error: 'Debes incluir al menos una propiedad para crear el contacto.' };
  }
  return hubspotRequest('/crm/v3/objects/contacts', {
    method: 'POST',
    body: JSON.stringify({ properties })
  });
}

/** Crea un deal y lo asocia al contacto indicado. */
async function createDeal(datos) {
  const contactId = datos && datos.contactId;
  const properties = Object.fromEntries(
    ['dealname', 'amount', 'dealstage', 'pipeline']
      .filter((key) => datos && datos[key] !== undefined && datos[key] !== '')
      .map((key) => [key, datos[key]])
  );
  if (!contactId) return { success: false, error: 'Se requiere contactId para asociar el deal.' };
  if (!properties.dealname) return { success: false, error: 'Se requiere dealname para crear el deal.' };

  return hubspotRequest('/crm/v3/objects/deals', {
    method: 'POST',
    body: JSON.stringify({
      properties,
      associations: [{
        to: { id: String(contactId) },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }]
      }]
    })
  });
}

/** Actualiza las propiedades entregadas de un contacto existente. */
async function updateContact(contactId, propiedades) {
  if (!contactId || !propiedades || Object.keys(propiedades).length === 0) {
    return { success: false, error: 'Se requieren contactId y propiedades para actualizar el contacto.' };
  }
  return hubspotRequest(`/crm/v3/objects/contacts/${contactId}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: propiedades })
  });
}

module.exports = {
  getDeals,
  updateDealStage,
  searchContactByPhone,
  createContact,
  createDeal,
  updateContact
};
