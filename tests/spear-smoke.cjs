// Dawn Spear throw: real input flow (hold -> release), state machine Held -> Prep -> Throw ->
// Release -> InFlight -> Return. Exactly one spear at any time (the avatar's spear disappears on
// the frame the projectile spawns), it follows the crosshair, hits near / far / moving targets,
// and stops at walls.
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve('android/app/src/main/assets');
const server=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]==='/'?'index.html':q.url.split('?')[0]));fs.readFile(f,(e,d)=>{if(e){r.writeHead(404).end();return;}r.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':'text/html');r.end(d)})});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:640,height:360}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(`http://127.0.0.1:${server.address().port}/?test=1`);await p.waitForFunction(()=>window.DeadRecoilTest?.WeaponModels?.ready,{timeout:90000});
const res=await p.evaluate(()=>{const T=DeadRecoilTest,W=T.WeaponSystem,P=T.PlayerController,S=T.Survivor,V=THREE.Vector3;
 T.setMap(4);P.start();T.pause();T.WaveManager.remaining=0;T.ZombieManager.clear();
 const pl=T.player;pl.hp=pl.maxhp=1e9;
 const def=W.weapons.find(x=>x.name==='Dawn Spear');
 const wall=new THREE.Mesh(new THREE.BoxGeometry(60,8,0.6),new THREE.MeshBasicMaterial());wall.position.set(0,4,-2);T.scene.add(wall);wall.updateMatrixWorld(true);const walls=T.MapManager.walls;
 const out={};
 const scenario=(name,zz,{useWall=false,move=0}={})=>{
  T.ZombieManager.clear();for(const q of [...T.projectiles])T.scene.remove(q.mesh);T.projectiles.length=0;
  const i=walls.indexOf(wall);if(i>=0)walls.splice(i,1);if(useWall)walls.push(wall);
  pl.pos.set(0,1.7,12);T.setYaw(0);T.setPitch(0);
  W.equip({...def});const cw=W.current();
  const av=S.create(0,cw);T.scene.add(av);
  const z=T.ZombieManager.spawn(0,null,new V(0,0,zz));z.hp=z.maxhp=1e6;z.speed=0;z.group.position.set(0,0,zz);T.scene.updateMatrixWorld(true);
  T.setTime(T.time+5);const t0=T.time;
  const r={phases:[],maxSpears:0,dupFrames:0,fpDupFrames:0,lockedInputFrames:0,spawnFrame:null,hiddenFrame:null,hp0:z.hp,shots0:pl.shots};
  T.mouse.down=true;let zdir=1;
  for(let f=0;f<420;f++){
   const t=T.time-t0;
   if(t>0.5)T.mouse.down=false;
   // Deliberately spam attack while the spear is physically away. This must NOT queue a thrust,
   // charge, replacement spear or additional shot.
   if(T.projectiles.some(q=>q.kind==='spear') && t>0.75 && t<1.45) T.mouse.down=(f%8)<4;
   if(move){z.group.position.z+=move/60;if(z.group.position.z>8)z.group.position.z=-14;}
   P.update(1/60);T.updateProjectiles(1/60);
   const st=P.spearThrowState();if(st&&(!r.phases.length||r.phases[r.phases.length-1]!==st.phase))r.phases.push(st.phase);
   S.animate(av,1/60,T.time,0,false,0,99,false,false,0,0);
   const spears=T.projectiles.filter(q=>q.kind==='spear').length;r.maxSpears=Math.max(r.maxSpears,spears);
   const held=av.userData.rig.gun.visible;
   if(spears&&r.spawnFrame==null)r.spawnFrame=f;
   if(spears&&held)r.dupFrames++;  // third-person spear in hand AND one in the air
   if(spears&&W.model.visible)r.fpDupFrames++; // first-person viewmodel must also be gone
   if(spears&&(P.spearHeldSince!=null||P.spearThrowPending||P.meleeStrike))r.lockedInputFrames++;
   if(!spears&&!held&&!P.spearThrowState())r.dupFrames+=0;
   T.setTime(T.time+1/60);
  }
  // As soon as the same spear has returned, a fresh short click must work immediately.
  T.mouse.down=false;
  const beforeReturnAttack=pl.shots;
  T.mouse.down=true;P.update(1/60);T.setTime(T.time+0.06);T.mouse.down=false;P.update(1/60);
  r.canAttackAfterReturn=pl.shots>beforeReturnAttack;
  r.fpVisibleAfterReturn=W.model.visible;
  r.tpVisibleAfterReturn=av.userData.rig.gun.visible;
  r.extraShotsWhileOut=Math.max(0,beforeReturnAttack-r.shots0-1);
  r.dmg=Math.round(r.hp0-z.hp);r.left=T.projectiles.filter(q=>q.kind==='spear').length;r.back=!!T.projectiles.length;
  T.scene.remove(av);out[name]=r;};
 scenario('near',6);scenario('far',-9);scenario('moving',-14,{move:2.5});scenario('wall',-7,{useWall:true});
 return out;});
for(const [k,r] of Object.entries(res))console.log(k,JSON.stringify(r));
const bad=[...errs];
for(const [k,r] of Object.entries(res)){
 if(r.phases.join('>')!=='prep>throw>flight')bad.push(k+': state machine '+r.phases.join('>')+' (expected prep>throw>flight)');
 if(r.maxSpears>1)bad.push(k+': '+r.maxSpears+' spears at once');
 if(r.dupFrames)bad.push(k+': third-person spear visible in hand while another flies ('+r.dupFrames+' frames)');
 if(r.fpDupFrames)bad.push(k+': first-person spear visible in hand while another flies ('+r.fpDupFrames+' frames)');
 if(r.lockedInputFrames)bad.push(k+': attack state queued while spear was out ('+r.lockedInputFrames+' frames)');
 if(r.extraShotsWhileOut)bad.push(k+': '+r.extraShotsWhileOut+' extra attacks registered while spear was out');
 if(!r.canAttackAfterReturn)bad.push(k+': cannot attack immediately after the spear returns');
 if(!r.fpVisibleAfterReturn)bad.push(k+': first-person spear did not reappear after catch');
 if(!r.tpVisibleAfterReturn)bad.push(k+': third-person spear did not reappear after catch');
 if(r.left)bad.push(k+': spear never returned/cleaned');
 if(k==='wall'){if(r.dmg>0)bad.push('wall: hit zombie through wall');}
 else if(r.dmg<=0)bad.push(k+': spear never hit the zombie');
}
await b.close();server.close();
if(bad.length){console.error('FAIL\n'+bad.join('\n'));process.exit(1);}
console.log('PASS spear throw');})().catch(e=>{console.error(e);process.exit(1);});
