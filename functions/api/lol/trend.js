// Atlas LoL archive: match-by-match performance trend, not historical LP.
const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":s===200?"public, max-age=30":"no-store","x-content-type-options":"nosniff"}});
export async function onRequestGet({env,request}){
 const raw=Number(new URL(request.url).searchParams.get("limit")||10);
 const limit=[10,20,100,300].includes(raw)?raw:10;
 if(!env.ATLAS_DB)return json({status:"unconfigured"},503);
 try{
  const [rows,inventory]=await env.ATLAS_DB.batch([
   env.ATLAS_DB.prepare("SELECT match_id,game_start_ms,win,champion,queue_id FROM (SELECT match_id,game_start_ms,win,champion,queue_id FROM matches WHERE queue_id=420 ORDER BY game_start_ms DESC,match_id DESC LIMIT ?) ORDER BY game_start_ms ASC,match_id ASC").bind(limit),
   env.ATLAS_DB.prepare("SELECT COUNT(*) AS available FROM matches WHERE queue_id=420")
  ]);
  let cumulative=0,wins=0,losses=0;
  const points=rows.results.map((r,i)=>{
   cumulative+=r.win?1:-1;
   if(r.win)wins++;else losses++;
   return {index:i+1,at:r.game_start_ms,matchId:r.match_id,win:!!r.win,champion:r.champion,netWins:cumulative};
  });
  return json({status:"ok",account:"daxs#EUW",metric:"net_wins",description:"Vittorie cumulative meno sconfitte; non rappresenta LP o rank",wins,losses,total:points.length,limit,available:inventory.results?.[0]?.available||0,points});
 }catch(e){console.error("trend error",e);return json({status:"unavailable"},502);}
}