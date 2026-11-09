// Read-only Atlas archive feed; never queries Riot.
const respond=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
export async function onRequestGet({env}){
 if(!env.ATLAS_DB)return respond({status:"needs_configuration",message:"Archivio Atlas non configurato."},503);
 try{
  const rows=await env.ATLAS_DB.prepare("SELECT payload_json FROM matches ORDER BY game_start_ms DESC,match_id DESC LIMIT 20").all();
  const matches=(rows.results||[]).map(row=>{try{return JSON.parse(row.payload_json);}catch{return null;}}).filter(Boolean);
  return respond({status:"ok",account:"daxs#EUW",source:"atlas_archive",matches});
 }catch(error){
  console.error("Atlas archive feed failed",error);
  return respond({status:"unavailable",message:"Archivio Atlas temporaneamente non disponibile."},502);
 }
}
