// Atlas social bridge · public integration readiness only.
// Never expose tokens, account identifiers, or OAuth secrets.
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
export async function onRequestGet({env}){
 if(!env.ATLAS_DB)return reply({status:"unconfigured"},503);
 try{
  const {results}=await env.ATLAS_DB.prepare("SELECT provider,connection_status FROM social_connections ORDER BY provider").all();
  const providers=Object.fromEntries(results.map(row=>[row.provider,{status:row.connection_status}]));
  return reply({status:"ok",oauthConfigured:false,providers});
 }catch(e){
  console.error("Social bridge status read failure",e);
  return reply({status:"unavailable"},502);
 }
}