const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve('android/app/src/main/assets');
const server=http.createServer((q,r)=>{const f=path.resolve(root,'.'+(q.url.split('?')[0]==='/'?'/index.html':q.url.split('?')[0]));if(!f.startsWith(root+path.sep))return r.writeHead(403).end();fs.readFile(f,(e,d)=>{if(e)return r.writeHead(404).end();r.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html');r.end(d);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{const page=await browser.newPage({viewport:{width:320,height:180}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/?test=1`);await page.waitForFunction(()=>window.DeadRecoilTest?.WeaponModels?.ready,null,{timeout:90000});
const rows=await page.evaluate(()=>{
 const T=DeadRecoilTest,W=T.WeaponSystem,P=T.PlayerController,rows=[];
 T.setMap(4);P.start();T.pause();T.WaveManager.remaining=0;T.ZombieManager.clear();T.MapManager.walls=[];T.MapManager.obstacles=[];T.MapManager.groundAt=()=>0;T.CameraRig.distance=T.CameraRig.target=0;
 T.player.hp=T.player.maxhp=1e9;
 for(const def of W.weapons){
  for(const barrelKind of ['barrel','toxic']){
   T.PhysicsProps.clear();for(const q of T.projectiles)T.scene.remove(q.mesh);T.projectiles.length=0;
   T.player.pos.set(0,1.7,12);T.setYaw(0);T.setPitch(-Math.atan2(1.7-.6,1.6));
   W.equip({...def});W.buildModel?.();const w=W.current();w.ammo=999;
   const barrel=T.PhysicsProps.spawn(barrelKind,0,10.4,0);T.scene.updateMatrixWorld(true);
   // Move/tip it after the scene matrix pass: weapon raycasts must still refresh the prop matrix.
   barrel.pos.x=.12;barrel.target=Math.PI/2;barrel.angle=.55;T.PhysicsProps.pose(barrel);
   T.stepPlayer(1/60,2);T.setTime(T.time+5);T.mouse.down=false;
   if(w.charge){P.chargeHeldSince=T.time-2;P.updateChargeShot(w,1/60);}
   else if(w.spear){P.spearHeldSince=T.time-2;P.updateSpear(w,1/60);}
   else P.shoot();
   for(let i=0;i<90;i++){T.setTime(T.time+1/60);P.update(1/60);T.updateProjectiles(1/60);T.SpecterSwarm.update(1/60);}
   rows.push({name:w.name,kind:w.kind,barrelKind,armed:!!barrel.fuse||!!barrel.dead});
  }
 }
 return rows;
});
console.log(JSON.stringify(rows));assert.deepEqual(rows.filter(r=>!r.armed),[],'every weapon must arm red and toxic/green explosive barrels, including after prop movement');
const stress=await page.evaluate(()=>{
 const T=DeadRecoilTest,P=T.PhysicsProps;
 P.clear();T.ParticleSystem.clear();T.player.pos.set(30,1.7,30);T.MapManager.walls=[];T.MapManager.obstacles=[];T.MapManager.groundAt=()=>0;
 const n=30;
 for(let i=0;i<n;i++){const a=i/n*Math.PI*2,r=2.2+(i%3)*.65,b=P.spawn(i%2?'toxic':'barrel',Math.cos(a)*r,Math.sin(a)*r,0);P.arm(b,.01+i*.003);}
 for(let f=0;f<240;f++){T.setTime(T.time+1/60);P.update(1/60);T.ParticleSystem.update(1/60);}
 return {debris:P.debris.length,limit:P.debrisLimit(),props:P.items.length,particles:T.ParticleSystem.items.length,budget:T.ParticleSystem.budget||T.ParticleSystem.max,flashes:P.flashes.length};
});
console.log('stress',JSON.stringify(stress));assert.ok(stress.debris<=stress.limit,'explosion debris must stay bounded');assert.ok(stress.particles<=stress.budget,'particle pool must stay bounded');assert.equal(stress.props,0,'stress chain must finish without stuck explosive props');assert.ok(stress.flashes<=2,'flash lights must remain pooled');assert.deepEqual(errors,[]);console.log('PASS all weapon damage paths against red/green barrels + bounded explosion stress');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
