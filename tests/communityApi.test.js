const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const validation = require('../lib/communityValidation.cjs');
const source = fs.readFileSync(require('node:path').join(__dirname,'../pages/api/community/[id].js'),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replace('export default async function handler','async function handler');

async function request({method='GET', body={}, user=null, enabled=true, closed=false, exists=true, limited=false}={}) {
  const writes=[];
  const feed = [{id:'message123456',data:()=>({name:'Guest',text:'See you there!',createdAt:{toDate:()=>new Date('2026-10-25T10:00:00Z')}})}];
  const messageRef = {delete:async()=>writes.push('delete')};
  const messages = {doc:()=>messageRef,orderBy:()=>({limit:()=>({get:async()=>({docs:feed})})})};
  const ref = {get:async()=>({data:()=>({closed,announcement:'Meet outside'})}),collection:()=>messages,set:async data=>writes.push(data)};
  const db={collection:name=>({doc:()=>name==='polls'?{get:async()=>({exists,data:()=>({eventTitle:'Dinner',organiserEmail:'host@example.com',editToken:'must-not-leak',organiserPhone:'must-not-leak'})})}:ref}),
    runTransaction:async cb=>cb({get:async()=>({data:()=>({closed})}),set:(_,data)=>writes.push(data)})};
  const context=vm.createContext({...validation, db,FieldValue:{serverTimestamp:()=>1},
    process:{env:{EVENT_COMMUNITY_ENABLED:enabled?'true':''}},console:{error(){}},isAdminEmail:()=>false,
    allowPublicAction:async()=>!limited,
    verifyRequestFirebaseUser:async()=>{if(!user){const e=new Error('Unauthorised');e.statusCode=401;throw e;}return user;}});
  vm.runInContext(source+'\nglobalThis.handler=handler;',context);
  const res={code:200,setHeader(){},status(code){this.code=code;return this;},json(data){this.body=data;return this;}};
  await context.handler({method,query:{id:'poll123'},headers:user?{authorization:'Bearer mock'}:{},body},res);
  return {res,writes};
}
test('community is off by default and does not expose poll secrets',async()=>{
  assert.equal((await request({enabled:false})).res.code,503);
  const {res}=await request();
  assert.equal(res.code,200);
  assert.equal(res.body.messages[0].text,'See you there!');
  assert.equal(JSON.stringify(res.body).includes('must-not-leak'),false);
});
test('deleted events and closed discussions do not accept messages',async()=>{
  const body={name:'Guest',text:'Hello'};
  const absent=await request({method:'POST',body,exists:false});
  assert.equal(absent.res.code,404);assert.equal(absent.writes.length,0);
  const closed=await request({method:'POST',body,closed:true});
  assert.equal(closed.res.code,409);assert.equal(closed.writes.length,0);
  const limited=await request({method:'POST',body,limited:true});
  assert.equal(limited.res.code,429);assert.equal(limited.writes.length,0);
});
test('guest posting stores only plain message fields; moderation requires verified ownership',async()=>{
  const {res,writes}=await request({method:'POST',body:{name:'Guest',text:'Hello',isAdmin:true,email:'private@example.com'}});
  assert.equal(res.code,201);assert.deepEqual(Object.keys(writes[0]).sort(),['createdAt','name','text']);
  assert.equal((await request({method:'DELETE',body:{messageId:'message123456'}})).res.code,401);
  assert.equal((await request({method:'DELETE',body:{messageId:'message123456'},user:{email:'guest@example.com',email_verified:true}})).res.code,403);
  const owner=await request({method:'PATCH',body:{closed:true,announcement:'Bring snacks'},user:{email:'host@example.com',email_verified:true}});
  assert.equal(owner.res.code,200);assert.equal(owner.writes[0].closed,true);
});
