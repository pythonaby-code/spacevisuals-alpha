const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function read(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw new Error('Не удалось прочитать '+path.basename(file)+'. Файл сохранён для восстановления.');}}
function write(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,2),'utf8');fs.renameSync(tmp,file);}
function authenticate(file,{nick,password,register}){
 if(typeof nick!=='string'||!/^\w{3,16}$/.test(nick))throw Error('Ник: 3–16 латинских букв, цифр или знаков подчёркивания.');
 if(typeof password!=='string'||password.length<8||password.length>128)throw Error('Пароль: от 8 до 128 символов.');
 const accounts=read(file,{}),key=nick.toLowerCase(),account=accounts[key];
 if(register){if(account)throw Error('Такой профиль уже есть.');const salt=crypto.randomBytes(16).toString('hex');accounts[key]={nick,salt,hash:crypto.scryptSync(password,salt,64).toString('hex')};write(file,accounts);return {nick,kind:'local'};}
 if(!account)throw Error('Неверный ник или пароль.');
 const hash=crypto.scryptSync(password,account.salt,64),saved=Buffer.from(account.hash,'hex');
 if(hash.length!==saved.length||!crypto.timingSafeEqual(hash,saved))throw Error('Неверный ник или пароль.');
 return {nick:account.nick,kind:'local'};
}
function copyWorlds(source,dest){
 source=fs.realpathSync(source);dest=path.resolve(dest);
 let ancestor=dest,tail=[];while(!fs.existsSync(ancestor)){tail.unshift(path.basename(ancestor));const parent=path.dirname(ancestor);if(parent===ancestor)throw Error('Не удалось определить папку назначения.');ancestor=parent;}
 dest=path.join(fs.realpathSync(ancestor),...tail);
 const inside=(a,b)=>{const relative=path.relative(a,b);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};
 if(inside(source,dest)||inside(dest,source))throw Error('Выбери разные, не вложенные друг в друга папки миров.');
 fs.mkdirSync(dest,{recursive:true});
 const worlds=fs.existsSync(path.join(source,'level.dat'))?[source]:fs.readdirSync(source,{withFileTypes:true}).filter(e=>e.isDirectory()&&!e.isSymbolicLink()&&fs.existsSync(path.join(source,e.name,'level.dat'))).map(e=>path.join(source,e.name));
 if(!worlds.length)throw Error('В выбранной папке нет миров с level.dat.');
 // Reject links before creating a copy, so a world cannot point outside itself.
 function check(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('В мире есть ссылка на другую папку. Копирование отменено.');if(e.isDirectory())check(path.join(dir,e.name));}}
 worlds.forEach(check);
 const copied=[];
 for(const world of worlds){let name=path.basename(world),i=1;while(fs.existsSync(path.join(dest,name)))name=path.basename(world)+' — копия '+i++;
  const target=path.join(dest,name),stage=path.join(dest,'.import-'+crypto.randomUUID());
  try{fs.cpSync(world,stage,{recursive:true,errorOnExist:true,force:false});fs.renameSync(stage,target);copied.push(name);}
  catch(e){if(inside(dest,stage))fs.rmSync(stage,{recursive:true,force:true});throw Error('Не удалось скопировать мир. Исходные файлы сохранены.');}
 }return copied;
}
module.exports={read,write,authenticate,copyWorlds};
