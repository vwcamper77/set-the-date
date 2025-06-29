const functions = require('firebase-functions');
const fetch = require('node-fetch');

const BASE_URL = functions.config().app?.base_url || 'https://plan.setthedate.app';

module.exports = async function serverFetch(path, options = {}) {
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  console.log('➡️ Calling:', url);
  return fetch(url, options);
};
