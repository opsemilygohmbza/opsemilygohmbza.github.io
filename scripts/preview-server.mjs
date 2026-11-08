// Local UI fixture server only. It is never included in the Pages artifact.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('dist');
const count = Number(process.env.PREVIEW_FIXTURE_COUNT || 0);
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg'};
http.createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/games.json'&&count>0){
      res.setHeader('Content-Type','application/json');
      return res.end(JSON.stringify(Array.from({length:count},(_,i)=>({id:`fixture-${i}`,title:`本地分页测试 ${i}`,owner:'fixture',name:`game-${i}`,engine:'RPG Maker MV',status:'verified',pagesUrl:`https://opsemilygohmbza.github.io/fixture-${i}/`,totalSize:1024+i}))));
    }
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep))throw new Error('Invalid path');
    res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
    res.setHeader('Cache-Control','no-cache');
    res.end(await fs.readFile(file));
  }catch{res.statusCode=404;res.end('Not found');}
}).listen(8766,'127.0.0.1',()=>console.log(`Local UI fixtures: ${count}. http://127.0.0.1:8766/`));
