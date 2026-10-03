// Replayability regression: mutations must matter, map compositions must differ, retired
// enemies must stay retired, difficulty copy must match the deterministic coin economy,
// and active mutations must remain visible in the wave HUD.
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve('android/app/src/main/assets');
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const server=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]==='/'?'index.html':q.url.split('?')[0]));fs.readFile(f,(e,d)=>{if(e){r.writeHead(404).end();return;}r.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html');r.end(d)})});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:960,height:540}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(`http://127.0.0.1:${server.address().port}/?test=1`);await p.waitForFunction(()=>window.DeadRecoilTest?.WeaponModels?.ready,{timeout:90000});
const res=await p.evaluate(()=>{
 const T=DeadRecoilTest;
 const oldRandom=Math.random;
 T.MutationManager.reset();
 Math.random=()=>0;
 const first=T.MutationManager.roll(4);
 const firstId=first?.id||null;
 T.MutationManager.restoreEnvironment();
 T.MutationManager.current=null;
 const tooSoon=T.MutationManager.roll(6);
 const afterCooldown=T.MutationManager.roll(8);
 const afterId=afterCooldown?.id||null;
 T.MutationManager.reset();
 Math.random=oldRandom;

 T.WaveManager.wave=12;
 const byMap=[];
 for(let m=0;m<5;m++){
   T.setMap(m);
   byMap.push({
     map:m,
     normal:T.WaveManager.spawnWeight(0,12),
     skeleton:T.WaveManager.spawnWeight(1,12),
     constructor:T.WaveManager.spawnWeight(2,12),
     swat:T.WaveManager.spawnWeight(3,12),
     crawler:T.WaveManager.spawnWeight(5,12),
     cyborg:T.WaveManager.spawnWeight(8,12),
   });
 }
 const retired=[4,6,7,9,10,11].map(type=>T.WaveManager.spawnWeight(type,50));
 const labels=[...document.querySelectorAll('#difficulty-options small')].map(n=>n.textContent);
 // Quality changes simultaneous pressure only; total wave size is untouched.
 const oldGraphics=T.SettingsManager.data.graphics;
 T.SettingsManager.data.graphics='low'; const lowCap=T.WaveManager.activeCap();
 T.SettingsManager.data.graphics='medium'; const mediumCap=T.WaveManager.activeCap();
 T.SettingsManager.data.graphics='high'; const highCap=T.WaveManager.activeCap();
 T.SettingsManager.data.graphics='ultra'; const ultraCap=T.WaveManager.activeCap();
 T.SettingsManager.data.graphics=oldGraphics;
 // Failed ordinary spawns must retry instead of consuming the wave counter.
 const originalSpawn=T.ZombieManager.spawn;
 T.ZombieManager.clear();
 T.WaveManager.wave=3; T.WaveManager.remaining=1; T.WaveManager.total=1;
 T.WaveManager.spawnPool=[0]; T.WaveManager.spawnClock=0; T.WaveManager.bossPending=false;
 let spawnCalls=0;
 T.ZombieManager.spawn=()=>++spawnCalls===1?null:{qa:true};
 T.WaveManager.update(1/60); const remainingAfterFailedSpawn=T.WaveManager.remaining;
 T.WaveManager.spawnClock=0; T.WaveManager.update(1/60); const remainingAfterSuccessfulSpawn=T.WaveManager.remaining;
 T.ZombieManager.spawn=originalSpawn;
 // A scheduled boss must remain pending when creation fails.
 const originalBoss=T.WaveManager.boss;
 T.WaveManager.wave=5; T.WaveManager.remaining=0; T.WaveManager.total=10;
 T.WaveManager.bossPending=true; T.WaveManager.spawnClock=0; T.WaveManager.clearedAt=0;
 T.WaveManager.boss=()=>null;
 T.WaveManager.update(1/60); const bossPendingAfterFailure=T.WaveManager.bossPending;
 T.WaveManager.boss=originalBoss;
 T.WaveManager.bossPending=false;
 return {firstId,tooSoon:!!tooSoon,afterId,byMap,retired,labels,lowCap,mediumCap,highCap,ultraCap,
   remainingAfterFailedSpawn,remainingAfterSuccessfulSpawn,bossPendingAfterFailure};
});
const bad=[...errs];
if(!res.firstId)bad.push('mutation should be eligible on wave 4 with a successful roll');
if(res.tooSoon)bad.push('mutation cooldown allowed a back-to-back event');
if(!res.afterId)bad.push('mutation should be eligible again after four waves');
if(!(res.byMap[0].swat>res.byMap[2].swat))bad.push('City should bias SWAT above Forest');
if(!(res.byMap[3].cyborg>res.byMap[0].cyborg))bad.push('Lab should bias Cyborg above City');
if(res.retired.some(Boolean))bad.push('retired enemy entered an ordinary wave');
if(res.labels.some(x=>/moedas\s*[×x]/i.test(x)))bad.push('difficulty UI still advertises a coin multiplier');
if(!(res.lowCap<res.mediumCap&&res.mediumCap<res.highCap&&res.highCap<res.ultraCap))bad.push('desktop horde cap must scale with graphics quality');
if(res.highCap!==85)bad.push('high-quality desktop horde cap must remain 85');
if(res.remainingAfterFailedSpawn!==1||res.remainingAfterSuccessfulSpawn!==0)bad.push('failed spawn consumed a wave enemy instead of retrying');
if(!res.bossPendingAfterFailure)bad.push('failed boss spawn cleared bossPending');
if(!source.includes('class="mutation"')||!source.includes('const mutation = MutationManager.current;'))bad.push('active mutation is not persisted in the wave HUD');
console.log(JSON.stringify(res));
await b.close();server.close();
if(bad.length){console.error('FAIL\n'+bad.join('\n'));process.exit(1);}
console.log('PASS replayability, map composition, mutation HUD and difficulty-copy regression');})().catch(e=>{console.error(e);process.exit(1);});
