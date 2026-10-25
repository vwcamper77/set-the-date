const test = require('node:test');
const assert = require('node:assert/strict');
const { EVENT_ID, MESSAGE_ID, validateMessage, canModerate } = require('../lib/communityValidation.cjs');
test('community text is bounded and names are plain self-entered text', () => {
  assert.deepEqual(validateMessage({name:'  Alice  ',text:'Meet at six?'}), {name:'Alice',text:'Meet at six?'});
  for (const body of [{name:'',text:'Hello'}, {name:'a'.repeat(61),text:'Hello'}, {name:'A',text:'x'.repeat(1501)}, {name:{},text:'Hello'}]) assert.throws(() => validateMessage(body));
});
test('community paths cannot escape event scope', () => {
  assert.equal(EVENT_ID.test('../poll'), false);
  assert.equal(EVENT_ID.test('abc/other'), false);
  assert.equal(EVENT_ID.test('poll_123-test'), true);
  assert.equal(MESSAGE_ID.test('../message'), false);
});
test('moderation requires verified organiser or verified admin, not a displayed guest name', () => {
  const admin = email => email === 'admin@example.com';
  const poll = {organiserEmail:'Host@Example.com'};
  assert.equal(canModerate(null,poll,admin),false);
  assert.equal(canModerate({email:'host@example.com',email_verified:false},poll,admin),false);
  assert.equal(canModerate({email:'host@example.com',email_verified:true},poll,admin),true);
  assert.equal(canModerate({email:'guest@example.com',email_verified:true},poll,admin),false);
  assert.equal(canModerate({email:'admin@example.com',email_verified:true},poll,admin),true);
});
