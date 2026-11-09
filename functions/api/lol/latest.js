// Legacy public endpoint retained for compatibility.
// Public requests never contact Riot or write to Atlas D1.
// Acquisition must run in a separate authenticated/authorized server-side job.
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
export async function onRequestGet({env}){
 if(!env.ATLAS_DB)return json({status:"needs_configuration",message:"Archivio Atlas non configurato."},503);
 try{
  const rows=await env.ATLAS_DB.prepare("SELECT payload_json FROM matches ORDER BY game_start_ms DESC,match_id DESC LIMIT 20").all();
  const matches=(rows.results||[]).map(row=>{try{return JSON.parse(row.payload_json);}catch{return null;}}).filter(Boolean);
  return json({status:"ok",account:"daxs#EUW",source:"atlas_archive",matches});
 }catch(error){
  console.error("Atlas latest archive read failed",error);
  return json({status:"unavailable",message:"Archivio Atlas temporaneamente non disponibile."},502);
 }
}
