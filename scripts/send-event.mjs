import { createHmac, randomUUID } from 'node:crypto';
if (process.env.MODE !== 'demo') throw new Error('Simulation only works in MODE=demo');
const secret=process.env.WEBHOOK_SECRET;
if (!secret) throw new Error('Run npm run setup');
const value={id:randomUUID(),source:'demo',roomId:'cli-demo',timestamp:Date.now(),kind:'gift',user:{id:'cli-tester',name:'CLI TEST'},gift:{id:'demo',name:'Demo gift',coins:10,repeat:1}};
const body=JSON.stringify(value),ts=String(Date.now());
const response=await fetch(process.env.INGEST_URL ?? 'http://127.0.0.1:3000/api/ingest',{method:'POST',signal:AbortSignal.timeout(5000),headers:{'Content-Type':'application/json','x-slime-timestamp':ts,'x-slime-signature':createHmac('sha256',secret).update(`${ts}.${body}`).digest('hex')},body});
console.log(response.status,await response.text());if(!response.ok)process.exitCode=1;
