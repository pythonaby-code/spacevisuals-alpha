import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import {membership} from './membership.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const directory=process.env.SITE_DATA||path.join(here,'.data');
if(!fs.existsSync(path.join(directory,'site.sqlite')))throw Error('Сначала запусти сервер сайта.');
const db=new DatabaseSync(path.join(directory,'site.sqlite'));db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
const keys=path.resolve(here,'../SpaceVeyraClients/ProService/data');
const member=membership(db,{issuerPrivate:process.env.SITE_ISSUER_PRIVATE||path.join(keys,'issuer-private.pem'),issuerPublic:process.env.SITE_ISSUER_PUBLIC||path.join(keys,'issuer-public.der')});
try{const [action,name,days]=process.argv.slice(2);if(action==='invite'){const token=member.createInvite();const base=process.env.SITE_PUBLIC_URL||'http://localhost:4187';console.log(new URL('/profile.html#invite='+token,base).href);}else if(action==='status'){console.log(JSON.stringify(member.status()));}else if(action==='enable-gift'){member.enable();console.log('Подарок первому скачавшему включён.');}else if(action==='disable-gift'){member.disable();console.log('Акция приостановлена. Победитель сохранён.');}else if(action==='grant-friend'||action==='extend'){const user=db.prepare('SELECT id,name FROM users WHERE name_key=?').get((name||'').toLowerCase());if(!user)throw Error('Аккаунт не найден. Друг должен сначала войти по приглашению.');const result=member.manual(user,Number(days||30),action==='grant-friend');console.log('Pro выдан до '+new Date(result.expires*1000).toLocaleDateString('ru-RU'));}else throw Error('Команды: invite, status, enable-gift, disable-gift, grant-friend <ник> [дни], extend <ник> [дни]');}finally{db.close();}
