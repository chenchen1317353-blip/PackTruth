import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { QUALITY_CASES, rebuildQualityResult, ledgerHash, OUTPUT } from './fixtures/quality-v251.mjs';
const before=ledgerHash();
fs.mkdirSync(OUTPUT+'/screenshots',{recursive:true});
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
const errors=[],results=[],requests=[];
let active;
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url());
 if(!['127.0.0.1','localhost'].includes(url.hostname)) {
  requests.push({url:url.origin,type:'external_resource_blocked'});
  return route.fulfill({status:200,contentType:req.resourceType()==='stylesheet'?'text/css':'text/plain',body:''});
 }
 if(url.pathname==='/api/ingredient/research') {
  requests.push({type:'research_replay',name:active.name});
  return route.fulfill({json:{ok:true,data:rebuildQualityResult(active)}});
 }
 if(url.pathname==='/api/vision/extract')return route.fulfill({json:{ok:true,data:{parsed:{
  product_name:'通用内容质量回放',category:'酱腌菜',ingredients_text:'水、食用盐、'+active.name,
  nutrition:{basis:'per_100g',basis_text:'每100克',items:[{name:'钠',value:800,unit:'mg'}]},claims:[],unreadable:[],
 },partial:false}}});
 if(url.pathname.startsWith('/api/ingredient/research/progress'))return route.fulfill({json:{ok:true,data:{stage:'done',label:'回放完成'}}});
 if(url.pathname==='/api/ingredient/research/cancel')return route.fulfill({json:{ok:true,data:{cancelled:true}}});
 if(url.pathname.startsWith('/api/')&&req.method()==='POST')throw new Error('未模拟的API请求被禁止：'+url.pathname);
 return route.continue();
});
try{
 for(const [i,sample] of QUALITY_CASES.entries()){
  active=sample;
  await page.goto('http://127.0.0.1:5194',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'AI 功能设置'}).click();
  await page.locator('.ai-settings-dialog input').fill('offline-quality-replay-key');
  await page.getByRole('button',{name:'完成设置'}).click();
  await page.setInputFiles('input[type=file]','public/test-label.png');
  await page.getByRole('button',{name:/开始识别/}).click();
  await page.getByRole('button',{name:/确认无误/}).click();
  for(let j=0;j<6;j++){let c=page.locator('.ing-child-block:not([open]) > summary');if(!await c.count())break;await c.first().click();}
  await page.locator('.ing-card-btn',{hasText:sample.name}).first().click();
  await page.locator('.analyzing-bar').waitFor({state:'hidden',timeout:15000});
  await page.locator('.sheet').waitFor();
  const brief=await page.locator('.sheet').innerText();
  await page.locator('.sheet').screenshot({path:OUTPUT+'/screenshots/'+i+'-brief.png'});
  if(sample.name==='乳酸'){
   if(/婴儿/.test(await page.locator('.health-headline').innerText()))throw new Error('特殊人群限制抢占大字');
   const general=page.locator('.health-row').filter({has:page.locator('dt',{hasText:'吃多了可能怎么样'})});
   if(await general.count() && /婴儿|喂养/.test(await general.innerText()))throw new Error('婴儿喂养抢占一般高摄入');
  }
  if(sample.tag==='suitability'&&await page.locator('.health-row dt',{hasText:'哪些人需要特别注意'}).count())throw new Error('适用性仍被渲染为风险人群');
  if(sample.tag==='suitability'&&!/人群与适用信息/.test(brief))throw new Error('适用性信息没有进入实际界面');
  if(sample.tag==='category'&&await page.locator('.health-row').count())throw new Error('类别资料不足仍渲染重复四问');
  await page.getByRole('button',{name:/深入了解这个成分/}).click();
  const deep=await page.locator('.deep-view').innerText();
  if(sample.name==='乳酸'&&!/婴儿/.test(deep))throw new Error('婴儿研究被删除');
  if(sample.name==='阿斯巴甜'&&!/苯丙氨酸/.test(brief))throw new Error('深度人体发现没有进入简明');
  await page.locator('.deep-view').scrollIntoViewIfNeeded();
  await page.locator('.sheet').screenshot({path:OUTPUT+'/screenshots/'+i+'-deep.png'});
  if([0,8,9,10].includes(i)){
   const studies=page.locator('section[aria-label="研究与原始证据"]');
   const selected=i===0?studies.locator('article').filter({hasText:'婴儿'}).last():studies.locator('article').filter({hasText:i===8?'3 名':i===9?'苯丙氨酸':'动物'}).last();
   if(!await selected.count())throw new Error('无法在深入区找到需要保留的研究条件');
   await selected.scrollIntoViewIfNeeded();
   await selected.screenshot({path:OUTPUT+'/screenshots/'+i+'-evidence.png'});
   const meta=selected.locator('details').first();
   if(await meta.count()){
    await meta.locator('summary').click();
    if((await meta.innerText()).length<30)throw new Error('原文展开后内容不足');
   }
  }
  for(const width of [360,390,1280]){
   await page.setViewportSize({width,height:844});
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error(width+'横向溢出');
   const scroller=await page.locator('.sheet').evaluate(e=>({height:e.clientHeight,scrollHeight:e.scrollHeight}));
   if(scroller.scrollHeight<scroller.height)throw new Error('滚动容器尺寸异常');
  }
  await page.setViewportSize({width:390,height:844});
  results.push({name:sample.name,provenance:sample.provenance,brief,deep,viewportChecks:[360,390,1280],screenshots:[i+'-brief.png',i+'-deep.png']});
  console.log('PASS UI '+sample.name);
 }
 if(errors.length)throw new Error(errors.join('; '));
 if(ledgerHash()!==before)throw new Error('付费台账变化');
}finally{
 fs.writeFileSync(OUTPUT+'/browser-results.json',JSON.stringify({results,errors,requests,paidCalls:0,ledgerBefore:before,ledgerAfter:ledgerHash()},null,2));
 await browser.close();
}
