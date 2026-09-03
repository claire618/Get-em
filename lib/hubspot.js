const axios = require('axios');

const HUBSPOT_TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
const OWNER_ID = process.env.HUBSPOT_OWNER_ID; // your HubSpot user/owner id
const PORTAL_ID = process.env.HUBSPOT_PORTAL_ID; // for building clickable record links

const hubspot = axios.create({
  baseURL: 'https://api.hubapi.com',
  headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
});

/**
 * Finds contacts owned by you with no real engagement in `minDaysStale` days.
 * Uses hs_last_sales_activity_timestamp (their engagement — opens site,
 * tracked emails, meetings) rather than notes_last_contacted (your own
 * outbound), since "stale" should mean they've gone quiet, not that you
 * haven't tried.
 */
async function getStaleContacts({ minDaysStale = 14 } = {}) {
  const cutoff = new Date(Date.now() - minDaysStale * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await hubspot.post('/crm/v3/objects/contacts/search', {
    filterGroups: [
      {
        filters: [
          { propertyName: 'hubspot_owner_id', operator: 'EQ', value: OWNER_ID },
          { propertyName: 'hs_last_sales_activity_timestamp', operator: 'LT', value: cutoff },
        ],
      },
    ],
    properties: [
      'firstname',
      'lastname',
      'company',
      'hs_lead_status',
      'lifecyclestage',
      'hs_last_sales_activity_timestamp',
      'notes_last_contacted',
    ],
    sorts: [{ propertyName: 'hs_last_sales_activity_timestamp', direction: 'ASCENDING' }],
    limit: 50,
  });

  return data.results.map((r) => ({
    id: r.id,
    name: `${r.properties.firstname || ''} ${r.properties.lastname || ''}`.trim(),
    company: r.properties.company,
    stage: r.properties.hs_lead_status || r.properties.lifecyclestage,
    lastEngaged: r.properties.hs_last_sales_activity_timestamp,
    url: `https://app.hubspot.com/contacts/${PORTAL_ID}/contact/${r.id}`,
  }));
}

/**
 * Fetches existing company domains/names so new-account sourcing candidates
 * can be de-duped against what's already in HubSpot.
 */
async function getExistingCompanyDomains() {
  const { data } = await hubspot.post('/crm/v3/objects/companies/search', {
    properties: ['domain', 'name'],
    limit: 200,
  });
  return new Set(data.results.map((r) => (r.properties.domain || r.properties.name || '').toLowerCase()));
}

module.exports = { getStaleContacts, getExistingCompanyDomains };
