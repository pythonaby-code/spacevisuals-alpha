import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from './server.mjs';
import {membership} from './membership.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'sv-membership-'));
const keys=crypto.generateKeyPairSync('ed25519');
const issuerPrivate=path.join(root,'test-private.pem'),issuerPublic=path.join(root,'test-public.der'),identityFile=path.join(root,'accounts.json'),downloadFile=path.join(root,'fixture.zip');
fs.writeFileSync(issuerPrivate,keys.privateKey.export({type:'pkcs8',format:'pem'}));fs.writeFileSync(issuerPublic,keys.publicKey.export({type:'spki',format:'der'}));fs.writeFileSync(downloadFile,crypto.randomBytes(50000));
const password='12345abcde',salt=crypto.randomBytes(16).toString('hex'),hash=crypto.scryptSync(password,salt,64).toString('hex');
fs.writeFileSync(identityFile,JSON.stringify({launcher10:{nick:'Launcher10',salt,hash}}));
const options={dataDirectory:root,identityFile,downloadFile,issuerPrivate,issuerPublic};
let server=createApp(options);server.listen(0,'127.0.0.1');await once(server,'listening');let base='http://127.0.0.1:'+server.address().port;
const db=new DatabaseSync(path.join(root,'site.sqlite'));db.exec('PRAGMA foreign_keys=ON;');const member=membership(db,{issuerPrivate,issuerPublic});
async function request(route,{method='GET',data,cookie='',csrf='',range}={}){const response=await fetch(base+route,{method,headers:{origin:base,...(cookie?{cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(range?{range}:{}),...(data?{'content-type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});return response;}
async function auth(name,{register=true,invite}={}){const r=await request('/api/'+(register?'register':'login'),{method:'POST',data:{name,password,...(invite?{invite}:{})}});assert.equal(r.status,200,await r.clone().text());const data=await r.json();return{...data,cookie:r.headers.get('set-cookie').split(';')[0]};}
async function download(user,extra={}){const r=await request('/downloads/SpaceClient-Alpha-Windows.zip',{cookie:user?.cookie,...extra});await r.arrayBuffer();return r.status;}
try{
 const legacy=await auth('Launcher10',{register:false});assert.equal(legacy.user.name,'Launcher10');assert.equal(fs.readFileSync(identityFile,'utf8'),JSON.stringify({launcher10:{nick:'Launcher10',salt,hash}}));
 const friend=await auth('FriendUser',{invite:member.createInvite()});assert.equal(friend.friend,true);const shared=JSON.parse(fs.readFileSync(identityFile,'utf8'));assert.deepEqual(shared.launcher10,{nick:'Launcher10',salt,hash});assert.equal(shared.frienduser.nick,'FriendUser');
 const require=createRequire(import.meta.url);const store=require('./tests/launcher/storage.cjs');assert.equal(store.authenticate(identityFile,{nick:'FriendUser',password,register:false}).nick,'FriendUser');assert(fs.readdirSync(root).some(x=>x.includes('.before-site-')));
 const a=await auth('FirstUser'),b=await auth('SecondUser');await download(a);assert.equal(member.info(a.user.id).plan,'free');assert.deepEqual(member.status(),{active:false,claimed:false});
 member.manual({id:friend.user.id,name:friend.user.name},30,true);assert.equal(member.status().claimed,false);member.enable();
 await download(null);await download(friend);assert.equal(member.status().claimed,false);
 assert.equal(await download(a,{method:'HEAD'}),200);assert.equal(await download(a,{range:'bytes=0-99'}),206);assert.equal(member.status().claimed,false);
 await Promise.all([download(a),download(b)]);const pro=[a,b].filter(u=>member.info(u.user.id).plan==='pro');assert.equal(pro.length,1);const winner=pro[0],expires=member.info(winner.user.id).expires;await download(winner);assert.equal(member.info(winner.user.id).expires,expires);assert.equal(member.status().claimed,true);
 const licence=member.licence(winner.user.id),verify=require('./tests/launcher/pro-license.cjs').verify;const decoded=verify(Buffer.from(licence),fs.readFileSync(issuerPublic));assert.equal(decoded.sub,winner.user.name);assert.equal(decoded.expires,expires);
 const noCsrf=await request('/api/invite',{method:'POST',cookie:a.cookie,data:{invite:member.createInvite()}});assert.equal(noCsrf.status,403);
 const oneTime=member.createInvite();member.claimInvite(oneTime,friend.user.id);assert.throws(()=>member.claimInvite(oneTime,b.user.id));assert.throws(()=>member.enable());
 const refused=await request('/api/checkout',{method:'POST',cookie:a.cookie,csrf:a.csrf,data:{}});assert.equal(refused.status,503);
 const expired=db.prepare('SELECT * FROM subscriptions WHERE user_id=?').get(friend.user.id);db.prepare('UPDATE subscriptions SET expires=1 WHERE user_id=?').run(friend.user.id);assert.equal(member.info(friend.user.id).plan,'free');assert.equal(member.licence(friend.user.id),null);db.prepare('UPDATE subscriptions SET expires=? WHERE user_id=?').run(expired.expires,friend.user.id);
 await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()});server=createApp(options);server.listen(0,'127.0.0.1');await once(server,'listening');base='http://127.0.0.1:'+server.address().port;const persisted=await request('/api/session',{cookie:winner.cookie});assert.equal((await persisted.json()).plan,'pro');assert.equal(member.status().claimed,true);
 console.log('Проверено: пароль лаунчера из 10 символов; новый аккаунт сайта в лаунчере; сохранность записей и резервная копия; одноразовые приглашения; ручная выдача; исключение друзей; HEAD/Range/анонимные и проверочные скачивания; один победитель при гонке; подпись лицензии реальным кодом лаунчера; повтор без продления; перезапуск; истечение; CSRF; реальная оплата отключена.');
}finally{db.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()});}
