import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGameUrl, getAdsForSlot } from '../portal-lib.mjs';
import {checkPagesEntry} from './check-pages-entry.mjs';
import {readCanonicalCatalog} from './read-canonical-catalog.mjs';

test('entry paths: preserve case and nested path; reject escaping URLs', () => {
  const root = 'https://opsemilygohmbza.github.io/Owner-Game/';
  assert.equal(resolveGameUrl(root, 'TesteLuiz/index.html').href, root+'TesteLuiz/index.html');
  assert.equal(resolveGameUrl(root+'MapOnly/index.html', 'MapOnly/index.html').href, root+'MapOnly/index.html');
  assert.equal(resolveGameUrl(root, 'index.html').href, root+'index.html');
  for (const path of ['../other/index.html', 'https://example.com/', 'a\\b']) assert.equal(resolveGameUrl(root, path), null, path);
  assert.equal(resolveGameUrl('javascript:alert(1)'), null);
  assert.equal(resolveGameUrl('https://user:password@example.com/'), null);
});

test('all ads obey global, slot and per-ad switches with independent domains', () => {
  const ads = {enabled:true,ads:[{id:'one',text:'one',url:'https://ecy.al'}, {id:'two',text:'two',url:'https://pipifu.com'}],slots:{header:['one'],search:{enabled:true,ads:['two']}}};
  assert.equal(getAdsForSlot(ads,'header')[0].url,'https://ecy.al');
  assert.equal(getAdsForSlot(ads,'search')[0].url,'https://pipifu.com');
  assert.deepEqual(getAdsForSlot({...ads,enabled:false},'header'),[]);
  assert.deepEqual(getAdsForSlot({...ads,slots:{header:{enabled:false,ads:['one']}}},'header'),[]);
  assert.deepEqual(getAdsForSlot({...ads,ads:[{...ads.ads[0],enabled:false}]},'header'),[]);
  for (let i=0;i<1000;i++) assert.equal(getAdsForSlot(ads,i%2 ? 'header' : 'search').length,1);
});

test('portal accepts MZ dynamic main startup but rejects unrelated HTML and cross-origin main scripts',async()=>{
  const request=async url=>String(url).endsWith('main.js')
    ?new Response('const scriptUrls=["js/rmmz_core.js"];')
    :new Response('<script src="js/main.js"></script>',{headers:{'content-type':'text/html'}});
  assert.deepEqual(await checkPagesEntry('https://example.test/game/index.html',request),{type:'dynamic-main'});
  await assert.rejects(checkPagesEntry('https://example.test/game/',async()=>new Response('<html>not a game</html>',{headers:{'content-type':'text/html'}})),/does not reference/);
  await assert.rejects(checkPagesEntry('https://example.test/game/',async()=>new Response('<script src="https://other.test/js/main.js"></script>',{headers:{'content-type':'text/html'}})),/does not reference/);
});

test('large canonical catalog is loaded by immutable blob SHA, never stale raw/main',async()=>{
  const sha='a'.repeat(40);const calls=[];
  const games=[{id:'fresh-game',runtime:{status:'passed'}}];
  const result=await readCanonicalCatalog({request:async(url,options)=>{
    calls.push(String(url));assert.equal(options.redirect,'error');
    return new Response(JSON.stringify(String(url).includes('contents/')?{sha,encoding:'none'}:{sha,encoding:'base64',content:Buffer.from(JSON.stringify(games)).toString('base64')}));
  }});
  assert.deepEqual(result,{entries:games,blobSha:sha});
  assert.equal(calls.length,2);assert.match(calls[1],new RegExp(`git/blobs/${sha}$`));
  assert.ok(calls.every(url=>!url.includes('raw.githubusercontent.com')));
});
