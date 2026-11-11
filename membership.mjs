import crypto from 'node:crypto';
import fs from 'node:fs';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
export function membership(db,{issuerPrivate,issuerPublic}){
 db.exec(`CREATE TABLE IF NOT EXISTS membership_flags(user_id TEXT PRIMARY KEY REFERENCES users(id),friend INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS friend_invites(token_hash TEXT PRIMARY KEY,created INTEGER NOT NULL,expires INTEGER NOT NULL,used_by TEXT REFERENCES users(id));
 CREATE TABLE IF NOT EXISTS subscriptions(user_id TEXT PRIMARY KEY REFERENCES users(id),expires INTEGER NOT NULL,source TEXT NOT NULL,licence TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS promotion(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL DEFAULT 0,winner TEXT REFERENCES users(id));
 INSERT OR IGNORE INTO promotion(id) VALUES(1);
 CREATE TABLE IF NOT EXISTS membership_audit(id INTEGER PRIMARY KEY,action TEXT NOT NULL,user_id TEXT,at INTEGER NOT NULL);`);
 const now=()=>Math.floor(Date.now()/1000);
 function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}
 function keyPair(){const privateKey=crypto.createPrivateKey(fs.readFileSync(issuerPrivate));const publicKey=crypto.createPublicKey({key:fs.readFileSync(issuerPublic),format:'der',type:'spki'});const probe=Buffer.from('SpaceVisuals issuer check');if(!crypto.verify(null,probe,publicKey,crypto.sign(null,probe,privateKey)))throw Error('Ключи издателя не совпадают.');return privateKey;}
 function audit(action,id){db.prepare('INSERT INTO membership_audit(action,user_id,at) VALUES(?,?,?)').run(action,id||null,now());}
 function friend(id){return !!db.prepare('SELECT friend FROM membership_flags WHERE user_id=?').get(id)?.friend;}
 function info(id){const sub=db.prepare('SELECT expires,source FROM subscriptions WHERE user_id=?').get(id);return{plan:sub&&sub.expires>now()?'pro':'free',expires:sub?.expires||null,source:sub?.source||null,friend:friend(id)};}
 function sign(user,days,source){const old=db.prepare('SELECT expires FROM subscriptions WHERE user_id=?').get(user.id);const expires=Math.max(now(),old?.expires||0)+days*86400;const payload=Buffer.from(JSON.stringify({v:1,id:crypto.randomUUID(),sub:user.name,expires,features:['themes','cosmetics','hud','photo','profiles','workshop']}));const licence={payload:payload.toString('base64url'),signature:crypto.sign(null,payload,keyPair()).toString('base64url')};db.prepare('INSERT INTO subscriptions VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET expires=excluded.expires,source=excluded.source,licence=excluded.licence').run(user.id,expires,source,JSON.stringify(licence));audit('grant:'+source,user.id);return info(user.id);}
 function claimInvite(token,userId){if(typeof token!=='string'||!/^[a-f0-9]{48}$/.test(token))throw Error('Приглашение недействительно.');return transaction(()=>{const row=db.prepare('SELECT * FROM friend_invites WHERE token_hash=?').get(hash(token));if(!row||row.expires<now()||(row.used_by&&row.used_by!==userId))throw Error('Приглашение уже использовано или срок действия истёк.');if(db.prepare('SELECT winner FROM promotion WHERE id=1').get().winner===userId)throw Error('Подарок уже получен. Этот аккаунт нельзя исключить из завершённой акции.');db.prepare('UPDATE friend_invites SET used_by=? WHERE token_hash=?').run(userId,hash(token));db.prepare('INSERT INTO membership_flags VALUES(?,1) ON CONFLICT(user_id) DO UPDATE SET friend=1').run(userId);audit('friend:invite',userId);return info(userId);});}
 function completeDownload(user){return transaction(()=>{const promo=db.prepare('SELECT * FROM promotion WHERE id=1').get();if(!promo.enabled||promo.winner||friend(user.id))return false;sign(user,30,'first-download');db.prepare('UPDATE promotion SET winner=?,enabled=0 WHERE id=1').run(user.id);return true;});}
 function createInvite(){const token=crypto.randomBytes(24).toString('hex');db.prepare('INSERT INTO friend_invites VALUES(?,?,?,NULL)').run(hash(token),now(),now()+30*86400);audit('invite:create');return token;}
 function enable(){keyPair();transaction(()=>{const promo=db.prepare('SELECT * FROM promotion WHERE id=1').get();if(promo.winner)throw Error('Победитель уже определён. Повторный розыгрыш отключён.');db.prepare('UPDATE promotion SET enabled=1 WHERE id=1').run();audit('promotion:enable');});}
 function status(){const row=db.prepare('SELECT enabled,winner FROM promotion WHERE id=1').get();return{active:!!row.enabled,claimed:!!row.winner};}
 function manual(user,days,asFriend=true){if(!Number.isInteger(days)||days<1||days>3660)throw Error('Срок: от 1 до 3660 дней.');return transaction(()=>{if(asFriend){if(db.prepare('SELECT winner FROM promotion WHERE id=1').get().winner===user.id)throw Error('Победитель уже получил подарок; используй продление без отметки друга.');db.prepare('INSERT INTO membership_flags VALUES(?,1) ON CONFLICT(user_id) DO UPDATE SET friend=1').run(user.id);}return sign(user,days,'manual');});}
 function licence(id){const row=db.prepare('SELECT licence,expires FROM subscriptions WHERE user_id=?').get(id);return row&&row.expires>now()?row.licence:null;}
 function disable(){db.prepare('UPDATE promotion SET enabled=0 WHERE id=1').run();audit('promotion:disable');}
 return{info,claimInvite,completeDownload,createInvite,enable,disable,status,manual,licence};
}
