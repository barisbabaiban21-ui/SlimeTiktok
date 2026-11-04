import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const env=process.env;
if(env.BROADCAST_ENABLED!=='true')throw new Error('Broadcasting is off. Set BROADCAST_ENABLED=true only with authorized RTMP access.');
const target=env.RTMP_URL ?? '';
if(!/^rtmps?:\/\/[^\s]+$/.test(target))throw new Error('RTMP_URL must be an authorized RTMP(S) ingest URL, including your stream key.');
const url=new URL(env.BROADCAST_URL ?? 'http://127.0.0.1:3000/overlay');
if(!['http:','https:'].includes(url.protocol))throw new Error('Invalid BROADCAST_URL');
url.pathname='/overlay';url.searchParams.set('quality','low');
const audioMode=env.BROADCAST_AUDIO ?? 'silent';
if(!['silent','pulse'].includes(audioMode))throw new Error('BROADCAST_AUDIO must be silent or pulse');
if(audioMode==='pulse')url.searchParams.set('audio','1');
const width=Number(env.STREAM_WIDTH ?? 720),height=Number(env.STREAM_HEIGHT ?? 1280),fps=Number(env.STREAM_FPS ?? 30);
if(![[720,1280],[1080,1920]].some(([w,h])=>w===width&&h===height)||![24,30,60].includes(fps))throw new Error('Use 720x1280 or 1080x1920 and 24/30/60 FPS');
const bitrate=env.STREAM_BITRATE ?? '2500k';if(!/^\d{3,5}k$/.test(bitrate))throw new Error('Invalid bitrate');
const display=env.DISPLAY ?? ':99';if(!/^:\d{1,3}$/.test(display))throw new Error('Invalid DISPLAY');
const profile=join(tmpdir(),'slimetiktok-chromium');mkdirSync(profile,{recursive:true});
const children=[];let stopping=false;let checking=false;let wasReady=false;
const grace=Number(env.BROADCAST_STARTUP_GRACE_SECONDS ?? 120);
if(!Number.isFinite(grace)||grace<0||grace>300)throw new Error('Startup grace must be 0–300 seconds');
const deadline=Date.now()+grace*1000;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const log=event=>console.log(JSON.stringify({event}));
async function ready(){
  try {const response=await fetch(new URL('/readyz',url),{signal:AbortSignal.timeout(4000)});const data=await response.json();return response.ok&&data.ready===true&&data.mode==='live';}catch{return false;}
}
const pulseEnv={XDG_RUNTIME_DIR:join(tmpdir(),'slime-pulse'),PULSE_SINK:'slime',HOME:tmpdir()};
function launch(command,args){
  const child=spawn(command,args,{env:{...env,DISPLAY:display,...(audioMode==='pulse'?pulseEnv:{})},stdio:['ignore','ignore','pipe']});children.push(child);
  child.stderr.on('data',()=>{}); // Provider URLs/stream keys can appear in encoder stderr; never forward them.
  child.on('error',()=>void shutdown('worker_child_failed',1));
  child.on('exit',()=>{if(!stopping)void shutdown('worker_child_exited',1);});return child;
}
async function shutdown(reason,code=0){
  if(stopping)return;stopping=true;clearInterval(watchdog);log(reason);
  for(const child of children)child.kill('SIGTERM');await sleep(1500);
  for(const child of children)if(child.exitCode===null)child.kill('SIGKILL');
  rmSync(profile,{recursive:true,force:true});process.exitCode=code;
}
const watchdog=setInterval(async()=>{
  if(checking||stopping)return;checking=true;
  try{
    if(await ready()){wasReady=true;return;}
    const state=await fetch(new URL('/api/state',url),{signal:AbortSignal.timeout(4000)}).then(r=>r.json());
    if(wasReady||Date.now()>deadline||state.mode!=='live'||state.game?.pauseReason==='emergency_stop')await shutdown('readiness_lost_broadcast_stopped',0);
  }catch{await shutdown('server_unreachable_broadcast_stopped',0);}finally{checking=false;}
},5000);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void shutdown('operator_shutdown'));
try{
  const state=await fetch(new URL('/api/state',url),{signal:AbortSignal.timeout(4000)}).then(r=>r.json());
  if(state.mode!=='live'||state.game?.pauseReason==='emergency_stop')throw new Error('Server must be in live mode and not emergency-stopped');
  wasReady=await ready();
  if(!wasReady&&grace===0)throw new Error('Server is not armed');
}catch{clearInterval(watchdog);throw new Error('LIVE preflight failed. Check server, mode, startup grace and emergency stop.');}
launch('Xvfb',[display,'-screen','0',`${width}x${height}x24`,'-nolisten','tcp','-ac']);
if(audioMode==='pulse'){
  // A private null sink: Chromium plays the voice and ASMR cues into it, FFmpeg records its monitor.
  mkdirSync(pulseEnv.XDG_RUNTIME_DIR,{recursive:true,mode:0o700});
  launch(env.PULSEAUDIO_BIN ?? 'pulseaudio',['--daemonize=no','--exit-idle-time=-1','--disallow-exit','-n','--load=module-native-protocol-unix','--load=module-null-sink sink_name=slime sink_properties=device.description=slime','--load=module-always-sink']);
  await sleep(1500);
}
for(let i=0;i<30&&!existsSync(`/tmp/.X11-unix/X${display.slice(1)}`)&&!stopping;i++)await sleep(100);
if(!stopping){
  // SwiftShader WebGL must be allowed explicitly in recent Chromium; autoplay lets the voice start unattended.
  const flags=['--no-first-run','--no-default-browser-check','--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-features=Translate','--hide-scrollbars','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required',`--user-data-dir=${profile}`,`--window-size=${width},${height}`,'--window-position=0,0','--kiosk',`--app=${url}`];
  if(env.CHROMIUM_NO_SANDBOX==='true')flags.push('--no-sandbox');
  launch(env.CHROMIUM_BIN ?? 'chromium',flags);await sleep(3000);
}
if(!stopping){
  // silent: a silent AAC track (the old default). pulse: the overlay's own voice and sound effects.
  const audioIn=audioMode==='pulse'?['-f','pulse','-i','slime.monitor']:['-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=44100'];
  launch(env.FFMPEG_BIN ?? 'ffmpeg',['-hide_banner','-loglevel','error','-f','x11grab','-draw_mouse','0','-framerate',String(fps),'-video_size',`${width}x${height}`,'-i',`${display}.0`,...audioIn,'-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-b:v',bitrate,'-maxrate',bitrate,'-bufsize',`${Number(bitrate.slice(0,-1))*2}k`,'-g',String(fps*2),'-c:a','aac','-b:a','96k','-ar','44100','-f','flv',target]);
  log('broadcast_worker_started');
}
