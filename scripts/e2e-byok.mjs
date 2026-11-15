import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { controlledPage } from './browser-test-runtime.mjs';
import { mkdir } from 'node:fs/promises';
const base = process.env.BASE || 'http://127.0.0.1:5195';
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
let pass=0,fail=0;
const key='synthetic-browser-byok';
async function test(name,fn){const page=await controlledPage(await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}));page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));try{await page.goto(base);await fn(page);assert.deepEqual(errors,[]);pass++;console.log('PASS '+name);}catch(e){fail++;console.log('FAIL '+name+': '+e.message);}finally{await page.close();}}
const open = page => page.getByRole('button',{name:'AI 功能设置',exact:true}).click();
async function fill(page,value=key){await open(page);await page.getByLabel('DeepSeek API Key',{exact:true}).fill(value);await page.getByRole('button',{name:'完成设置'}).click();}
async function invoke(page){return page.evaluate(async()=>{const {callApi}=await import('/src/lib/api.js');try{await callApi('/api/ingredient/research',{name:'柠檬酸'});return 'ok';}catch(e){return e.code||e.name;}});}
await test('无Key三个演示完整运行且没有真实API请求',async page=>{
 let requests=0;page.on('request',r=>{if(r.url().includes('/api/')&&r.method()==='POST')requests++;});
 for(const sample of ['drink','cookie','yogurt']){await page.goto(base);await page.locator('.demo-'+sample).click();await page.getByRole('button',{name:/确认无误，查看分析/}).click();await page.locator('.ing-card-btn').first().click();await page.getByRole('button',{name:'关闭',exact:true}).click();}
 assert.equal(requests,0);
});
await test('无Key识图明确拦截，有Key合成图片经本地路由进入确认页',async page=>{
 let calls=0;await page.route('**/api/vision/extract',route=>{calls++;assert.equal(route.request().headers().authorization,`Bearer ${key}`);assert.ok(route.request().postDataJSON().imageBase64);return route.fulfill({json:{ok:true,data:{parsed:{product:{name:'合成包装'},ingredients:['水'],nutrition:{basis:'per_100ml',items:[]}},provider:'deepseek-vision'}}});});
 await page.locator('input[type=file]').first().setInputFiles('public/test-label.png');await page.getByRole('button',{name:/开始识别/}).click();await page.getByText(/请先在「AI 功能设置」/).waitFor();assert.equal(calls,0);
 await fill(page);await page.getByRole('button',{name:/开始识别|重新识别/}).first().click();await page.getByRole('heading',{name:'确认识别结果'}).waitFor();assert.equal(calls,1);
});
await test('默认隐藏、显示隐藏、状态、清除取消、旧Key不再发送',async page=>{
 await open(page);const input=page.getByLabel('DeepSeek API Key',{exact:true});assert.equal(await input.getAttribute('type'),'password');await input.fill(key);await page.getByText('已填写 Key（尚未验证）').waitFor();await page.getByRole('button',{name:'显示 Key',exact:true}).click();assert.equal(await input.getAttribute('type'),'text');await page.getByRole('button',{name:'隐藏 Key',exact:true}).click();await page.getByRole('button',{name:'完成设置'}).click();
 let calls=0;await page.route('**/api/ingredient/research',async route=>{calls++;await new Promise(r=>setTimeout(r,500));await route.fulfill({json:{ok:true,data:{}}}).catch(()=>{});});
 const pending=invoke(page);await page.waitForTimeout(100);await open(page);await page.getByRole('button',{name:'清除 Key',exact:true}).click();assert.match(await pending,/ABORTED|AbortError/);await page.getByRole('button',{name:'完成设置'}).click();assert.equal(await invoke(page),'USER_KEY_REQUIRED');assert.equal(calls,1);
});
await test('刷新清除；无localStorage/sessionStorage/URL/Cookie持久化',async page=>{
 await fill(page);const stored=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage},cookie:document.cookie,url:location.href}));assert.ok(!stored.includes(key));assert.equal((await page.context().cookies()).some(c=>c.value.includes(key)),false);
 await page.reload();await open(page);await page.getByText('未填写 Key · 演示模式可用').waitFor();assert.equal(await page.getByLabel('DeepSeek API Key',{exact:true}).inputValue(),'');await page.getByRole('button',{name:'完成设置'}).click();assert.equal(await invoke(page),'USER_KEY_REQUIRED');
});
await test('401/402/429错误由前端保留中文错误而不展示密钥',async page=>{
 await fill(page);for(const [status,code,message] of [[401,'UPSTREAM_UNAUTHORIZED','API Key 无效'],[402,'UPSTREAM_PAYMENT_REQUIRED','账户余额不足'],[429,'UPSTREAM_RATE_LIMITED','触发限流']]){await page.route('**/api/ingredient/research',r=>r.fulfill({status,json:{ok:false,error:{code,message}}}));assert.equal(await invoke(page),code);}assert.ok(!(await page.locator('body').innerText()).includes(key));
});
await test('同会话成分结果复用，换Key和清除后不复用旧结果',async page=>{
 await fill(page);let count=0;
 await page.route('**/api/vision/extract',r=>r.fulfill({json:{ok:true,data:{parsed:{product:{name:'缓存测试'},ingredients:['水'],nutrition:{basis:'per_100ml',items:[]}},provider:'deepseek-vision'}}}));
 await page.route('**/api/ingredient/research',r=>{count++;return r.fulfill({json:{ok:true,data:{status:'no_source',ingredient:'水',sources:[],sections:[],notes:['测试资料不足']}}});});
 await page.locator('input[type=file]').first().setInputFiles('public/test-label.png');await page.getByRole('button',{name:/开始识别/}).click();await page.getByRole('button',{name:/确认无误，查看分析/}).click();
 const ingredient=page.locator('.ing-card-btn').first();
 await ingredient.click();await page.waitForTimeout(300);assert.equal(count,1);await page.getByRole('button',{name:'关闭',exact:true}).click();await ingredient.click();await page.waitForTimeout(200);assert.equal(count,1);await page.getByRole('button',{name:'关闭',exact:true}).click();
 await fill(page,'synthetic-browser-second');await ingredient.click();await page.waitForTimeout(300);assert.equal(count,2);await page.getByRole('button',{name:'关闭',exact:true}).click();
 await open(page);await page.getByRole('button',{name:'清除 Key',exact:true}).click();await page.getByRole('button',{name:'完成设置'}).click();await ingredient.click();await page.getByText(/请先在「AI 功能设置」/).waitFor();assert.equal(count,2);
});
await test('手机与桌面设置框可滚动、键盘关闭与焦点恢复',async page=>{
 await mkdir('runtime-output/byok',{recursive:true});for(const width of [360,390,1440]){await page.setViewportSize({width,height:800});await open(page);const dialog=page.getByRole('dialog');assert.ok(await dialog.isVisible());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await dialog.evaluate(el=>el.scrollTop=el.scrollHeight);await page.getByRole('button',{name:'完成设置'}).click();assert.equal(await page.getByRole('button',{name:'AI 功能设置',exact:true}).evaluate(el=>el===document.activeElement),true);}
 await open(page);await page.screenshot({path:'runtime-output/byok/settings.png'});await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').isVisible(),false);
});
await browser.close();console.log(`BYOK UI ${pass}/${pass+fail} passed`);process.exitCode=fail?1:0;
