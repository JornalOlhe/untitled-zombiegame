// Third person: equip every weapon on an avatar, run idle/walk/attack/reload, and audit hands:
// nothing NaN, one-hand melee never touches the weapon with the left hand, spear uses both,
// guns and bows keep the right hand at the weapon socket.
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve('android/app/src/main/assets');
const server=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]==='/'?'index.html':q.url.split('?')[0]));fs.readFile(f,(e,d)=>{if(e){r.writeHead(404).end();return;}r.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':'text/html');r.end(d)})});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:640,height:360}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(`http://127.0.0.1:${server.address().port}/?test=1`);await p.waitForFunction(()=>window.DeadRecoilTest?.WeaponModels?.ready,{timeout:90000});
const res=await p.evaluate(()=>{const T=DeadRecoilTest,V=THREE.Vector3,S=T.Survivor,W=T.WeaponSystem;
 T.setMap(0);T.PlayerController.start();T.pause();
 const out=[];
 W.weapons.forEach((def,idx)=>{
  const g=S.create(0,def);T.scene.add(g);const r=g.userData.rig;
  let specterPreview=0,specterMeshes=0,specterCulled=0;
  for(const entry of r.specterPreview||[]){
    specterPreview++;
    entry.blade.traverse(o=>{if(o.isMesh){specterMeshes++;if(o.frustumCulled)specterCulled++;}});
  }
  const rec={name:def.name,kind:def.kind,minLeft:1e9,maxLeftSpear:0,maxRight:0,maxPen:0,nan:false,oneHand:r.oneHand,spear:r.spearHold,
    specterPreview,specterMeshes,specterCulled,specterMaxStep:0,idleForward:null,muzzleAhead:null};
  let previousSpecter=null;
  for(const mode of ['idle','walk','attack','reload']){
   for(let i=0;i<40;i++){
    const t=i/30;const atk=mode==='attack'?(i%20)/30:99;
    S.animate(g,1/30,t,mode==='walk'?5:0,false,0,atk,mode==='reload',false,t*3);
    g.updateMatrixWorld(true);
    if(mode==='idle'&&r.specterWeapon){
      const now=(r.specterPreview||[]).map(x=>x.blade.position.clone());
      if(previousSpecter)for(let q=0;q<now.length;q++)rec.specterMaxStep=Math.max(rec.specterMaxStep,now[q].distanceTo(previousSpecter[q]));
      previousSpecter=now;
    }
    if(mode==='attack'&&def.kind==='melee'&&!def.specter)rec.maxPen=Math.max(rec.maxPen,S.clearBody(g,r,true));
    if(mode==='idle'&&i===39){
      const q=r.gun.getWorldQuaternion(new THREE.Quaternion()), fwd=new V(0,0,-1).applyQuaternion(q);
      const gl=g.worldToLocal(r.gun.getWorldPosition(new V()).clone()), ml=g.worldToLocal((r.parts.projectileOrigin||r.parts.flash).getWorldPosition(new V()).clone());
      rec.idleForward=+fwd.z.toFixed(3);
      rec.muzzleAhead=+(ml.z-gl.z).toFixed(3);
    }
    const gunP=r.gun.getWorldPosition(new V());
    const hand=(a)=>a.localToWorld(new V(0,-0.62,0));
    const lh=hand(r.arms[1]),rh=hand(r.arms[0]);
    if(![lh.x,lh.y,lh.z,rh.x,rh.y,rh.z,gunP.x].every(Number.isFinite))rec.nan=true;
    // distance from left hand to the weapon's long axis (local +/-Z through gun origin)
    const axis=(r.spearHold?new V(0,1,0):new V(0,0,1)).applyQuaternion(r.gun.getWorldQuaternion(new THREE.Quaternion()));
    const rel=lh.clone().sub(gunP);const along=rel.dot(axis);const perp=rel.clone().addScaledVector(axis,-along).length();
    if(mode!=='reload')rec.minLeft=Math.min(rec.minLeft,perp);
    if(r.spearHold&&mode!=='reload')rec.maxLeftSpear=Math.max(rec.maxLeftSpear,perp);
    rec.maxRight=Math.max(rec.maxRight,rh.distanceTo(gunP));
   }
  }
  rec.minLeft=+rec.minLeft.toFixed(2);rec.maxRight=+rec.maxRight.toFixed(2);
  T.scene.remove(g);out.push(rec);
 });
 return out;});
for(const r of res)console.log(JSON.stringify(r));
const fallbackSpecter=await p.evaluate(()=>{
 const T=DeadRecoilTest,S=T.Survivor,W=T.WeaponSystem,src=T.WeaponModels.scenes.get('Angelic Specter');
 T.WeaponModels.scenes.delete('Angelic Specter');
 try{
  const def=W.weapons.find(x=>x.name==='Angelic Specter'),g=S.create(0,def);let n=0,visible=0;
  g.traverse(o=>{if(o.name&&/^LoadoutSpecter_0/.test(o.name)){n++;if(o.visible)visible++;}});
  S.dispose(g);
  return {n,visible};
 }finally{if(src)T.WeaponModels.scenes.set('Angelic Specter',src);}
});
console.log('specter fallback',JSON.stringify(fallbackSpecter));
const bad=[...errs];
if(fallbackSpecter.n!==5||fallbackSpecter.visible!==5)bad.push('Angelic Specter procedural fallback must show five visible blades');
for(const r of res){
 if(r.nan)bad.push(r.name+': NaN in hand/weapon transforms');
 const oneHandMelee=r.kind==='melee'&&r.oneHand;
 if(r.name==='Angelic Specter'&&r.specterPreview!==5)bad.push(r.name+': loadout must show five blades ('+r.specterPreview+')');
 if(r.name==='Angelic Specter'&&(r.specterMeshes<5||r.specterCulled!==0))bad.push(r.name+': all blade meshes must stay renderable ('+r.specterMeshes+' meshes, '+r.specterCulled+' culled)');
 if(r.name==='Angelic Specter'&&r.specterMaxStep>0.0015)bad.push(r.name+': loadout blade idle motion is jittery ('+r.specterMaxStep.toFixed(4)+'/frame)');
 if(r.name==='Angelic Specter'&&r.minLeft<0.25)bad.push(r.name+': left hand near the floating specter ('+r.minLeft+')');
 if((r.name==='Bow'||r.name==='Stormpiercer'||r.name==='Wraithpiercer'||r.name==='Demonic Fury')&&r.idleForward<0.35)bad.push(r.name+': model is not facing forward ('+r.idleForward+')');
 if(r.kind!=='melee'&&r.muzzleAhead<0.15)bad.push(r.name+': projectile origin is not ahead of the held weapon ('+r.muzzleAhead+')');
 if(oneHandMelee&&r.minLeft<0.2)bad.push(r.name+': left hand touches a one-hand melee weapon ('+r.minLeft+')');
 if(r.spear&&r.maxLeftSpear>0.14)bad.push(r.name+': left hand leaves the spear shaft during idle/walk/attack ('+r.maxLeftSpear.toFixed(2)+')');
 if(r.maxPen>0.035)bad.push(r.name+': weapon passes through the torso during strikes ('+r.maxPen.toFixed(3)+')');
 if(r.maxRight>1.2)bad.push(r.name+': right hand far from weapon ('+r.maxRight+')');
}
await b.close();server.close();
if(bad.length){console.error('FAIL\n'+bad.join('\n'));process.exit(1);}
console.log('PASS third-person hands, all weapons');})().catch(e=>{console.error(e);process.exit(1);});
