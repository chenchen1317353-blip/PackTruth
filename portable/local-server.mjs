// Portable hosting only. Product providers/domain and runtime JS dependencies
// are compiled together from the included source; native image libraries stay external.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=path.join(root,'.packtruth');
const runId=process.argv[2];
if(!/^[a-f0-9]{32}$/.test(runId||''))process.exit(2);
fs.mkdirSync(runtime,{recursive:true});
process.chdir(runtime);
for(const key of Object.keys(process.env))if(/^(?:DEEPSEEK_|MIMO_|PUBLIC_ORIGIN$|TRUST_PROXY$|NODE_PATH$)/i.test(key))delete process.env[key];
process.env.NODE_ENV='production';
const stateFile=path.join(runtime,'session.json');
let server,ownState;
function clearState(){
 try{if(JSON.parse(fs.readFileSync(stateFile)).runId===runId)fs.unlinkSync(stateFile);}catch{}
}
process.once('exit',clearState);
function shutdown(){
 server?.close(()=>process.exit(0));
 setTimeout(()=>{server?.closeAllConnections();process.exit(0);},1500).unref();
}
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
try {
 const {express,createApp}=await import('../app/backend.mjs');
 const app=express(),token=randomBytes(32).toString('hex');
 const authorized=req=>{
  const supplied=Buffer.from(req.get('x-packtruth-control')||'');
  const expected=Buffer.from(token);
  return supplied.length===expected.length && timingSafeEqual(supplied,expected);
 };
 app.disable('x-powered-by');
 app.use((req,res,next)=>{
  const expected='127.0.0.1:'+server.address().port;
  if(req.get('host')!==expected)return res.status(403).json({ok:false,error:{code:'LOCAL_HOST_ONLY',message:'仅允许本机访问'}});
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method==='GET' && req.path==='/' && /Chrome|Edg|Firefox/.test(req.get('user-agent')||'') && ownState && !ownState.browserPageSeen){
   ownState.browserPageSeen=true;
   try{fs.writeFileSync(stateFile,JSON.stringify(ownState),{mode:0o600});}catch{}
  }
  next();
 });
 app.get('/__packtruth/ready',(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!authorized(req))return res.sendStatus(403);
  res.json({service:'PackTruthPortable',runId,pid:process.pid});
 });
 app.post('/__packtruth/stop',(req,res)=>{
  if(!authorized(req)||req.get('origin')||req.get('sec-fetch-site')==='cross-site')return res.sendStatus(403);
  res.json({ok:true});setImmediate(shutdown);
 });
 app.use('/__packtruth',(_req,res)=>res.sendStatus(404));
 // Plain HTTP is confined to loopback. The original production HTTPS policy is
 // unchanged for other deployments; all other BYOK checks remain enabled here.
 app.use(createApp({production:false}));
 const web=path.join(root,'app','web');
 app.use(express.static(web,{dotfiles:'deny',index:false}));
 app.use((req,res)=>{
  if(req.method==='GET' && !path.extname(req.path) && req.accepts('html'))return res.sendFile(path.join(web,'index.html'));
  res.status(404).send('文件或接口不存在');
 });
 for(let port=8787;port<=8797;port++){
  const result=await new Promise((resolve,reject)=>{
   const candidate=createServer(app);
   candidate.once('error',err=>err.code==='EADDRINUSE'?resolve(null):reject(err));
   candidate.listen(port,'127.0.0.1',()=>resolve(candidate));
  });
  if(result){server=result;break;}
 }
 if(!server)throw Object.assign(new Error(),{code:'PORTS_BUSY'});
 const port=server.address().port,url='http://127.0.0.1:'+port;
 process.env.PUBLIC_ORIGIN=url;
 ownState={root,runId,pid:process.pid,port,url,token,startedAt:new Date().toISOString()};
 fs.writeFileSync(stateFile,JSON.stringify(ownState),{mode:0o600});
} catch(err) {
 fs.writeFileSync(path.join(runtime,'startup-error.json'),JSON.stringify({runId,code:err.code==='PORTS_BUSY'?'PORTS_BUSY':'RUNTIME_FAILED'}));
 process.exit(1);
}
