// Heavy bosses: a footstep sound + dust fire exactly when a foot plants (twice per stride), scaled by
// distance to the player; silent when far away.
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve('android/app/src/main/assets');
const server=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]==='/'?'index.html':q.url.split('?')[0]));fs.readFile(f,(e,d)=>{if(e){r.writeHead(404).end();return;}r.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':'text/html');r.end(d)})});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:640,height:360}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(`http://127.0.0.1:${server.address().port}/?test=1`);await p.waitForFunction(()=>window.DeadRecoilTest?.WeaponModels?.ready,{timeout:90000});
await p.evaluate(()=>{const T=DeadRecoilTest;T.setMap(4);T.PlayerController.start();T.pause();});await p.waitForTimeout(2500);
await p.evaluate(()=>{const T=DeadRecoilTest;for(const k of ['yeti','demon','prototype_x','juggernaut','quarterback'])T.ZombieManager.spawn(6,{...T.WaveManager.bossRoster[k],intro:false},new THREE.Vector3(0,0,-40));});await p.waitForTimeout(3000);
const res=await p.evaluate(()=>{const T=DeadRecoilTest,V=THREE.Vector3,ZM=T.ZombieManager,out={};
 let lands=0,tones=0;const oP=T.MonsterAudio.play.bind(T.MonsterAudio);T.MonsterAudio.play=(n,o)=>{if(n==='land')lands++;return oP(n,o);};
 const oT=T.AudioManager.tone.bind(T.AudioManager);T.AudioManager.tone=(...a)=>{tones++;return oT(...a);};
 for(const k of ['yeti','demon','prototype_x','juggernaut','quarterback']){
  for(const [label,dist] of [['near',12],['far',80]]){
   ZM.clear();T.player.hp=T.player.maxhp=1e9;T.player.pos.set(0,1.7,dist);T.setYaw(0);
   const z=ZM.spawn(6,{...T.WaveManager.bossRoster[k],intro:false},new V(0,0,0));z.hp=z.maxhp=1e9;z.speed=T.WaveManager.bossRoster[k].speed||1.4;
   let now=T.time+5;T.setTime(now);for(let i=0;i<60;i++){ZM.update(1/60);now+=1/60;T.setTime(now);}
   lands=0;tones=0;const y0=z.group.position.z;const n0=z._stepN||0;
   for(let i=0;i<240;i++){ZM.update(1/60);now+=1/60;T.setTime(now);}
   out[k+'_'+label]={lands,tones,moved:+(z.group.position.z-y0).toFixed(1),steps:(z._stepN||0)-n0};
  }
 }
 return out;});
for(const [k,v] of Object.entries(res))console.log(k,JSON.stringify(v));
const bad=[...errs];
for(const k of ['yeti','demon','prototype_x','juggernaut']){
 const n=res[k+'_near'],f=res[k+'_far'];
 if(n.steps<3)bad.push(k+': fewer than 3 footsteps in 4 s of walking ('+n.steps+')');
 if(n.tones<n.steps-1)bad.push(k+': footstep sound missing on some steps');
 if(f.tones>0||f.lands>0)bad.push(k+': footsteps audible from 80 m away');
}
await b.close();server.close();
if(bad.length){console.error('FAIL\n'+bad.join('\n'));process.exit(1);}
console.log('PASS boss footsteps');})().catch(e=>{console.error(e);process.exit(1);});
