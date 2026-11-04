import { createHmac } from 'node:crypto';
import { resolve } from 'node:path';
import { normalize } from './normalize.mjs';
import { Outbox } from './outbox.mjs';

const env = process.env;
if (env.MODE !== 'live') throw new Error('Bridge requires MODE=live. Demo uses an isolated simulator.');
const secret = env.WEBHOOK_SECRET ?? '';
if (secret.length < 32) throw new Error('WEBHOOK_SECRET is missing');
const endpoint = new URL(env.INGEST_URL ?? 'http://127.0.0.1:3000/api/ingest');
if (!['http:','https:'].includes(endpoint.protocol)) throw new Error('Invalid INGEST_URL');
const provider = env.BRIDGE_PROVIDER ?? 'tiktok';
if (!['tiktok','tikfinity'].includes(provider)) throw new Error('Unsupported BRIDGE_PROVIDER');
const outbox = new Outbox(resolve(env.DATA_DIR ?? 'data','bridge-outbox.sqlite'));
let active = false, stopped = false, delivering = false, heartbeatBusy = false, failures = 0;
let disconnect = async () => {};
let context = { source: provider, roomId: '', hostId: env.TIKTOK_HOST_ID ?? '', hostUsername: env.TIKTOK_USERNAME ?? '', forwardChat: env.FORWARD_CHAT === 'true' };
let dropped = 0, lastDropReport = 0, retryAt = 0;
const log = (event, extra = {}) => console.log(JSON.stringify({event,provider,...extra}));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function signed(path, value) {
  const body = typeof value === 'string' ? value : JSON.stringify(value), ts = String(Date.now());
  const url = new URL(path, endpoint);
  return fetch(url, { method: 'POST', signal: AbortSignal.timeout(8000), headers: {
    'Content-Type':'application/json', 'x-slime-timestamp':ts,
    'x-slime-signature':createHmac('sha256',secret).update(`${ts}.${body}`).digest('hex')
  }, body });
}
async function heartbeat() {
  if (heartbeatBusy) return; heartbeatBusy = true;
  try { await signed('/api/source', { provider, connected: !stopped && active && (!outbox.first() || Date.now()-Number(outbox.first().at)<20000) }); }
  catch { /* The server independently pauses when the heartbeat expires. */ }
  finally { heartbeatBusy = false; }
}
async function stop(reason, code = 0) {
  if (stopped) return; stopped = true; active = false;
  log(reason); clearInterval(deliveryTimer); clearInterval(heartbeatTimer);
  await heartbeat(); await Promise.race([disconnect(),sleep(2000)]).catch(()=>{});
  // Leave unacknowledged messages durable; never fabricate successful delivery.
  while (delivering) await sleep(50);
  outbox.close(); process.exitCode = code;
}
function receive(kind, data) {
  if (stopped) return;
  const event = normalize(kind, data, context);
  if (!event) { dropped++; return; }
  try { outbox.push(event); }
  catch { void stop('outbox_full_operator_required',2); }
}
async function deliver() {
  if (delivering || stopped || Date.now()<retryAt) return; delivering = true;
  try {
    // Bounded sequential batches preserve fairness without an unbounded promise fan-out.
    for (let i=0;i<16&&!stopped;i++) {
      const row = outbox.first();
      if (!row) break;
      if (Date.now()-Number(row.at)>540000) {
        outbox.remove(row.id); dropped++; log('expired_event_rejected'); continue;
      }
      const response = await signed(endpoint.pathname, String(row.body));
      if (response.ok) outbox.remove(row.id);
      else if (response.status>=400 && response.status<500 && response.status!==429) {
        log('ingestion_rejected_operator_required',{status:response.status});
        setTimeout(()=>void stop('bridge_disarmed',2),0); break;
      } else { retryAt=Date.now()+2000;break; }
    }
  } catch { retryAt=Date.now()+2000; }
  finally { delivering=false; }
  if (Date.now()-lastDropReport>60000 && dropped) { log('dropped_unusable_events',{count:dropped});dropped=0;lastDropReport=Date.now(); }
}
const deliveryTimer = setInterval(()=>void deliver(),100);
const heartbeatTimer = setInterval(()=>void heartbeat(),10000);
for (const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>void stop('operator_shutdown'));

async function connectTikTok() {
  if (env.CONNECTOR_LICENSE_ACK !== 'true') throw new Error('Read THIRD_PARTY.md before enabling the optional AGPL connector; set CONNECTOR_LICENSE_ACK=true only after review.');
  const username=(env.TIKTOK_USERNAME ?? '').replace(/^@/,'').trim();
  if (!/^[a-zA-Z0-9._]{1,64}$/.test(username)) throw new Error('Set TIKTOK_USERNAME');
  const { TikTokLiveConnection, fetchRoomInfoFromHtmlRoute } = await import('tiktok-live-connector');
  // Without an Euler Stream key, the room and host come from the public LIVE page; the extra room-info and gift-list
  // lookups need a paid plan and are skipped (gift messages carry their own price). Verified keyless on 2026-11-04.
  const keyed = !!env.SIGN_API_KEY;
  const client = new TikTokLiveConnection(username, { processInitialData:false,enableExtendedGiftInfo:keyed,fetchRoomInfoOnConnect:keyed,
    ...(keyed ? { signApiKey:env.SIGN_API_KEY } : {}) });
  const fromPage = async()=>{
    if (keyed) return undefined;
    try { const user=(await fetchRoomInfoFromHtmlRoute({ webClient:client.webClient, uniqueId:username }))?.user;
      if (user?.id && !context.hostId) context.hostId=String(user.id);
      return user?.roomId ? String(user.roomId) : undefined;
    } catch { return undefined; }
  };
  disconnect = async()=>{await client.disconnect();};
  client.on('gift', d=>receive('gift',d));
  client.on('chat', d=>receive('comment',d));
  client.on('like', d=>receive('like',d));
  client.on('follow', d=>receive('follow',d));
  client.on('member', d=>receive('join',d));
  client.on('error', ()=>log('provider_error'));
  client.on('disconnected', ()=>{active=false;void heartbeat();});
  // A suspended/ended live is NOT automatically recreated or bypassed.
  client.on('streamEnd', ()=>void stop('stream_ended_operator_required'));
  while (!stopped) {
    if (!active) {
      try {
        const result=await client.connect(await fromPage());
        if (stopped) {await client.disconnect();break;}
        context.roomId=String(result.roomId ?? client.roomId ?? '');
        const owner=client.roomInfo?.owner;
        const hostId=owner?.id_str ?? owner?.id;
        if (typeof hostId==='string' || typeof hostId==='bigint' || Number.isSafeInteger(hostId)) context.hostId=String(hostId);
        if(!context.roomId) throw new Error('No room ID');
        active=true;failures=0;await heartbeat();log('connected');
      } catch {
        failures++;log('connection_failed',{attempt:failures});
        if(failures>=12){await stop('reconnect_limit_operator_required',2);break;}
        await sleep(Math.min(60000,5000*2**Math.min(failures-1,4))+Math.random()*1000);
      }
    }
    await sleep(1000);
  }
}
async function connectTikFinity() {
  // TikFinity Desktop must itself be connected to the user's LIVE.
  const address = new URL(env.TIKFINITY_WS ?? 'ws://127.0.0.1:21213/');
  if (!['ws:','wss:'].includes(address.protocol)) throw new Error('Invalid TIKFINITY_WS');
  context.roomId=env.TIKTOK_ROOM_ID ?? '';
  if (!context.roomId) throw new Error('Set the actual TIKTOK_ROOM_ID for TikFinity; change it for each new LIVE.');
  while (!stopped) {
    await new Promise(resolveClose=>{
      const socket=new WebSocket(address); let settled=false;
      const finish=()=>{if(settled)return;settled=true;active=false;void heartbeat();resolveClose();};
      disconnect=async()=>{socket.close();finish();};
      socket.addEventListener('open',()=>{active=true;failures=0;log('desktop_connected');void heartbeat();});
      socket.addEventListener('message',msg=>{
        if (typeof msg.data!=='string' || msg.data.length>65536) return;
        try {
          const packet=JSON.parse(msg.data),kind={gift:'gift',chat:'comment',like:'like',follow:'follow',member:'join'}[packet.event];
          if(packet.event==='streamEnd'){void stop('stream_ended_operator_required');return;}
          if(kind)receive(kind,packet.data);
        } catch {dropped++;}
      });
      socket.addEventListener('close',finish);socket.addEventListener('error',()=>{socket.close();finish();});
    });
    if (!stopped) {failures++;if(failures>=12){await stop('reconnect_limit_operator_required',2);break;}await sleep(Math.min(60000,5000*failures));}
  }
}
try { await (provider==='tiktok'?connectTikTok():connectTikFinity()); }
catch { await stop('bridge_startup_failed_check_configuration',2); }
