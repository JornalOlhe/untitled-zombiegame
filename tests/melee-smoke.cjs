// Melee: damage lands on the animation's hit frame (not at click time), only in front of the
// player, never through walls; swing sound fires before the hit.
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
 const swings=[];const old=T.AudioManager.meleeSwing;T.AudioManager.meleeSwing=function(){swings.push(T.time);return old.apply(this,arguments);};
 const out=[];
 for(const name of ['Machete','Bloodfang','Frostbite','Demonic Fury','Dawn Spear']){
  const def=W.weapons.find(x=>x.name===name);
  T.ZombieManager.clear();pl.pos.set(0,1.7,12);T.setYaw(0);T.setPitch(0);
  const w={...def};W.equip(w);const cw=W.current();
  const mk=(z0)=>{const z=T.ZombieManager.spawn(0,null,new V(0,0,z0));z.hp=z.maxhp=1e6;z.speed=0;z.group.position.set(0,0,z0);return z;};
  const front=mk(10.4),back=mk(13.6);T.scene.updateMatrixWorld(true);
  T.setTime(T.time+5);swings.length=0;const t0=T.time;
  if(cw.spear){P.spearHeldSince=T.time-0.05;P.updateSpear(cw,1/60);}else P.shoot();
  const r={name,early:0,late:0,back:0,swingBeforeHit:false};
  let hitT=null;
  for(let i=0;i<60;i++){T.setTime(T.time+1/60);P.update(1/60);if(hitT==null&&front.hp<front.maxhp)hitT=T.time-t0;}
  r.hitAt=hitT;r.frontDmg=Math.round(front.maxhp-front.hp);r.backDmg=Math.round(back.maxhp-back.hp);
  r.swingAt=swings.length?+(swings[0]-t0).toFixed(3):null;r.swingBeforeHit=swings.length>0&&hitT!=null&&(swings[0]-t0)<=hitT+1e-6;
  out.push(r);}
 return out;});
for(const r of res)console.log(JSON.stringify(r));
let bad=[...errs];
for(const r of res){
 if(!(r.frontDmg>0))bad.push(r.name+': no damage in front');
 if(r.backDmg>0)bad.push(r.name+': hit a zombie BEHIND the player');
 if(r.hitAt!=null&&r.hitAt<0.08)bad.push(r.name+': damage at click time ('+r.hitAt+'), not on the hit frame');
 if(!r.swingBeforeHit)bad.push(r.name+': swing sound not before the hit');
}
await b.close();server.close();
if(bad.length){console.error('FAIL\n'+bad.join('\n'));process.exit(1);}
console.log('PASS melee hit frame / direction');})().catch(e=>{console.error(e);process.exit(1);});
