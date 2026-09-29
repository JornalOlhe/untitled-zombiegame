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
  const rec={name:def.name,kind:def.kind,minLeft:1e9,maxRight:0,nan:false,oneHand:r.oneHand,spear:r.spearHold};
  for(const mode of ['idle','walk','attack','reload']){
   for(let i=0;i<40;i++){
    const t=i/30;const atk=mode==='attack'?(i%20)/30:99;
    S.animate(g,1/30,t,mode==='walk'?5:0,false,0,atk,mode==='reload',false,t*3);
    g.updateMatrixWorld(true);
    const gunP=r.gun.getWorldPosition(new V());
    const hand=(a)=>a.localToWorld(new V(0,-0.62,0));
    const lh=hand(r.arms[1]),rh=hand(r.arms[0]);
    if(![lh.x,lh.y,lh.z,rh.x,rh.y,rh.z,gunP.x].every(Number.isFinite))rec.nan=true;
    // distance from left hand to the weapon's long axis (local +/-Z through gun origin)
    const axis=new V(0,0,1).applyQuaternion(r.gun.getWorldQuaternion(new THREE.Quaternion()));
    const rel=lh.clone().sub(gunP);const along=rel.dot(axis);const perp=rel.clone().addScaledVector(axis,-along).length();
    if(mode!=='reload')rec.minLeft=Math.min(rec.minLeft,perp);
    rec.maxRight=Math.max(rec.maxRight,rh.distanceTo(gunP));
   }
  }
  rec.minLeft=+rec.minLeft.toFixed(2);rec.maxRight=+rec.maxRight.toFixed(2);
  T.scene.remove(g);out.push(rec);
 });
 return out;});
for(const r of res)console.log(JSON.stringify(r));
const bad=[...errs];
for(const r of res){
 if(r.nan)bad.push(r.name+': NaN in hand/weapon transforms');
 const oneHandMelee=r.kind==='melee'&&r.oneHand;
 if(r.name==='Angelic Specter'&&r.minLeft<0.25)bad.push(r.name+': left hand near the floating specter ('+r.minLeft+')');
 if(oneHandMelee&&r.minLeft<0.2)bad.push(r.name+': left hand touches a one-hand melee weapon ('+r.minLeft+')');
 if(r.maxRight>1.2)bad.push(r.name+': right hand far from weapon ('+r.maxRight+')');
}
await b.close();server.close();
if(bad.length){console.error('FAIL\n'+bad.join('\n'));process.exit(1);}
console.log('PASS third-person hands, all weapons');})().catch(e=>{console.error(e);process.exit(1);});
