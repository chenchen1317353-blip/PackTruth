import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=path.join(root,'.packtruth'),stateFile=path.join(runtime,'session.json');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
const readState=()=>{
 try{
  const s=JSON.parse(fs.readFileSync(stateFile,'utf8'));
  if(s.root!==root || !Number.isInteger(s.port) || s.port<8787 || s.port>8797 || s.url!=='http://127.0.0.1:'+s.port || !/^[a-f0-9]{64}$/.test(s.token)||!/^[a-f0-9]{32}$/.test(s.runId))return null;
  return s;
 }catch{return null;}
};
async function ready(s){
 if(!s)return false;
 try{
  const r=await fetch(s.url+'/__packtruth/ready',{headers:{'x-packtruth-control':s.token},signal:AbortSignal.timeout(800),redirect:'error'});
  const d=await r.json();
  return r.ok && d.service==='PackTruthPortable' && d.runId===s.runId && d.pid===s.pid;
 }catch{return false;}
}
async function openBrowser(url){
 const command=path.join(process.env.SystemRoot||'C:\\Windows','System32','rundll32.exe');
 await new Promise((resolve,reject)=>{
  const p=spawn(command,['url.dll,FileProtocolHandler',url],{detached:true,stdio:'ignore',windowsHide:true});
  p.once('error',()=>reject(new Error('浏览器未能自动打开，请将此地址复制到浏览器：'+url)));
  p.once('spawn',()=>{p.unref();resolve();});
 });
}
async function start(){
 for(const file of ['runtime/node.exe','launcher/local-server.mjs','app/backend.mjs','app/web/index.html','app/native/sharp-win32-x64-0.35.5.node','app/native/libvips-42.dll','app/native/libvips-cpp-8.18.7.dll']){
  if(!fs.existsSync(path.join(root,file)))throw new Error('缺少运行文件：'+file+'。请先完整解压 ZIP，再启动。');
 }
 fs.mkdirSync(runtime,{recursive:true});
 const lockFile=path.join(runtime,'start.lock');
 let lock;
 try{lock=fs.openSync(lockFile,'wx');}
 catch(err){
  if(err.code!=='EEXIST')throw new Error('文件夹无法写入，请解压到桌面或文档文件夹后重试。');
  let owner;try{owner=JSON.parse(fs.readFileSync(lockFile));}catch{}
  if(owner && alive(owner.pid))throw new Error('另一个启动窗口正在工作，请稍等片刻。');
  fs.unlinkSync(lockFile);lock=fs.openSync(lockFile,'wx');
 }
 fs.writeFileSync(lock,JSON.stringify({pid:process.pid}));
 try{
  const old=readState();
  if(await ready(old)){console.log('PackTruth 已在运行：'+old.url);await openBrowser(old.url);return;}
  const runId=randomBytes(16).toString('hex'),env={...process.env,NODE_ENV:'production'};
  for(const key of Object.keys(env))if(/^(?:DEEPSEEK_|MIMO_|NODE_OPTIONS$|NODE_PATH$|PUBLIC_ORIGIN$|TRUST_PROXY$)/i.test(key))delete env[key];
  console.log('正在启动 PackTruth，请稍候…');
  const child=spawn(process.execPath,[path.join(root,'launcher','local-server.mjs'),runId],{cwd:root,env,detached:true,stdio:'ignore',windowsHide:true});
  let childError=false;child.once('error',()=>{childError=true;});child.unref();
  for(let i=0;i<120;i++){
   await pause(200);
   const state=readState();
   if(state?.runId===runId && await ready(state)){
    console.log('启动成功：'+state.url);
    console.log('使用结束后，请双击“关闭 PackTruth.bat”。');
    await openBrowser(state.url);return;
   }
   let error;try{error=JSON.parse(fs.readFileSync(path.join(runtime,'startup-error.json')));}catch{}
   if(error?.runId===runId)throw new Error(error.code==='PORTS_BUSY'?'本地端口 8787–8797 均被占用，请关闭占用软件后重试。':'运行文件无法加载。请重新完整解压，确认安全软件没有隔离文件；本版需要 Windows 10/11 64 位。');
   if(childError||!child.pid||!alive(child.pid))throw new Error('服务未能启动。请重新完整解压，确认文件夹可写、运行文件未被安全软件隔离。');
  }
  child.kill();
  throw new Error('启动等待超时。请检查安全软件是否拦截，然后重试。');
 }finally{
  fs.closeSync(lock);try{fs.unlinkSync(lockFile);}catch{}
 }
}
async function stop(){
 const state=readState();
 if(!await ready(state)){console.log('此文件夹的 PackTruth 未运行，无需关闭。');return;}
 const r=await fetch(state.url+'/__packtruth/stop',{method:'POST',headers:{'x-packtruth-control':state.token},signal:AbortSignal.timeout(3000),redirect:'error'});
 if(!r.ok)throw new Error('关闭请求未被本次服务接受；没有结束其他程序。');
 for(let i=0;i<50;i++){await pause(100);if(!await ready(state)){console.log('PackTruth 已关闭。');return;}}
 throw new Error('服务正在结束请求，请稍后再双击关闭。');
}
try{
 if(process.platform!=='win32'||process.arch!=='x64')throw new Error('本版适用于 Windows 10/11 64 位电脑。');
 if(process.argv[2]==='start')await start();
 else if(process.argv[2]==='stop')await stop();
 else throw new Error('请使用文件夹中的启动或关闭脚本。');
}catch(err){console.error('未能完成操作：'+(err.message||'请重新解压后重试。'));process.exitCode=1;}
