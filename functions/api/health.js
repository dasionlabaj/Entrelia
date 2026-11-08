// Atlas health probe: live checks, no secrets or player identifiers exposed beyond public account.
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
async function probeRiot(key){
 if(!key)return {state:"unconfigured"};
 try{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),6000);
  try{
   const r=await fetch("https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/daxs/EUW",{headers:{"X-Riot-Token":key},signal:controller.signal});
   return r.ok?{state:"ok"}:{state:r.status===429?"rate_limited":r.status===401||r.status===403?"auth_error":"error",httpStatus:r.status};
  }finally{clearTimeout(timer);}
 }catch(_){return {state:"unreachable"};}
}
export async function onRequestGet({env}){
 const checkedAt=new Date().toISOString();
 let archive={state:env.ATLAS_DB?"error":"unconfigured"};
 if(env.ATLAS_DB){try{
   const r=await env.ATLAS_DB.prepare("SELECT COUNT(*) AS total,MAX(game_start_ms) AS latest FROM matches").first();
   archive={state:"ok",total:r?.total??0,latestMatchAt:r?.latest?new Date(r.latest).toISOString():null};
  }catch(_){archive={state:"error"};}}
 const riot=await probeRiot(env.RIOT_API_KEY);
 const overall=archive.state==="ok"&&riot.state==="ok"?"ok":archive.state==="ok"||riot.state==="ok"?"degraded":"unavailable";
 return reply({status:overall,service:"atlas-entrelia",checkedAt,checks:{pages:{state:"ok"},archive,riot},note:"Pages indica soltanto che la funzione diagnostica e raggiungibile; Riot verifica l'account, non il download di tutte le partite."},overall==="unavailable"?503:200);
}
