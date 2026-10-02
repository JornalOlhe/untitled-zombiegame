// Regression: elevated props must not create floor-to-roof invisible walls; the local
// economy must use the exact deterministic kill/boss/wave rewards.
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
   const mk=(type,head=false)=>{const z=Z.spawn(type,null,new V(4,0,4));z.hp=z.maxhp=1;z.speed=0;Z.kill(z,head,false,w);return T.Progression.data.coins;};
   const afterZombie=mk(0),afterCrawler=mk(5,true),afterSwat=mk(3),afterDynamite=mk(2),afterRobot=mk(8);
   Z.clear();
   T.WaveManager.wave=1;T.WaveManager.remaining=0;T.WaveManager.bossPending=false;T.WaveManager.clearedAt=0;
   T.WaveManager.update(0);
   const afterWave=T.Progression.data.coins;
   return {elevatedGround,elevatedOverlap,groundBlocks,lowStepBlocks,afterZombie,afterCrawler,afterSwat,afterDynamite,afterRobot,afterWave,
     expected:{
       zombie:T.EconomyRewards.enemy(0),crawler:T.EconomyRewards.enemy(5),swat:T.EconomyRewards.enemy(3),
       dynamite:T.EconomyRewards.enemy(2),robot:T.EconomyRewards.enemy(8),wave:T.EconomyRewards.wave(1),
       bossSpawn:T.EconomyRewards.bossSpawn(),miniboss:T.EconomyRewards.bossKill({rank:1,major:false}),boss:T.EconomyRewards.bossKill({rank:3,major:true})
     }};
 });
 console.log(JSON.stringify(r));
 assert.equal(r.elevatedGround,false,'elevated rooftop collider must be passable underneath');
 assert.equal(r.elevatedOverlap,true,'elevated collider blocks only when player body overlaps its height');
 assert.equal(r.groundBlocks,true,'real ground-level object still blocks');
 assert.equal(r.lowStepBlocks,false,'small step is not an invisible wall');
 assert.equal(r.expected.zombie,10,'normal zombie pays 10');
 assert.equal(r.expected.crawler,10,'crawler pays 10');
 assert.equal(r.expected.swat,50,'SWAT pays 50');
 assert.equal(r.expected.dynamite,50,'dynamite/constructor pays 50');
 assert.equal(r.expected.robot,50,'robot/cyborg pays 50');
 assert.equal(r.expected.bossSpawn,10,'boss/miniboss appearance pays 10');
 assert.equal(r.expected.miniboss,500,'miniboss kill pays 500');
 assert.equal(r.expected.boss,1000,'boss kill pays 1000');
 assert.equal(r.expected.wave,50,'wave clear pays 50');
 assert.equal(r.afterZombie,10,'normal zombie reward is credited');
 assert.equal(r.afterCrawler,20,'crawler reward is credited and headshots do not change coin value');
 assert.equal(r.afterSwat,70,'SWAT reward is credited');
 assert.equal(r.afterDynamite,120,'dynamite/constructor reward is credited');
 assert.equal(r.afterRobot,170,'robot/cyborg reward is credited');
 assert.equal(r.afterWave,220,'wave clear pays exactly 50 once');
 assert.deepEqual(errs,[]);
 console.log('PASS collision volumes + deterministic economy rewards');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exit(1);});
