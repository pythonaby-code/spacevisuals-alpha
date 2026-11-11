import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(crypto.scrypt);
export function launcherStore(file){
 function load(){if(!fs.existsSync(file))return{};const data=JSON.parse(fs.readFileSync(file,'utf8'));if(!data||Array.isArray(data)||typeof data!=='object')throw Error('Хранилище аккаунтов лаунчера повреждено. Изменения не внесены.');return data;}
 function get(key){const data=load();if(!Object.hasOwn(data,key))return null;const record=data[key];if(!record||typeof record.nick!=='string'||record.nick.toLowerCase()!==key||!/^\w{3,16}$/.test(record.nick)||!/^[a-f0-9]{32}$/i.test(record.salt)||!/^[a-f0-9]{128}$/i.test(record.hash))throw Error('Не удалось проверить профиль лаунчера.');return record;}
 function add(record){fs.mkdirSync(path.dirname(file),{recursive:true});const lock=file+'.site-lock';let fd;try{fd=fs.openSync(lock,'wx');const data=load(),key=record.nick.toLowerCase();if(Object.hasOwn(data,key))throw Error('Такой ник уже зарегистрирован в лаунчере.');if(fs.existsSync(file))fs.copyFileSync(file,file+'.before-site-'+Date.now()+'.bak',fs.constants.COPYFILE_EXCL);const temp=file+'.site-'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(temp,JSON.stringify({...data,[key]:record},null,2),{mode:0o600,flag:'wx'});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}finally{if(fd!==undefined){fs.closeSync(fd);fs.unlinkSync(lock);}}}
 return{get,add};
}
export async function matches(password,record){const result=await scrypt(password,record?.salt||'invalid-user-padding',64);if(!record)return false;const expected=Buffer.from(record.hash,'hex');return expected.length===result.length&&crypto.timingSafeEqual(result,expected);}
