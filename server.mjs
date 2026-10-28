import http from 'node:http';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import path from 'node:path';
mkdirSync('data',{recursive:true});
const db=new DatabaseSync('data/store.sqlite');
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,price INTEGER NOT NULL,stock INTEGER NOT NULL,image TEXT NOT NULL,color TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,created TEXT NOT NULL,name TEXT NOT NULL,email TEXT NOT NULL,address TEXT NOT NULL,total INTEGER NOT NULL,status TEXT NOT NULL,items TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,created TEXT NOT NULL,action TEXT NOT NULL);`);
if(!db.prepare('SELECT count(*) n FROM products').get().n){const add=db.prepare('INSERT INTO products(name,category,price,stock,image,color) VALUES(?,?,?,?,?,?)');
for(const p of [['Sculpted Essential Tee','Essentials',149900,42,'photo-1521572163474-6864f9cf17ab','#c9bba6'],['Everyday Oversized Shirt','Shirts',249900,28,'photo-1596755094514-f87e34085b2c','#a9b7ac'],['The Signature Hoodie','Outerwear',329900,19,'photo-1556821840-3a63f95609a7','#a9a39a'],['Relaxed Studio Tee','Essentials',179900,35,'photo-1503341504253-dff4815485f1','#d1b7a6'],['Tailored Linen Shirt','Shirts',289900,16,'photo-1602810318383-e386cc2a3ccf','#d2c7b5'],['Weekend Layer Jacket','Outerwear',549900,12,'photo-1544022613-e87ca75a784a','#828e83']])add.run(...p);}
const sessions=new Map(),limits=new Map();
mkdirSync('data/uploads',{recursive:true});
for(const column of ['front','back'])if(!db.prepare('PRAGMA table_info(products)').all().some(c=>c.name===column))db.exec(`ALTER TABLE products ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
const validPhoto=x=>x===''||/^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(x)&&existsSync(path.join('data',x));
const adminPassword=process.env.ADMIN_PASSWORD||randomBytes(18).toString('base64url');
const salt=randomBytes(16),hash=scryptSync(adminPassword,salt,64);
if(!process.env.ADMIN_PASSWORD) console.log(`Temporary admin: admin@example.com / ${adminPassword}`);
function audit(action){db.prepare('INSERT INTO audit(created,action) VALUES(?,?)').run(new Date().toISOString(),action);}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));}
async function body(req){let s='';const max=req.url==='/api/admin/upload'?8500000:32000;for await(const c of req){s+=c;if(s.length>max)throw Error('Request too large');}return JSON.parse(s||'{}');}
const emailOK=x=>typeof x==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)&&x.length<200;
const clean=(x,n=200)=>typeof x==='string'&&x.trim().length>0&&x.length<=n;
const server=http.createServer(async(req,res)=>{
res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' https://images.unsplash.com; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
const url=new URL(req.url,'http://localhost'),p=url.pathname;
try{
if(p.startsWith('/api/')){
res.setHeader('Cache-Control','no-store');
if(!['GET','HEAD'].includes(req.method)&&req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`)return json(res,403,{error:'Origin rejected'});
const ip=req.socket.remoteAddress,now=Date.now(),rate=limits.get(ip)||{time:now,n:0};if(now-rate.time>60000){rate.time=now;rate.n=0;}limits.set(ip,rate);if(++rate.n>150)return json(res,429,{error:'Too many requests. Please wait.'});
const token=req.headers.cookie?.match(/(?:^|; )session=([^;]+)/)?.[1],session=sessions.get(token);
const admin=session&&session.expires>now;
if(p==='/api/products'&&req.method==='GET')return json(res,200,db.prepare('SELECT * FROM products').all());
if(p==='/api/session'&&req.method==='GET')return json(res,200,{admin:!!admin,csrf:admin?session.csrf:null,paymentMode:'demo'});
if(p==='/api/login'&&req.method==='POST'){
 if(rate.n>20)return json(res,429,{error:'Login limit reached. Wait a minute.'});const b=await body(req);if(b.email!==(process.env.ADMIN_EMAIL||'admin@example.com')||typeof b.password!=='string'||b.password.length>200||!timingSafeEqual(scryptSync(b.password,salt,64),hash))return json(res,401,{error:'Invalid credentials'});
 const t=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');sessions.set(t,{expires:now+8*3600000,csrf});res.setHeader('Set-Cookie',`session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV==='production'?'; Secure':''}`);audit('Admin login');return json(res,200,{csrf});}
if(p.startsWith('/api/admin/')||p==='/api/logout'){
if(!admin)return json(res,401,{error:'Please sign in'});if(req.method!=='GET'&&req.headers['x-csrf-token']!==session.csrf)return json(res,403,{error:'Invalid security token'});
if(p==='/api/logout'){sessions.delete(token);res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true});}
if(p==='/api/admin/orders'&&req.method==='GET')return json(res,200,db.prepare('SELECT * FROM orders ORDER BY created DESC').all().map(o=>({...o,items:JSON.parse(o.items)})));
if(p==='/api/admin/audit'&&req.method==='GET')return json(res,200,db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 30').all());
if(p==='/api/admin/upload'&&req.method==='POST'){const b=await body(req);if(typeof b.data!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.data))return json(res,400,{error:'Upload a JPEG, PNG or WebP image'});const type=b.data.slice(11,b.data.indexOf(';')),buffer=Buffer.from(b.data.split(',')[1],'base64');if(buffer.length>6*1024*1024||buffer.length<12)return json(res,400,{error:'Image must be smaller than 6 MB'});const valid=type==='jpeg'?buffer[0]===255&&buffer[1]===216&&buffer[2]===255:type==='png'?buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP';if(!valid)return json(res,400,{error:'Invalid image file'});const name=randomBytes(16).toString('hex')+'.'+(type==='jpeg'?'jpg':type);writeFileSync(path.join('data/uploads',name),buffer,{flag:'wx'});audit('Product photo uploaded');return json(res,201,{url:'/uploads/'+name});}
if(p==='/api/admin/product-photos'&&req.method==='POST'){const b=await body(req);if(!Number.isInteger(b.id)||!validPhoto(b.front)||!validPhoto(b.back))return json(res,400,{error:'Invalid product photos'});if(!db.prepare('SELECT id FROM products WHERE id=?').get(b.id))return json(res,404,{error:'Product not found'});db.prepare('UPDATE products SET front=?,back=? WHERE id=?').run(b.front,b.back,b.id);audit('Front/back preview updated: '+b.id);return json(res,200,{ok:true});}
if(p==='/api/admin/products'&&req.method==='POST'){const b=await body(req);if(!clean(b.name,100)||!['Essentials','Shirts','Outerwear'].includes(b.category)||!Number.isSafeInteger(b.price)||b.price<100||b.price>100000000||!Number.isInteger(b.stock)||b.stock<0||b.stock>100000||!/^photo-[a-zA-Z0-9-]+$/.test(b.image)||!/^#[a-fA-F0-9]{6}$/.test(b.color))return json(res,400,{error:'Check all product fields'});if(b.id){db.prepare('UPDATE products SET name=?,category=?,price=?,stock=?,image=?,color=? WHERE id=?').run(b.name,b.category,b.price,b.stock,b.image,b.color,b.id);}else db.prepare('INSERT INTO products(name,category,price,stock,image,color) VALUES(?,?,?,?,?,?)').run(b.name,b.category,b.price,b.stock,b.image,b.color);const savedId=b.id||Number(db.prepare('SELECT last_insert_rowid() id').get().id);audit('Product saved: '+b.name);return json(res,200,{ok:true,id:savedId});}
if(p==='/api/admin/orders'&&req.method==='PATCH'){const b=await body(req);if(!['Confirmed','Packed','Shipped','Delivered','Cancelled'].includes(b.status))return json(res,400,{error:'Invalid status'});const order=db.prepare('SELECT * FROM orders WHERE id=?').get(b.id);if(!order)return json(res,404,{error:'Order not found'});if(order.status==='Cancelled')return json(res,400,{error:'Cancelled orders cannot be reopened'});db.exec('BEGIN IMMEDIATE');try{if(b.status==='Cancelled')for(const i of JSON.parse(order.items))db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(i.quantity,i.id);db.prepare('UPDATE orders SET status=? WHERE id=?').run(b.status,b.id);audit('Order '+b.id+': '+b.status);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return json(res,200,{ok:true});}
}
if(p==='/api/orders'&&req.method==='POST'){const b=await body(req);if(!clean(b.name,100)||!emailOK(b.email)||!clean(b.address,800)||!Array.isArray(b.items)||!b.items.length||b.items.length>30)return json(res,400,{error:'Enter valid contact, address and cart details'});
db.exec('BEGIN IMMEDIATE');try{let total=0;const items=[];const seen=new Set();for(const i of b.items){if(seen.has(i.id)||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>10||!['XS','S','M','L','XL'].includes(i.size))throw Error('Invalid cart');seen.add(i.id);const product=db.prepare('SELECT * FROM products WHERE id=?').get(i.id);if(!product||product.stock<i.quantity)throw Error('Product out of stock');items.push({id:product.id,name:product.name,price:product.price,quantity:i.quantity,size:i.size});total+=product.price*i.quantity;db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(i.quantity,i.id);}
const id='AT-'+randomBytes(5).toString('hex').toUpperCase();db.prepare('INSERT INTO orders VALUES(?,?,?,?,?,?,?,?)').run(id,new Date().toISOString(),b.name.trim(),b.email,b.address.trim(),total,'Confirmed',JSON.stringify(items));audit('Demo order created: '+id);db.exec('COMMIT');return json(res,201,{id,total,mode:'demo'});}catch(e){db.exec('ROLLBACK');return json(res,400,{error:e.message});}}
return json(res,404,{error:'Not found'});
}
if(/^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(p)){const f=path.join('data',p);if(!existsSync(f)){res.writeHead(404);return res.end('Not found');}res.setHeader('Content-Type',p.endsWith('.jpg')?'image/jpeg':p.endsWith('.png')?'image/png':'image/webp');res.setHeader('Cache-Control','public, max-age=86400');return res.end(readFileSync(f));}
const file=p==='/'?'/index.html':p==='/admin'?'/admin.html':p;
if(!['/index.html','/admin.html','/style.css','/app.js','/admin.js','/rack.js'].includes(file)){res.writeHead(404);return res.end('Not found');}
res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html');res.end(readFileSync(path.join('public',file)));
}catch(e){json(res,400,{error:'Unable to process request'});}});
server.listen(Number(process.env.PORT)||3000,process.env.HOST||'127.0.0.1',()=>console.log('Store: http://localhost:'+(process.env.PORT||3000)));
