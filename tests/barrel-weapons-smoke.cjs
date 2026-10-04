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
  T.PhysicsProps.clear();for(const q of T.projectiles)T.scene.remove(q.mesh);T.projectiles.length=0;
  T.player.pos.set(0,1.7,12);T.setYaw(0);T.setPitch(-Math.atan2(1.7-.6,1.6));
  W.equip({...def});W.buildModel?.();const w=W.current();w.ammo=999;
  const barrel=T.PhysicsProps.spawn('barrel',0,10.4,0);T.scene.updateMatrixWorld(true);
  T.stepPlayer(1/60,2);T.scene.updateMatrixWorld(true);T.setTime(T.time+5);T.mouse.down=false;
  if(w.charge){P.chargeHeldSince=T.time-2;P.updateChargeShot(w,1/60);}
  else if(w.spear){P.spearHeldSince=T.time-2;P.updateSpear(w,1/60);}
  else P.shoot();
  for(let i=0;i<90;i++){T.setTime(T.time+1/60);P.update(1/60);T.updateProjectiles(1/60);T.SpecterSwarm.update(1/60);}
  rows.push({name:w.name,kind:w.kind,armed:!!barrel.fuse||!!barrel.dead});
 }
 return rows;
});
console.log(JSON.stringify(rows));assert.deepEqual(rows.filter(r=>!r.armed),[],'every weapon must arm an explosive barrel');assert.deepEqual(errors,[]);console.log('PASS all weapon damage paths against explosive barrels');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
