const fs=require('fs'),path=require('path');
module.exports=function createWorldEditorService(root){
 const file=process.env.BEER_WORLD_FILE||path.join(root,'data','beer-room-world.json'),journal=file+'.journal';
 let writes=Promise.resolve(),snapshotTimer=null,latest=null;
 function read(){
  let state;try{state=JSON.parse(fs.readFileSync(file,'utf8'));}catch{state={format:1,revision:0,entries:{}};}
  try{for(const line of fs.readFileSync(journal,'utf8').split('\n')){if(!line)continue;try{const {revision,entry}=JSON.parse(line);if(revision>state.revision&&entry?.id){state.entries[entry.id]=entry;state.revision=revision;}}catch{/* Ignore an incomplete last write after a process interruption. */}}}catch{}
  return state;
 }
 function enqueue(task){const next=writes.then(task);writes=next.catch(()=>{});return next;}
 async function snapshot(){const state=latest;if(!state)return;const temp=file+'.tmp';await fs.promises.writeFile(temp,JSON.stringify(state));await fs.promises.rename(temp,file);await fs.promises.writeFile(journal,'');}
 // Confirm only after the small edit has reached the journal. Snapshot writes
 // are batched and asynchronous; they never stall movement/socket processing.
 function save(state,entry){return enqueue(async()=>{await fs.promises.mkdir(path.dirname(file),{recursive:true});if(entry)await fs.promises.appendFile(journal,'\n'+JSON.stringify({revision:state.revision,entry})+'\n');else{latest=state;await snapshot();return;}latest=state;if(!snapshotTimer){snapshotTimer=setTimeout(()=>{snapshotTimer=null;enqueue(snapshot).catch(error=>console.error('[world-save] snapshot',error));},750);snapshotTimer.unref?.();}});}
 function flush(){clearTimeout(snapshotTimer);snapshotTimer=null;return enqueue(snapshot);}
 function authorized(){return true;}
 async function handle(req,res){const allowed=req.method==='GET'||req.method==='POST';res.writeHead(allowed?200:405,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(allowed?{allowed:true}:{error:'Метод недоступен'}));}
 return{read,save,flush,authorized,handle};
};
