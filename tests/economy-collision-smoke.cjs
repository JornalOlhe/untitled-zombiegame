// Regression: elevated props must not create floor-to-roof invisible walls; the local
// economy must use the exact deterministic kill/boss/wave rewards.
const { chromium }=require('playwright');
const assert=require('node:assert/strict');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve('android/app/src/main/assets');
const economySql=fs.readFileSync(path.resolve('supabase/migrations/20261003031500_v39_match_coin_reassert.sql'),'utf8');
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

   // Exercise the real spawn + kill reward paths, not only the constants.
   const miniData={id:'qa_mini',kind:'qa_mini',name:'QA Mini',title:'MINI',rank:1,major:false,hp:1,size:1,speed:0,coins:500,abilities:[]};
   T.WaveManager.rewardBossSpawn(miniData);
   const afterMiniSpawn=T.Progression.data.coins;
   const mini=Z.spawn(6,miniData,new V(6,0,6));mini.hp=mini.maxhp=1;mini.speed=0;Z.kill(mini,false,false,w);
   T.BossDeath.finish();
   const afterMiniKill=T.Progression.data.coins;
   const bossData={id:'qa_boss',kind:'qa_boss',name:'QA Boss',title:'BOSS',rank:3,major:true,hp:1,size:1,speed:0,coins:1000,abilities:[]};
   T.WaveManager.rewardBossSpawn(bossData);
   const afterBossSpawn=T.Progression.data.coins;
   const boss=Z.spawn(6,bossData,new V(7,0,7));boss.hp=boss.maxhp=1;boss.speed=0;Z.kill(boss,false,false,w);
   T.BossDeath.finish();
   const afterBossKill=T.Progression.data.coins;
   Z.clear();
   T.WaveManager.wave=1;T.WaveManager.remaining=0;T.WaveManager.bossPending=false;T.WaveManager.clearedAt=0;
   T.WaveManager.update(0);
   const afterWave=T.Progression.data.coins;
   return {elevatedGround,elevatedOverlap,groundBlocks,lowStepBlocks,afterZombie,afterCrawler,afterSwat,afterDynamite,afterRobot,
     afterMiniSpawn,afterMiniKill,afterBossSpawn,afterBossKill,afterWave,
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
 assert.equal(r.afterMiniSpawn,180,'miniboss spawn credits 10');
 assert.equal(r.afterMiniKill,680,'miniboss kill credits 500');
 assert.equal(r.afterBossSpawn,690,'boss spawn credits 10');
 assert.equal(r.afterBossKill,1690,'boss kill credits 1000');
 assert.equal(r.afterWave,1740,'wave clear pays exactly 50 once');
 assert.match(economySql,/when 'constructor' then 50[\s\S]*when 'swat' then 50[\s\S]*when 'cyborg' then 50/,'backend high-value enemy rewards must stay 50');
 assert.match(economySql,/greatest\(0, dspawn\) \* 10[\s\S]*greatest\(0, dc\) \* 50/,'backend must persist boss-spawn + wave rewards');
 assert.match(economySql,/set coins = case when major then 1000 else 500 end/,'backend boss catalog must persist 1000/500');
 assert.deepEqual(errs,[]);
 console.log('PASS collision volumes + deterministic economy rewards');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exit(1);});
