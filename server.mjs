import http from "node:http";
import pg from "pg";
import {readFileSync} from "node:fs";
import {randomBytes} from "node:crypto";

const db = new pg.Pool({connectionString:process.env.DATABASE_URL});
await db.query("CREATE TABLE IF NOT EXISTS room(id integer PRIMARY KEY,token text NOT NULL); CREATE TABLE IF NOT EXISTS claim(room integer NOT NULL,task integer NOT NULL CHECK(task BETWEEN 1 AND 5),name text NOT NULL,normalized text NOT NULL,device text NOT NULL,PRIMARY KEY(room,task),UNIQUE(room,normalized),UNIQUE(room,device));");
for (const id of [1,2]) await db.query("INSERT INTO room VALUES($1,$2) ON CONFLICT DO NOTHING",[id,randomBytes(18).toString("base64url")]);
const rooms = new Map((await db.query("SELECT token,id FROM room")).rows.map(r=>[r.token,r.id]));
const key = [...rooms].find(([,id])=>id===1)[0];
const list = async(room)=>(await db.query("SELECT task,name FROM claim WHERE room=$1 ORDER BY task",[room])).rows;
const assets = new Map([["/",["index.html","text/html;charset=utf-8"]],["/app.js",["app.js","text/javascript;charset=utf-8"]],["/style.css",["style.css","text/css;charset=utf-8"]]]);
http.createServer(async(req,res)=>{
  const url=new URL(req.url,"http://localhost");
  const reply=(status,data)=>{res.writeHead(status,{"Content-Type":"application/json;charset=utf-8","Cache-Control":"no-store"});res.end(JSON.stringify(data));};
  try {
    if(url.pathname==="/api/claims"){
      const room=rooms.get(req.headers["x-room-key"]);
      if(!room)return reply(403,{message:"请扫码进入"});
      if(req.method==="GET")return reply(200,{claims:await list(room)});
      if(req.method!=="POST")return reply(405,{});
      let raw="";
      for await(const chunk of req){raw+=chunk;if(raw.length>2048)return reply(413,{});}
      const {task,name:input,device}=JSON.parse(raw);
      const name=typeof input==="string"?input.normalize("NFKC").trim().replace(/\s+/gu," "):"";
      if(!Number.isInteger(task)||task<1||task>5||!/^\p{L}[\p{L}\p{M} .'·’-]{0,29}$/u.test(name)||typeof device!=="string"||!/^[0-9a-f-]{36}$/.test(device))return reply(400,{message:"请检查姓名和任务"});
      const saved=(await db.query("INSERT INTO claim VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",[room,task,name,name.toLowerCase().replace(/[\s.'·’-]/gu,""),device])).rowCount;
      return reply(saved?201:409,{claims:await list(room),message:saved?"认领成功":"任务已锁定，或该姓名、浏览器已认领"});
    }
    if(url.pathname==="/"&&!url.searchParams.has("room")){res.writeHead(302,{Location:"/?room="+key,"Cache-Control":"no-store"});return res.end();}
    const asset=assets.get(url.pathname);
    if(!asset)return reply(404,{});
    res.writeHead(200,{"Content-Type":asset[1],"Referrer-Policy":"no-referrer"});
    res.end(readFileSync(new URL("./public/"+asset[0],import.meta.url)));
  }catch{if(!res.headersSent)reply(400,{message:"请求未完成"});}
}).listen(Number(process.env.PORT)||3000,"0.0.0.0");
