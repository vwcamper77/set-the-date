const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const cases = [
  ['sendOrganiserEmail', { firstName:'Test',email:'organiser@example.com',pollId:'test-poll',editToken:'private-test-token',eventTitle:'Test event' }],
  ['notifyOrganiserOnVote', { organiserEmail:'organiser@example.com',organiserName:'Test',eventTitle:'Test event',pollId:'test-poll',voterName:'Guest' }],
  ['notifyAttendeesOfCancellation', { attendees:[{email:'guest@example.com'}],eventTitle:'Test event' }],
];
for (const [name, body] of cases) {
  async function run(status) {
    const calls = [];
    const source = fs.readFileSync(path.join(__dirname,'../pages/api',name+'.js'),'utf8').replace('export default async function handler','async function handler');
    const context = vm.createContext({ process:{env:{BREVO_API_KEY:'mock-key'}}, console:{log(){},error(){}},
      fetch:async (url, options) => { calls.push({url, body:JSON.parse(options.body)}); return {ok:url.endsWith('/contacts') || status === 201,status}; } });
    vm.runInContext(source+'\nglobalThis.handler = handler;',context);
    const res = { statusCode:200,status(code){this.statusCode=code;return this;},json(data){this.body=data;return this;} };
    await context.handler({method:'POST',body},res);
    return {res,calls};
  }
  test(name+' preserves sender, replies and destinations when Brevo accepts',async()=>{
    const {res,calls} = await run(201);
    assert.equal(res.statusCode,200);
    const email = calls.find(call=>call.url.endsWith('/smtp/email')).body;
    assert.equal(email.sender.email,'hello@setthedate.app');
    assert.equal(email.replyTo.email,'hello@setthedate.app');
    assert.equal(email.to[0].email,name==='notifyAttendeesOfCancellation'?'guest@example.com':'organiser@example.com');
    if(name==='sendOrganiserEmail') {
      assert.ok(email.htmlContent.includes('https://plan.setthedate.app/edit/test-poll?token=private-test-token'));
      assert.ok(email.textContent.includes('https://plan.setthedate.app/share/test-poll'));
    }
  });
  test(name+' does not report success for a Brevo outage or quota rejection',async()=>{
    for(const status of [401,429,500]) assert.equal((await run(status)).res.statusCode,500);
  });
}
