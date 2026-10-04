const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve('android/app/src/main/assets');
const server=http.createServer((q,r)=>{const f=path.resolve(root,'.'+(q.url.split('?')[0]==='/'?'/index.html':q.url.split('?')[0]));if(!f.startsWith(root+path.sep))return r.writeHead(403).end();fs.readFile(f,(e,d)=>{if(e)return r.writeHead(404).end();r.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html');r.end(d);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{const page=await browser.newPage({viewport:{width:320,height:180}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/?test=1`);await page.waitForFunction(()=>window.DeadRecoilTest?.WeaponModels?.ready,null,{timeout:90000});
const result=await page.evaluate(async()=>{
 const T=DeadRecoilTest,M=DR.MissionUI;
 T.UIManager.screen('menu');const first=M.open(),second=M.openIndex();await Promise.all([first,second]);
 const latest=!document.getElementById('indexscreen').classList.contains('hidden')&&document.getElementById('missionscreen').classList.contains('hidden');
 T.UIManager.screen('menu');const pending=M.open();T.UIManager.screen('playscreen');await pending;
 return {latest,redirect:!document.getElementById('playscreen').classList.contains('hidden')&&document.getElementById('missionscreen').classList.contains('hidden')};
});
assert.deepEqual(result,{latest:true,redirect:true});assert.deepEqual(errors,[]);console.log('PASS latest navigation wins over delayed transitions');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
