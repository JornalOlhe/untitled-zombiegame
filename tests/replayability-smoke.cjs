// Replayability regression: mutations must matter, map compositions must differ, retired
// enemies must stay retired, and difficulty copy must match the deterministic coin economy.
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve('android/app/src/main/assets');
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
 return {firstId,tooSoon:!!tooSoon,afterId,byMap,retired,labels,desktopCap:T.WaveManager.activeCap()};
});
const bad=[...errs];
if(!res.firstId)bad.push('mutation should be eligible on wave 4 with a successful roll');
if(res.tooSoon)bad.push('mutation cooldown allowed a back-to-back event');
if(!res.afterId)bad.push('mutation should be eligible again after four waves');
if(!(res.byMap[0].swat>res.byMap[2].swat))bad.push('City should bias SWAT above Forest');
if(!(res.byMap[3].cyborg>res.byMap[0].cyborg))bad.push('Lab should bias Cyborg above City');
if(res.retired.some(Boolean))bad.push('retired enemy entered an ordinary wave');
if(res.labels.some(x=>/moedas\s*[×x]/i.test(x)))bad.push('difficulty UI still advertises a coin multiplier');
if(res.desktopCap!==85)bad.push('desktop active horde cap changed unexpectedly');
console.log(JSON.stringify(res));
await b.close();server.close();
if(bad.length){console.error('FAIL\n'+bad.join('\n'));process.exit(1);}
console.log('PASS replayability, map composition and difficulty-copy regression');})().catch(e=>{console.error(e);process.exit(1);});
