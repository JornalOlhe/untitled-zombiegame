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
    await page.waitForFunction(()=>!!window.DeadRecoilTest, null, {timeout:60000});
    await page.waitForFunction(()=>window.DeadRecoilTest?.WeaponModels?.ready, null, {timeout:90000});
    const r=await page.evaluate(async()=>{
      const T=DeadRecoilTest,V=THREE.Vector3;T.setMap(0);T.setMode('classic');T.PlayerController.start();
      await new Promise(r=>{const i=setInterval(()=>{if(T.state===T.GameState.PLAYING){clearInterval(i);r()}},100)});
      const L=T.StreetBreak.list,n=L.length,lamp=L.find(o=>o.halo),sig=L.find(o=>o.head);
      const o=new V(lamp.x+3,1.7,lamp.z+3),d=new V(lamp.x,lamp.y,lamp.z).sub(o).normalize();
      T.StreetBreak.test(o,d,50);
      const o2=new V(sig.x+2,1.7,sig.z+5),d2=new V(sig.x,sig.y,sig.z).sub(o2).normalize();
      T.StreetBreak.test(o2,d2,50);
      const miss=L.find(o=>o.halo&&!o.broken);T.StreetBreak.test(new V(miss.x+3,1.7,miss.z),new V(0,0,1),50);
      await new Promise(r=>setTimeout(r,1500));const lit=T.WindLitter.mesh?{vis:T.WindLitter.mesh.visible,count:T.WindLitter.mesh.count}:null;
      const tl=T.MapManager.signals.length;
      return {lit,tl,n,lamp:lamp.broken,halo:lamp.halo.visible,cover:lamp.cover.visible,sig:sig.broken,missStill:!miss.broken,debris:T.PhysicsProps.debris.length};
    });
    assert.ok(r.n >= 40, 'lamps and signal heads are registered '+JSON.stringify(r));
    assert.ok(r.lamp && !r.halo && r.cover, 'shot street light goes dark');
    assert.ok(r.sig, 'shot signal head breaks');
    assert.ok(r.missStill, 'a miss does not break anything');
    assert.ok(r.debris > 0, 'glass shards spawned');
    assert.ok(r.lit && r.lit.vis && r.lit.count > 0, 'wind litter is active in the city');
    assert.deepEqual(errors,[]);
    console.log('PASS street fx',JSON.stringify(r));
  } finally { await browser.close(); server.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
