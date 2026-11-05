const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
async function request(route, { method = route === 'cron/organiser-helpers' ? 'GET' : 'POST', body = {}, user = null, production = true, authorization = '', secret = 'scheduler-secret', query = {} } = {}) {
  const calls = [];
  const helpers = Object.fromEntries(['preview', 'runScheduled', 'saveSettings', 'pauseEvent', 'dismissAttempt', 'stop'].map(name => [name, async (...args) => { calls.push({ name, args }); return {}; }]));
  const source = fs.readFileSync(path.join(__dirname, '../pages/api', route + '.js'), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export const config', 'const config').replace('export default async function handler', 'async function handler');
  const context = vm.createContext({ helpers, crypto, Buffer, console: { error() {} }, process: { env: { CRON_SECRET: secret, BREVO_API_KEY: 'mock' } }, isHelpersProduction: () => production,
    isAdminEmail: email => email === 'admin@example.com', verifyRequestFirebaseUser: async () => { if (user) return user; const error = new Error('Missing auth'); error.statusCode = 401; throw error; } });
  vm.runInContext(source + '\nglobalThis.handler = handler;', context);
  const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
  await context.handler({ method, body, query, headers: { authorization } }, res);
  return { res, calls };
}
test('admin helper API rejects guests, ordinary users, and unverified admin identities', async () => {
  for (const user of [null, { email: 'guest@example.com', email_verified: true }, { email: 'admin@example.com', email_verified: false }]) {
    const result = await request('admin/organiser-helpers', { method: 'GET', user });
    assert.ok([401, 403].includes(result.res.code)); assert.equal(result.calls.length, 0);
  }
});
test('admin preview cannot mutate settings; production and valid input are required for changes', async () => {
  const user = { email: 'admin@example.com', email_verified: true };
  const preview = await request('admin/organiser-helpers', { method: 'GET', user, production: false });
  assert.equal(preview.res.code, 200); assert.equal(preview.calls[0].name, 'preview');
  const denied = await request('admin/organiser-helpers', { user, production: false, body: { action: 'settings', enabled: true } });
  assert.equal(denied.res.code, 403); assert.equal(denied.calls.length, 0);
  const invalid = await request('admin/organiser-helpers', { user, body: { action: 'pause', pollId: '../bad', paused: true } });
  assert.equal(invalid.res.code, 400); assert.equal(invalid.calls.length, 0);
});
test('scheduler rejects missing, wrong, Unicode and unconfigured secrets before accessing data', async () => {
  for (const options of [{}, { authorization: 'Bearer wrong' }, { authorization: 'Bearer schéduler-secre' }, { authorization: 'Bearer undefined', secret: undefined }, { authorization: 'Bearer ', secret: '' }]) {
    const result = await request('cron/organiser-helpers', options);
    assert.equal(result.res.code, 401); assert.equal(result.calls.length, 0);
  }
});
test('scheduler requires GET and production and accepts only an authenticated run', async () => {
  const authorization = 'Bearer scheduler-secret';
  assert.equal((await request('cron/organiser-helpers', { authorization, method: 'POST' })).res.code, 405);
  const preview = await request('cron/organiser-helpers', { authorization, production: false });
  assert.equal(preview.res.code, 403); assert.equal(preview.calls.length, 0);
  const run = await request('cron/organiser-helpers', { authorization });
  assert.equal(run.res.code, 200); assert.equal(run.calls[0].name, 'runScheduled');
});
test('unsubscribe GET never changes state; only valid token-shaped POST reaches verification', async () => {
  assert.equal((await request('organiser-helpers/stop', { method: 'GET' })).res.code, 405);
  const invalid = await request('organiser-helpers/stop', { body: { pollId: '../bad', token: 'x' } });
  assert.equal(invalid.calls.length, 0);
  const valid = await request('organiser-helpers/stop', { body: { pollId: 'event', token: 'a'.repeat(48) } });
  assert.equal(valid.calls[0].name, 'stop');
});
test('legacy reminders remain retired when helpers are paused, and freeze old counters', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../lib/organiserHelpers/server.js'), 'utf8').replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
  const legacy = require('../lib/organiserHelpers/policy.cjs');
  const writes = [];
  const state = {};
  const db = { collection: name => ({ doc: () => ({ name, get: async () => ({ data: () => ({ enabled: false, activatedAt: 1 }) }) }) }),
    runTransaction: async callback => callback({ get: async ref => ({ exists: true, data: () => ref.name === 'polls' ? { shareReminderCount: 1, lastShareReminderSentAt: 123 } : state }), set: (ref, value) => { Object.assign(state, value); writes.push(value); } }) };
  const context = vm.createContext({ ...legacy, db, createHelpers: () => ({}), process: { env: { VERCEL_ENV: 'production' } } });
  vm.runInContext(source + '\nglobalThis.retired = legacyHelpersRetired;', context);
  const res = { status(code) { this.code = code; return this; }, json() {} };
  assert.equal(await context.retired({ body: { pollId: 'event' } }, res), true);
  assert.equal(res.code, 409); assert.equal(state.legacyCounts.share, 1); assert.equal(state.lastLegacyAt, 123);
  await context.retired({ body: { pollId: 'event' } }, res);
  assert.equal(writes.length, 1);
});
