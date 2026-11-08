import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGameUrl, getAdsForSlot } from '../portal-lib.mjs';

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
