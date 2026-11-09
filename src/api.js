const enc=new TextEncoder();
const version={web:6,android:5};
const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,"0")).join("");
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const digest=async str=>hex(await crypto.subtle.digest("SHA-256",enc.encode(str)));
async function passwordHash(value,salt){
 const key=await crypto.subtle.importKey("raw",enc.encode(value),"PBKDF2",false,["deriveBits"]);
 return hex(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:enc.encode(salt),iterations:100000},key,256));
}
const today=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date());
const send=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store",...extra}});
const fail=(status,message)=>send({error:message},status);
const cookie=(value,age)=>"painel="+value+"; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age="+age;
function clean(row){
 if(!row||typeof row!=="object")throw new Error("Linha inválida.");
 const data={};
 for(const [key,max] of Object.entries({name:400,ean:14,price:20,original:20,condition:160,notes:500,model:30,columns:10,band:10,location:50,end:10,start:10,printed:10,source:300,page:160})){
  const v=row[key]??"";if(typeof v!=="string"||v.length>max)throw new Error("Confira "+key+".");data[key]=v.trim();
 }
 if(!data.name||!/^\d{4}-\d{2}-\d{2}$/.test(data.end)||new Date(data.end+"T12:00Z").toISOString().slice(0,10)!==data.end)throw new Error("Informe produto e data válida.");
 for(const key of ['price','original'])if(data[key]&&!/^\d{1,10},\d{2}$/.test(data[key]))throw new Error("Preço inválido.");
 for(const key of ['start','printed'])if(data[key]&&(!/^\d{4}-\d{2}-\d{2}$/.test(data[key])||new Date(data[key]+"T12:00Z").toISOString().slice(0,10)!==data[key]))throw new Error("Data inválida.");
 if(data.start&&data.start>data.end)throw new Error("O início deve ser anterior ao término.");
 if(data.ean&&!/^\d{8,14}$/.test(data.ean))throw new Error("EAN inválido.");
 return data;
}
async function run(req,env){
 const url=new URL(req.url),path=url.pathname,db=env.DB;
 if(path==="/app.apk")return new Response(Uint8Array.from(atob(APK),c=>c.charCodeAt(0)),{headers:{"content-type":"application/vnd.android.package-archive","content-disposition":"attachment; filename=Painel-da-loja.apk"}});
 if(["/","/index.html","/entrar","/cadastro","/conectar"].includes(path))return new Response(HTML,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"same-origin"}});
 if(path==="/versao")return send({...version,today:today()});
 if(!path.startsWith("/api/"))return fail(404,"Página não encontrada.");
 const code=req.headers.get("user-agent")?.match(/LojaAndroid\/(\d+)/);
 if((code&&Number(code[1])<version.android)||req.headers.get("X-Painel-Version")!==String(version.web))return fail(426,"Atualize o aplicativo.");
 let input={};
 if(req.method==="POST"){
  if(req.headers.get("origin")&&req.headers.get("origin")!==url.origin&&req.headers.get("origin")!=="https://kyrexn.github.io")return fail(403,"Origem inválida.");
  if(!req.headers.get("content-type")?.startsWith("application/json"))return fail(415,"Conteúdo inválido.");
  if(Number(req.headers.get("content-length"))>5000000)return fail(413,"Arquivo muito grande.");
  try{const raw=await req.text();if(raw.length>5000000)return fail(413,"Importação muito grande.");input=JSON.parse(raw)}catch{return fail(400,"Pedido inválido.")}
  if(!input||typeof input!=="object")return fail(400,"Pedido inválido.");
 }
 const now=Math.floor(Date.now()/1000);
 if(req.method==="POST"&&["/api/cadastrar","/api/entrar"].includes(path)){
  const email=String(input.email||"").trim().toLowerCase(),pw=input.password;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof pw!=="string"||pw.length>256)return fail(400,"Confira o e-mail e a senha.");
  const ip=req.headers.get("cf-connecting-ip")||"local";
  const bucket=await digest(ip+":"+Math.floor(now/600));
  await db.prepare("DELETE FROM attempts WHERE expires<?").bind(now).run();
  const limit=await db.prepare("INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count").bind(bucket,now+600).first();
  if(limit.count>40)return fail(429,"Aguarde alguns minutos para tentar novamente.");
  let user;
  if(path.endsWith("cadastrar")){
   const name=String(input.name||"").trim();
   if(!name||name.length>80||pw.length<8)return fail(400,"Informe seu nome e use pelo menos oito caracteres na senha.");
   const id=crypto.randomUUID(),salt=random(),hash=await passwordHash(pw,salt);
   try{await db.batch([db.prepare("INSERT INTO users VALUES(?,?,?,?,?)").bind(id,email,name,salt,hash),db.prepare("INSERT INTO members VALUES(?,?)").bind(id,id)])}
   catch(e){if(String(e).includes("UNIQUE"))return fail(409,"Este e-mail já tem uma conta. Entre com sua senha.");throw e;}
   user={id,email,name};
  }else{
   user=await db.prepare("SELECT * FROM users WHERE email=?").bind(email).first();
   const hash=await passwordHash(pw,user?.salt||"0".repeat(64));
   if(!user||hash!==user.password)return fail(401,"E-mail ou senha incorretos.");
  }
  const token=random();await db.batch([db.prepare("DELETE FROM sessions WHERE expires<?").bind(now),db.prepare("INSERT INTO sessions VALUES(?,?,?)").bind(await digest(token),user.id,now+604800)]);
  return send({email:user.email,name:user.name,...(req.headers.get("origin")==="https://kyrexn.github.io"?{token}: {})},200,{"set-cookie":cookie(token,604800)});
 }
 const token=req.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]||req.headers.get("cookie")?.match(/(?:^|;\s*)painel=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(!token)return fail(401,"Entre com sua conta.");
 const hashed=await digest(token);
 const user=await db.prepare("SELECT u.id,u.name,u.email FROM sessions s JOIN users u ON u.id=s.uid WHERE s.hash=? AND s.expires>?").bind(hashed,now).first();
 if(!user)return fail(401,"Entre com sua conta.");
 if(path==="/api/sessao"&&req.method==="GET")return send(user);
 if(path==="/api/sair"&&req.method==="POST"){await db.prepare("DELETE FROM sessions WHERE hash=?").bind(hashed).run();return send({},200,{"set-cookie":cookie("",0)})}
 if(path==="/api/paineis"&&req.method==="GET"){
  const {results}=await db.prepare("SELECT u.id,u.name,u.email FROM members m JOIN users u ON u.id=m.owner WHERE m.uid=? ORDER BY u.name").bind(user.id).all();return send({own:user.id,items:results});
 }
 if(path==="/api/equipe"&&req.method==="POST"){
  const colleague=await db.prepare("SELECT id FROM users WHERE email=?").bind(String(input.email||"").trim().toLowerCase()).first();
  if(!colleague)return fail(404,"Esse e-mail precisa ter uma conta cadastrada.");
  await db.prepare("INSERT OR IGNORE INTO members VALUES(?,?)").bind(user.id,colleague.id).run();return send({});
 }
 const owner=req.headers.get("X-Painel-Loja")||user.id;
 if(!await db.prepare("SELECT 1 AS ok FROM members WHERE owner=? AND uid=?").bind(owner,user.id).first())return fail(403,"Este painel não está disponível para sua conta.");
 if(path==="/api/limpar-programadas"&&req.method==="POST"){
  if(input.confirmation!=="APAGAR")return fail(400,"Digite APAGAR para confirmar.");
  const result=await db.prepare("DELETE FROM offers WHERE owner=?").bind(owner).run();
  return send({removed:result.meta.changes,today:today()});
 }
 if(path==="/api/ofertas"&&["GET","POST"].includes(req.method)){
  const day=today();
  await db.prepare("DELETE FROM offers WHERE end<?").bind(day).run();
  if(req.method==="POST"){
   if(!Array.isArray(input.rows)||!input.rows.length||input.rows.length>5000)return fail(400,"Confira a quantidade de linhas.");
   let rows;try{rows=input.rows.map(clean).filter(row=>row.end>=day)}catch(e){return fail(400,"Confira os nomes, preços e datas da importação.")}
   if(!rows.length)return fail(400,"Essas promoções já terminaram.");
   const stmts=[];for(let i=0;i<rows.length;i+=20){
    const chunk=rows.slice(i,i+20);
    stmts.push(db.prepare("INSERT OR REPLACE INTO offers VALUES "+chunk.map(()=>"(?,?,?,?)").join(",")).bind(...chunk.flatMap(r=>[owner,JSON.stringify([r.ean||r.name.toUpperCase(),r.start,r.end,r.price,...(r.condition?[r.condition]:[]),...(r.band?[r.band]:[]),...(r.model?[r.model]:[])]),r.end,JSON.stringify(r)])));
   }await db.batch(stmts);
  }
  const {results}=await db.prepare("SELECT data FROM offers WHERE owner=? AND end>=? ORDER BY end,id").bind(owner,day).all();
  return send({rows:results.map(r=>JSON.parse(r.data)),today:day});
 }
 return fail(404,"Não encontrado.");
}
export default {async fetch(req,env){
 const origin=req.headers.get("origin");
 const permitted=origin==="https://kyrexn.github.io";
 if(req.method==="OPTIONS")return permitted?new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization, X-Painel-Version, X-Painel-Loja","Vary":"Origin"}}):fail(403,"Origem inválida.");
 let reply;try{reply=await run(req,env)}catch(e){console.error(String(e));reply=fail(500,"Não foi possível concluir. Tente novamente.")}
 if(permitted){reply=new Response(reply.body,reply);reply.headers.set("Access-Control-Allow-Origin",origin);reply.headers.set("Vary","Origin")}
 return reply;
}};
