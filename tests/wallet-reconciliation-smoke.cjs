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
    const result=await page.evaluate(async()=>{
      const T=DeadRecoilTest,A=T.Account,P=T.Progression;
      const original={
        user:A.user,userId:A.userId,profile:A.profile,run:A.run,pending:A.pending,
        economy:{...P.economy.data},
        reward:JSON.parse(JSON.stringify(A.rewardDisplay)),
        report:DR.RunRepository.report,
      };
      try{
        for(const side of ['earned','acknowledged'])
          for(const key of ['coins','normal','lucky']) A.rewardDisplay[side][key]=0;
        A.user='wallet_test';A.userId='wallet-test';
        A.pending=Promise.resolve();
        A.apply({
          ...P.economy.data,userId:'wallet-test',username:'wallet_test',displayName:'Wallet Test',
          coins:4000,normal:0,lucky:0,stats:{}
        });
        A.run={id:'wallet-run',offline:false};
        P.reward(2000);
        const initial={live:P.data.coins,confirmed:A.profile.coins,pending:A.pendingReward('coins')};

        let calls=0;
        DR.RunRepository.report=async()=>{
          calls++;
          return {profile:{...A.profile,coins:calls===1?5000:6000},missions:[]};
        };
        await A.checkpoint(false);
        const partial={
          live:P.data.coins,confirmed:A.profile.coins,pending:A.pendingReward('coins'),
          ack:A.rewardDisplay.acknowledged.coins
        };

        // A stale non-spending profile response (lobby/profile/preferences/reconnect) must not
        // make the visible/spendable wallet fall while the remainder is still being persisted.
        A.applyNonSpending({...A.profile,coins:4000});
        const stale={
          live:P.data.coins,confirmed:A.profile.coins,pending:A.pendingReward('coins'),
          ack:A.rewardDisplay.acknowledged.coins
        };

        await A.checkpoint(false);
        const settled={
          live:P.data.coins,confirmed:A.profile.coins,pending:A.pendingReward('coins'),
          ack:A.rewardDisplay.acknowledged.coins
        };

        // A final report is authoritative even if its persisted total differs from the
        // optimistic per-event HUD estimate (for example due to aggregate reward rounding).
        for(const side of ['earned','acknowledged'])
          for(const key of ['coins','normal','lucky']) A.rewardDisplay[side][key]=0;
        A.apply({...A.profile,coins:4000});
        A.run={id:'wallet-final',offline:false};
        P.reward(2000); // HUD immediately estimates 6000.
        DR.RunRepository.report=async()=>({profile:{...A.profile,coins:5900},missions:[]});
        await A.checkpoint(true,'quit');
        const finalAuthoritative={
          live:P.data.coins,confirmed:A.profile.coins,pending:A.pendingReward('coins'),
          ack:A.rewardDisplay.acknowledged.coins,run:A.run
        };

        // A real spending response remains authoritative and is allowed to reduce the wallet.
        A.apply({...A.profile,coins:1000});
        const spent={live:P.data.coins,confirmed:A.profile.coins,pending:A.pendingReward('coins')};
        return {initial,partial,stale,settled,finalAuthoritative,spent};
      } finally {
        DR.RunRepository.report=original.report;
        A.user=original.user;A.userId=original.userId;A.profile=original.profile;A.run=original.run;A.pending=original.pending;
        P.economy.data=original.economy;
        for(const side of ['earned','acknowledged'])
          for(const key of ['coins','normal','lucky']) A.rewardDisplay[side][key]=original.reward[side][key];
      }
    });
    console.log(JSON.stringify(result));
    assert.deepEqual(result.initial,{live:6000,confirmed:4000,pending:2000});
    assert.deepEqual(result.partial,{live:6000,confirmed:5000,pending:1000,ack:1000},
      'partial server persistence must keep the 6k live wallet while only acknowledging the confirmed 1k');
    assert.deepEqual(result.stale,{live:6000,confirmed:5000,pending:1000,ack:1000},
      'stale lobby/profile response must never roll the 6k wallet back');
    assert.deepEqual(result.settled,{live:6000,confirmed:6000,pending:0,ack:2000},
      'once server confirms the remainder, pending overlay must settle without changing the wallet');
    assert.deepEqual(result.finalAuthoritative,{live:5900,confirmed:5900,pending:0,ack:2000,run:null},
      'final run response must retire the optimistic overlay and show the exact server wallet');
    assert.deepEqual(result.spent,{live:1000,confirmed:1000,pending:0},
      'authoritative spending responses are still allowed to lower the wallet');
    assert.deepEqual(errors,[]);
    console.log('PASS wallet reconciliation including authoritative final-run settlement');
  } finally { await browser.close(); server.close(); }
})().catch(e=>{console.error(e);server.close();process.exit(1);});
