// Every zombie type and every boss must spawn as a voxel-template monster (never the retired
// procedural body), with visible meshes and a finite pose after animating.
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve('android/app/src/main/assets');
const server=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]==='/'?'index.html':q.url.split('?')[0]));fs.readFile(f,(e,d)=>{if(e){r.writeHead(404).end();return;}r.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':'text/html');r.end(d)})});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:640,height:360}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&/Dead Recoil/.test(m.text()))errs.push(m.text());});
await p.goto(`http://127.0.0.1:${server.address().port}/?test=1`);await p.waitForFunction(()=>window.DeadRecoilTest?.WeaponModels?.ready,{timeout:90000});
const res=await p.evaluate(()=>{const T=DeadRecoilTest,V=THREE.Vector3;const out=[];
 for(let m=0;m<5;m++){T.setMap(m);T.PlayerController.start();T.pause();T.ZombieManager.clear();
  const jobs=[];for(let t=0;t<12;t++)jobs.push(['type'+t,t,null]);
  for(const k of T.WaveManager.mapRosters[m])jobs.push([k,6,{...T.WaveManager.bossRoster[k],intro:false}]);
  for(const [name,type,boss] of jobs){
   const z=T.ZombieManager.spawn(type,boss,new V(0,0,-20));
   let meshes=0;z.group.traverse(o=>{if(o.isMesh)meshes++;});
   for(let i=0;i<20;i++)T.ZombieManager.update?.(1/30);
   const bad=[];z.group.traverse(o=>{if(!Number.isFinite(o.rotation.x+o.rotation.y+o.rotation.z+o.position.x+o.position.y+o.position.z))bad.push(o.name);});
   out.push({map:m,name,voxel:!!z.rig?.voxel,meshes,bad:bad.length});
   T.ZombieManager.clear();}
 }
 return out;});
console.log(res.length,'spawns');
const bad=[...errs];
for(const r of res){if(!r.voxel)bad.push(`map${r.map} ${r.name}: not a voxel template`);if(!r.meshes)bad.push(`map${r.map} ${r.name}: no meshes`);if(r.bad)bad.push(`map${r.map} ${r.name}: NaN transforms`);}
await b.close();server.close();
if(bad.length){console.error('FAIL\n'+bad.slice(0,20).join('\n'));process.exit(1);}
console.log('PASS every zombie/boss spawns as voxel template on all maps');})().catch(e=>{console.error(e);process.exit(1);});
