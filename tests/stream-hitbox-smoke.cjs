// 0.30.1 regression: stream weapons use a tight physical cone and hard range.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve('android/app/src/main/assets');
const server=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]==='/'?'index.html':q.url.split('?')[0]));fs.readFile(f,(e,d)=>{if(e){r.writeHead(404).end();return;}r.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':'text/html');r.end(d)})});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const p=await b.newPage({viewport:{width:800,height:450}}),errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(`http://127.0.0.1:${server.address().port}/?test=1`);await p.waitForFunction(()=>window.DeadRecoilTest?.WeaponModels?.ready,{timeout:90000});
 const out=await p.evaluate(()=>{
  const T=DeadRecoilTest,W=T.WeaponSystem,P=T.PlayerController,V=THREE.Vector3;
  T.setMap(4);P.start();T.pause();T.WaveManager.remaining=0;T.ZombieManager.clear();T.MapManager.walls.length=0;
  const pl=T.player;pl.hp=pl.maxhp=1e9;pl.pos.set(0,1.7,12);T.setYaw(0);T.setPitch(0);
  const names=['Hellfire','Fire Incarnation','Absolute Zero'],rows=[],byName=n=>W.weapons.findIndex(w=>w.name===n);
  for(const name of names){
    const def=W.weapons[byName(name)],w={...def};W.equip(w);W.buildModel?.();W.current().ammo=999;
    const hit=(x,z)=>{T.ZombieManager.clear();const q=T.ZombieManager.spawn(0,null,new V(x,0,z));q.hp=q.maxhp=1e6;q.speed=0;q.group.position.set(x,0,z);T.scene.updateMatrixWorld(true);T.setTime(T.time+5);const hp=q.hp;P.shoot();return +(hp-q.hp).toFixed(3);};
    rows.push({name,cone:def.cone,range:def.range,center:hit(0,6),side:hit(2.1,6),far:hit(0,12-(def.range+1.2))});
  }
  const balance={};for(const n of ['Wraith M4A1','Cerberus Laser','Quantum Annihilator','Dawn Spear','Heavenfall Bazooka','Demonic Fury','Angelic Specter']){const w=W.weapons[byName(n)];balance[n]={damage:w.damage,rate:w.rate};}
  return {rows,balance};
 });
 for(const r of out.rows){assert.ok(r.center>0,r.name+' center must hit');assert.equal(r.side,0,r.name+' lateral hitbox');assert.equal(r.far,0,r.name+' hard range');assert.ok(r.cone<=0.16,r.name+' cone');}
 assert.deepEqual(out.balance,{'Wraith M4A1':{damage:20,rate:0.115},'Cerberus Laser':{damage:13,rate:0.24},'Quantum Annihilator':{damage:15,rate:0.6},'Dawn Spear':{damage:62,rate:0.5},'Heavenfall Bazooka':{damage:125,rate:1},'Demonic Fury':{damage:54,rate:0.55},'Angelic Specter':{damage:44,rate:0.38}});
 assert.deepEqual(errs,[]);console.log(JSON.stringify(out));console.log('PASS stream hit volumes and balance');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exit(1);});
