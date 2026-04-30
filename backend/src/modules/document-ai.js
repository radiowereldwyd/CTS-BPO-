/**
 * Google Document AI
 * Extracts structured data from scanned documents, PDFs, invoices, forms.
 * Core BPO service: clients send us documents, we extract and return structured data.
 * Requires: GOOGLE_API_KEY + GOOGLE_DOCAI_PROCESSOR_ID + GOOGLE_CLOUD_PROJECT_ID
 */
const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
const auditLogger = require('./audit-logger');

const PROJECT_ID    = process.env.GOOGLE_CLOUD_PROJECT_ID  || '';
const PROCESSOR_ID  = process.env.GOOGLE_DOCAI_PROCESSOR_ID || '';
const LOCATION      = process.env.GOOGLE_DOCAI_LOCATION     || 'us';

function isConfigured() {
  return !!(PROJECT_ID && PROCESSOR_ID && (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_SERVICE_ACCOUNT_JSON));
}

/**
 * Get an authenticated access token via service account.
 */
async function getAccessToken() {
  let keyFile;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    keyFile = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }
  const auth = new GoogleAuth({
    credentials: keyFile,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const token  = await client.getAccessToken();
  return token.token;
}

/**
 * Process a document (PDF or image) and extract structured data.
 * @param {string} base64Content - Base64-encoded file content
 * @param {string} mimeType      - 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/tiff'
 * @returns {{ text, pages, entities, keyValuePairs }}
 */
async function processDocument(base64Content, mimeType = 'application/pdf') {
  if (!isConfigured()) {
    return {
      simulated: true,
      text: '[DOCUMENT AI SIMULATED] Extracted text would appear here.',
      entities: [],
      keyValuePairs: [],
      pages: 1,
    };
  }

  const token = await getAccessToken();
  const endpoint = `https://${LOCATION}-documentai.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/processors/${PROCESSOR_ID}:process`;

  const res = await axios.post(endpoint, {
    rawDocument: { content: base64Content, mimeType },
  }, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    timeout: 60000,
  });

  const doc = res.data.document;
  const text = doc.text || '';

  // Extract key-value pairs (form fields)
  const keyValuePairs = [];
  if (doc.pages) {
    for (const page of doc.pages) {
      for (const field of (page.formFields || [])) {
        const key   = field.fieldName?.textAnchor?.content  || '';
        const value = field.fieldValue?.textAnchor?.content || '';
        if (key) keyValuePairs.push({ key: key.trim(), value: value.trim() });
      }
    }
  }

  // Extract named entities
  const entities = (doc.entities || []).map(e => ({
    type:       e.type,
    mentionText: e.mentionText,
    confidence: e.confidence,
  }));

  await auditLogger.log('ai.document', null, null,
    `Document processed: ${doc.pages?.length || 1} page(s), ${entities.length} entities, ${keyValuePairs.length} fields`, null, 'info');

  return { text, entities, keyValuePairs, pages: doc.pages?.length || 1 };
}

module.exports = { processDocument, isConfigured };
