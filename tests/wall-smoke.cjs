// Wall occlusion: with a solid wall between player and zombie, no weapon (bullets, projectiles,
// flame/ice streams, explosions, melee, arrows) may deal damage; without the wall they do.
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve('android/app/src/main/assets');
const server=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]==='/'?'index.html':q.url.split('?')[0]));fs.readFile(f,(e,d)=>{if(e){r.writeHead(404).end();return;}r.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':'text/html');r.end(d)})});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:640,height:360}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(`http://127.0.0.1:${server.address().port}/?test=1`);await p.waitForFunction(()=>window.DeadRecoilTest?.WeaponModels?.ready,{timeout:90000});
const res=await p.evaluate(()=>{const T=DeadRecoilTest,W=T.WeaponSystem,P=T.PlayerController,V=THREE.Vector3;
 T.setMap(4);P.start();T.pause();T.WaveManager.remaining=0;T.ZombieManager.clear();
 const pl=T.player;pl.hp=pl.maxhp=1e9;
 const out=[];const shots=[];
 const wall=new THREE.Mesh(new THREE.BoxGeometry(60,8,0.6),new THREE.MeshBasicMaterial());wall.position.set(0,4,10);T.scene.add(wall);wall.updateMatrixWorld(true);const walls=T.MapManager.walls;
 W.weapons.forEach((def,idx)=>{
  T.ZombieManager.clear();for(const q of [...T.projectiles]){T.scene.remove(q.mesh);} T.projectiles.length=0;
  pl.pos.set(0,1.7,12);T.setYaw(0);T.setPitch(0);
  const w={...def};W.equip(w);W.buildModel?.();const cw=W.current();cw.ammo=999;
  const z=T.ZombieManager.spawn(0,null,new V(0,0,7));z.hp=z.maxhp=1e6;z.speed=0;z.group.position.set(0,0,7);T.scene.updateMatrixWorld(true);
  T.stepPlayer(1/30,3);T.setTime(T.time+5);
  const run=(withWall)=>{
  if(withWall){if(!walls.includes(wall))walls.push(wall);}else{const i=walls.indexOf(wall);if(i>=0)walls.splice(i,1);}
  z.hp=z.maxhp=1e6;for(const q of [...T.projectiles]){T.scene.remove(q.mesh);}T.projectiles.length=0;T.setTime(T.time+5);
  const before=T.projectiles.length;const hp0=z.hp;
  let how='shoot';
  if(cw.charge){how='charge';P.chargeHeldSince=T.time-2;T.mouse.down=false;P.updateChargeShot(cw,1/30);}
  else if(cw.spear){how='spear';P.spearHeldSince=T.time-2;T.mouse.down=false;P.updateSpear(cw,1/30);}
  else P.shoot();
  const fresh=T.projectiles.slice(before);
  const r={name:cw.name,kind:cw.kind,how,proj:fresh.map(q=>q.kind)};
  // alignment of model nose (+Z) with velocity
  const align=()=>fresh.filter(q=>q.mesh&&q.vel&&q.vel.length()>0.1&&['arrow','missile','spear'].includes(q.kind)).map(q=>{const f=new V(0,0,1).applyQuaternion(q.mesh.getWorldQuaternion(new THREE.Quaternion()));return +f.dot(q.vel.clone().normalize()).toFixed(2);});
  r.align0=align();
  r.meshes=fresh.map(q=>{let n=0;q.mesh?.traverse(o=>{if(o.isMesh)n++;});return n;});
  for(let i=0;i<4;i++)T.updateProjectiles(1/30);
  r.align4=align();
  for(let i=0;i<150;i++){T.updateProjectiles(1/30);T.setTime(T.time+1/30);}
  r.nan=T.projectiles.some(q=>!isFinite(q.pos?.x));
  r.dmg=Math.round(hp0-z.hp);
  for(let i=0;i<300;i++){T.updateProjectiles(1/30);T.setTime(T.time+1/30);}
  r.left=T.projectiles.filter(q=>fresh.includes(q)).length;
  return r;};
  const r=run(true);r.open=run(false).dmg;
  out.push(r);
 });
 return {out};});
for(const r of res.out)console.log(JSON.stringify(r));
let bad=[...errs];
for(const r of res.out){
 if(r.nan)bad.push(r.name+': NaN position');
 if(r.left)bad.push(r.name+': projectile never cleaned up');
 for(const a of [...r.align0,...r.align4]) if(a<0.95) bad.push(r.name+': model not pointing along flight ('+a+')');
 if(r.dmg>0) bad.push(r.name+': dealt '+r.dmg+' damage THROUGH the wall');
 if(r.open<=0 && r.proj.length) bad.push(r.name+': control shot without wall did no damage');
 if(['arrow','missile','spear','quantum'].some(k=>r.proj.includes(k))&&r.meshes.some(n=>!n)) bad.push(r.name+': projectile has no model');
}
await b.close();server.close();
if(bad.length){console.error('FAIL\n'+bad.join('\n'));process.exit(1);}
console.log('PASS wall occlusion for every weapon');})().catch(e=>{console.error(e);process.exit(1);});
