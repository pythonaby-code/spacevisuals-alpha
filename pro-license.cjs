const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function verify(bytes,publicKey,{allowExpired=false}={}){
 if(bytes.length>8192)throw Error('Файл Pro слишком большой.');
 const licence=JSON.parse(bytes.toString('utf8')),payload=Buffer.from(licence.payload,'base64url');
 if(!crypto.verify(null,payload,crypto.createPublicKey({key:publicKey,format:'der',type:'spki'}),Buffer.from(licence.signature,'base64url')))throw Error('Подпись Pro недействительна.');
 const info=JSON.parse(payload);if(info.v!==1||!Number.isFinite(info.expires)||!allowExpired&&info.expires<=Date.now()/1000||!['themes','cosmetics','hud','photo','profiles','workshop'].every(f=>info.features?.includes(f)))throw Error('Лицензия Pro истекла или не поддерживается.');
 return info;
}
function sync(source,instance,publicKey){
 if(!fs.existsSync(source))return false;
 const bytes=fs.readFileSync(source);verify(bytes,publicKey);
 const dest=path.join(instance,'config','spaceveyra-pro-license.json');fs.mkdirSync(path.dirname(dest),{recursive:true});
 if(fs.existsSync(dest)){if(fs.readFileSync(dest).equals(bytes))return true;fs.copyFileSync(dest,dest+'.bak');}
 fs.writeFileSync(dest+'.tmp',bytes,{mode:0o600});fs.renameSync(dest+'.tmp',dest);return true;
}
module.exports={verify,sync};
