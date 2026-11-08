// Private infrastructure events; no raw tokens, player PUUIDs, or request bodies.
const send=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
export async function onRequestGet({request,env}){
 if(!env.ATLAS_OBSERVABILITY_TOKEN)return send({status:"not_configured"},503);
 if(request.headers.get("Authorization")!=="Bearer "+env.ATLAS_OBSERVABILITY_TOKEN)return send({status:"unauthorized"},401);
 if(!env.ATLAS_DB)return send({status:"db_unavailable"},503);
 try{
  const params=new URL(request.url).searchParams,limit=Math.min(100,Math.max(1,Number(params.get("limit"))||20));
  const before=Math.max(0,Number(params.get("before"))||2147483647);
  const r=await env.ATLAS_DB.prepare("SELECT id,kind,component,summary,created_at FROM atlas_events WHERE id<? ORDER BY id DESC LIMIT ?").bind(before,limit).all();
  return send({status:"ok",events:r.results,nextBefore:r.results.length?r.results[r.results.length-1].id:null});
 }catch(_){return send({status:"unavailable"},503);}
}
