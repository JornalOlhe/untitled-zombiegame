const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve('android/app/src/main/assets');
const server = http.createServer((q,r)=>{
  const f=path.resolve(root,'.'+(q.url.split('?')[0]==='/'?'/index.html':q.url.split('?')[0]));
  if(!f.startsWith(root+path.sep)) return r.writeHead(403).end();
  fs.readFile(f,(e,d)=>{if(e)return r.writeHead(404).end();r.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html');r.end(d);});
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:640,height:360}}), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
    await page.waitForFunction(()=>!!window.DeadRecoilTest,{timeout:60000});
    await page.waitForFunction(()=>window.DeadRecoilTest?.WeaponModels?.ready,{timeout:90000});
    const r=await page.evaluate(async()=>{
      const T=DeadRecoilTest,P=T.PlayerController,V=THREE.Vector3,W=T.WeaponSystem,S=T.MatchShop;
      T.setMap(0);P.start();T.setPlaying();T.WaveManager.remaining=0;T.WaveManager.update=()=>{};T.ZombieManager.clear();
      const p=T.player;const r={};
      const w=W.create(4);W.equip(w);
      r.hp0=p.maxhp;r.dmg0=+T.weaponDamage?.(w)||null;
      S.essence=50000;
      r.perk=S.buyPerk('couraca');T.stepPlayer(1/30,3);r.hp1=p.maxhp;
      r.price2=S.perkPrice(S.PERKS[1]);
      S.buyPerk('toque');S.buyPerk('recarga');S.buyPerk('chance');
      r.pap=S.buyPap();r.pap2=S.buyPap();r.pap3=S.buyPap();r.name=W.current().name;r.mag=W.current().mag;
      r.mod=S.buyMod('shock');
      r.armor=S.buyArmor();r.bonus=p.bonus;
      r.ess=S.essence;
      // proc shock: 4 zombies near
      const zs=[];for(let i=0;i<4;i++){const z=T.ZombieManager.spawn(0,null,new V(i*1.2,0,4));z.speed=0;z.hp=z.maxhp=1e5;zs.push(z);}
      for(let i=0;i<40;i++){zs[0].modAt=0;T.ZombieManager.hit(zs[0],10,false,null,W.current());}
      r.chained=zs.slice(1).filter(z=>z.hp<1e5).length;
      // essence earn on kill
      const e0=S.essence;const k=T.ZombieManager.spawn(0,null,new V(0,0,6));T.ZombieManager.hit(k,1e6,true,null,W.current());r.killEss=S.essence-e0;
      // second chance
      p.hp=1;P.hurt(9999);r.revived=p.hp>0;r.chanceGone=!S.has('chance');
      // variants
      T.WaveManager.wave=10;const vs={};for(const id of Object.keys(T.ZombieVariants.KINDS)){const z=T.ZombieManager.spawn(0,null,new V(-4,0,0));T.ZombieVariants.apply(z,id);vs[id]=!!z.variantFx;}
      r.variants=vs;
      // blood wave
      T.WaveManager.wave=6;T.WaveManager.start();r.blood=T.WaveManager.blood;r.bloodClass=document.body.classList.contains('blood-wave');r.remaining=T.WaveManager.remaining;
      // shop UI
      S.show();r.shopOpen=S.open;r.cards=document.querySelectorAll('#shop-body .shop-card').length;S.close();r.closed=!S.open&&T.state===T.GameState.PLAYING;
      r.hud=document.getElementById('essencehud').textContent;
      return r;
    });
    console.log(JSON.stringify(r));
    assert.ok(r.perk && r.hp1 === Math.round(r.hp0 * 1.25), 'Couraça raises max HP by 25%');
    assert.equal(r.price2, 2500, 'perk price rises 1000 per owned perk');
    assert.ok(r.pap && r.pap2 && !r.pap3 && /★★$/.test(r.name) && r.mag > 30, 'weapon upgrade: two steps, bigger mag');
    assert.ok(r.mod && r.chained >= 1, 'shock ammo chains to nearby enemies');
    assert.ok(r.armor && r.bonus === 50, 'armor plate');
    assert.equal(r.killEss, 45, 'headshot kill pays 45 Essência');
    assert.ok(r.revived && r.chanceGone, 'Segunda Chance revives once and is consumed');
    assert.ok(Object.values(r.variants).every(Boolean), 'all four variants dress');
    assert.ok(r.blood && r.bloodClass && r.remaining > 30, 'every 7th wave is a bigger blood wave');
    assert.ok(r.shopOpen && r.cards === 12 && r.closed, 'shop opens, lists 12 offers and resumes the match');
    assert.deepEqual(errors, []);
    console.log('PASS match shop / variants / blood wave');
  } finally { await browser.close(); server.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
