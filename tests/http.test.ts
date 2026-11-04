import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { Store } from '../src/server/store.js';
import { GameService } from '../src/server/service.js';
import { createApp } from '../src/server/http.js';
import { sign } from '../src/server/security.js';
test('HTTP authentication, signed ingress, privacy and source readiness',async()=>{
  const secret='s'.repeat(64),token='a'.repeat(64),service=new GameService(new Store(':memory:'),'live',secret);
  const app=createApp(service,{host:'127.0.0.1',port:0,origin:'http://localhost:3000',adminToken:token,secret,dataDir:'.',mode:'live',publicDir:resolve('dist/public'),ttsVoice:''});
  await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const signed=async(path:string,value:unknown)=>{const b=JSON.stringify(value),ts=String(Date.now());return fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','x-slime-timestamp':ts,'x-slime-signature':sign(secret,ts,b)},body:b});};
  try{
    assert.equal((await fetch(base+'/healthz')).status,200);
    assert.equal((await fetch(base+'/readyz')).status,503);
    assert.equal((await fetch(base+'/api/admin/state')).status,401);
    const state=await(await fetch(base+'/api/state')).text();assert.ok(!state.includes(secret));assert.ok(!state.includes(token));
    assert.equal((await fetch(base+'/api/state',{headers:{Origin:'https://evil.example'}})).status,403);
    assert.equal((await signed('/api/source',{provider:'fixture',connected:true})).status,200);
    const headers={'Content-Type':'application/json',Authorization:`Bearer ${token}`};
    assert.equal((await fetch(base+'/api/admin/control',{method:'POST',headers,body:'{"command":"resume"}'})).status,200);
    assert.equal((await fetch(base+'/readyz')).status,200);
    assert.equal((await fetch(base+'/api/admin/test',{method:'POST',headers,body:'{"ingredient":"tutkal","units":1}'})).status,403);
    const event={id:'a',source:'tiktok',roomId:'r',timestamp:Date.now(),kind:'gift',user:{id:'123',name:'<script>hi</script>'},gift:{id:'rose',name:'Rose',coins:1,repeat:1}};
    assert.equal((await signed('/api/ingest',event)).status,200);
    assert.equal((await(await signed('/api/ingest',event)).json() as {status:string}).status,'duplicate');
    assert.equal((await fetch(base+'/.env')).status,404);
    assert.equal((await fetch(base+'/api/voice/../../.env')).status,404);
    assert.equal((await fetch(base+'/api/voice/'+'a'.repeat(32)+'.mp3')).status,404);
    assert.equal((await fetch(base+'/overlay')).status,200);
    assert.ok(!(await(await fetch(base+'/api/state')).text()).includes('<script>'));
  }finally{await app.close();}
});
