// Private diagnostic read; fail closed until ATLAS_OBSERVABILITY_TOKEN is configured.
const send=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
export async function onRequestGet({request,env}){
 if(!env.ATLAS_OBSERVABILITY_TOKEN)return send({status:"not_configured"},503);
 if(request.headers.get("Authorization")!=="Bearer "+env.ATLAS_OBSERVABILITY_TOKEN)return send({status:"unauthorized"},401);
 if(!env.ATLAS_DB)return send({status:"db_unavailable"},503);
 try{
  const limit=Math.min(100,Math.max(1,Number(new URL(request.url).searchParams.get("limit"))||20));
  const r=await env.ATLAS_DB.prepare("SELECT id,component,code,first_seen,last_seen,occurrences FROM atlas_errors ORDER BY last_seen DESC LIMIT ?").bind(limit).all();
  return send({status:"ok",errors:r.results});
 }catch(_){return send({status:"unavailable"},503);}
}
