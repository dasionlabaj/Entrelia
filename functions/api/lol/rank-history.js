// Atlas rank trace: real observations only; no LP inferred from win/loss.
const send=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":status===200?"public, max-age=60":"no-store","x-content-type-options":"nosniff"}});
export async function onRequestGet({env}){
 if(!env.ATLAS_DB)return send({status:"unconfigured"},503);
 try {
  const rows=await env.ATLAS_DB.prepare("SELECT r.id,r.queue_type,r.tier,r.division,r.lp,r.wins,r.losses,r.observed_at,r.source FROM rank_snapshots r WHERE r.queue_type='RANKED_SOLO_5x5' AND r.puuid=(SELECT puuid FROM matches ORDER BY game_start_ms DESC LIMIT 1) ORDER BY r.observed_at ASC,r.id ASC LIMIT 500").all();
  const points=rows.results.map(r=>({id:r.id,at:r.observed_at,lp:r.lp,tier:r.tier,division:r.division,source:r.source}));
  const latest=points.length?points[points.length-1]:null;
  return send({status:"ok",account:"daxs#EUW",queue:"RANKED_SOLO_5x5",latest,points,priorMatchesInferred:false,disclaimer:"LP precedenti non deducibili da vittorie e sconfitte. Dato iniziale comunicato dall'utente, non confermato da Riot."});
 }catch(error){console.error("rank-history error",error);return send({status:"unavailable"},502);}
}
