import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let count=0;const errors=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(entry.name==='.git')continue;const file=path.join(dir,entry.name),rel=path.relative(root,file).replaceAll('\\','/');if(entry.isDirectory()){if(['.data','test-data','browser-membership-data','backups','node_modules'].includes(entry.name))errors.push('Закрытая папка: '+rel);else walk(file);continue;}count++;if(/\.(?:pem|der|sqlite(?:-wal|-shm)?|zip|bak)$|\.license\.json$|(?:^|\/)(?:accounts|session)\.json$|^\.env$/.test(rel))errors.push('Закрытый файл: '+rel);const size=fs.statSync(file).size;if(size>90*1024*1024)errors.push('Большой файл: '+rel);if(size<2000000&&/\.(?:mjs|cjs|js|json|html|css|md|txt|yml|example|ps1|cmd)$/.test(rel)){const text=fs.readFileSync(file,'utf8');if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}/.test(text))errors.push('Вероятный секрет: '+rel);}}}
walk(root);for(const page of ['index.html','profile.html']){const text=fs.readFileSync(path.join(root,'docs',page),'utf8');for(const match of text.matchAll(/(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)){const value=match[1];if(/^(?:https?:|data:|mailto:)/.test(value))continue;if(!fs.existsSync(path.resolve(root,'docs',value.split('#')[0])))errors.push('Нерабочая ссылка '+page+': '+value);}if(/<form|membership-profile\.js|fetch\(['"]\/api/.test(text))errors.push('Серверная форма в Pages: '+page);}
const publication=JSON.parse(fs.readFileSync(path.join(root,'alpha-publication.json'),'utf8')).release;
const checksums=JSON.parse(fs.readFileSync(path.join(root,'docs/downloads/checksums.json'),'utf8'));
const page=fs.readFileSync(path.join(root,'docs/index.html'),'utf8');
if(publication){
  const {tag,file,sha256,bytes}=publication;
  const repository=process.env.GITHUB_REPOSITORY||'pythonaby-code/spacevisuals-alpha';
  const url=`https://github.com/${repository}/releases/download/${tag}/${file}`;
  if(checksums.sha256!==sha256||checksums.bytes!==bytes||checksums.file!==file||!page.includes(`href="${url}"`)){
    errors.push('Ссылка сайта или SHA-256 отличаются от проверенного выпуска.');
  }else if(!errors.length){
    const response=await fetch(url,{signal:AbortSignal.timeout(180_000)});
    if(!response.ok||!response.body){
      errors.push(`Файл недоступен без входа в GitHub (HTTP ${response.status}).`);
    }else{
      const hash=createHash('sha256');
      let size=0;
      for await(const chunk of response.body){
        size+=chunk.byteLength;
        if(size>bytes)break;
        hash.update(chunk);
      }
      if(size!==bytes||hash.digest('hex')!==sha256)errors.push('Публичный файл отличается от проверенного ZIP.');
    }
  }
}else if(checksums.status!=='suspended'||/releases\/download\//.test(page)){
  errors.push('Снятый выпуск остался доступен с сайта.');
}
if(errors.length){console.error(errors.join('\n'));process.exit(1)}console.log(`Проверено ${count} файлов: закрытые данные, ключи и большие архивы отсутствуют; ссылки Pages корректны.`);
