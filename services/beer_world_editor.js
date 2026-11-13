const fs=require('fs'),path=require('path');
module.exports=function createWorldEditorService(root){
 const file=process.env.BEER_WORLD_FILE||path.join(root,'data','beer-room-world.json');
 function read(){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}}
 function save(state){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(state));fs.renameSync(temp,file);}
 function authorized(){return true;}
 async function handle(req,res){const allowed=req.method==='GET'||req.method==='POST';res.writeHead(allowed?200:405,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(allowed?{allowed:true}:{error:'Метод недоступен'}));}

 return{read,save,authorized,handle};
};
