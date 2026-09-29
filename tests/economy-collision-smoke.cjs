// Regression: elevated props must not create floor-to-roof invisible walls; every local zombie
// kill pays and a cleared wave gives a small deterministic bonus.
const { chromium }=require('playwright');
const assert=require('node:assert/strict');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve('android/app/src/main/assets');
const server=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]==='/'?'index.html':q.url.split('?')[0]));fs.readFile(f,(e,d)=>{if(e){r.writeHead(404).end();return;}r.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':'text/html');r.end(d);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const p=await b.newPage({viewport:{width:640,height:360}}),errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(`http://127.0.0.1:${server.address().port}/?test=1`);await p.waitForFunction(()=>window.DeadRecoilTest?.WeaponModels?.ready,{timeout:90000});
 const r=await p.evaluate(()=>{
   const T=DeadRecoilTest,M=T.MapManager,Z=T.ZombieManager,V=THREE.Vector3;
   T.setMap(0);T.setDifficulty('easy');T.PlayerController.start();T.pause();Z.clear();
   const p=T.player;p.hp=p.maxhp=1e9;
   const saved=M.obstacles;
   M.obstacles=[{x:0,z:0,w:1,d:1,top:5,base:4}];M.reindex();
   const elevatedGround=M.collides(0,0,.35,0);
   const elevatedOverlap=M.collides(0,0,.35,3.2);
   M.obstacles=[{x:0,z:0,w:1,d:1,top:2,base:0}];M.reindex();
   const groundBlocks=M.collides(0,0,.35,0);
   M.obstacles=[{x:0,z:0,w:1,d:1,top:.35,base:0}];M.reindex();
   const lowStepBlocks=M.collides(0,0,.35,0);
   M.obstacles=saved;M.reindex();

   T.Progression.data.coins=0;p.coins=0;
   const w=T.WeaponSystem.current();
   const mk=(head)=>{const z=Z.spawn(0,null,new V(4,0,4));z.hp=z.maxhp=1;z.speed=0;Z.kill(z,head,false,w);return T.Progression.data.coins;};
   const afterBody=mk(false),afterHead=mk(true);
   Z.clear();
   T.WaveManager.wave=1;T.WaveManager.remaining=0;T.WaveManager.bossPending=false;T.WaveManager.clearedAt=0;
   T.WaveManager.update(0);
   const afterWave=T.Progression.data.coins;
   return {elevatedGround,elevatedOverlap,groundBlocks,lowStepBlocks,afterBody,afterHead,afterWave,
     expected:{body:T.EconomyRewards.kill(false,1),head:T.EconomyRewards.kill(true,1),wave:T.EconomyRewards.wave(1,1)}};
 });
 console.log(JSON.stringify(r));
 assert.equal(r.elevatedGround,false,'elevated rooftop collider must be passable underneath');
 assert.equal(r.elevatedOverlap,true,'elevated collider blocks only when player body overlaps its height');
 assert.equal(r.groundBlocks,true,'real ground-level object still blocks');
 assert.equal(r.lowStepBlocks,false,'small step is not an invisible wall');
 assert.equal(r.afterBody,r.expected.body,'body kill always pays');
 assert.equal(r.afterHead,r.expected.body+r.expected.head,'headshot kill always pays');
 assert.equal(r.afterWave,r.expected.body+r.expected.head+r.expected.wave,'wave clear pays exactly once');
 assert.deepEqual(errs,[]);
 console.log('PASS collision volumes + guaranteed low coin rewards');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exit(1);});
