// On-demand current ranks for the ten players of a match involving daxs#EUW.
// The match ID is verified on Riot; never accepts an arbitrary list of PUUIDs.
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":status===200?"public, max-age=300":"no-store","X-Content-Type-Options":"nosniff"}});
async function riot(host,path,key){
 const response=await fetch("https://"+host+".api.riotgames.com"+path,{headers:{"X-Riot-Token":key,"Accept":"application/json"}});
 if(!response.ok){const error=new Error("riot_error");error.status=response.status;throw error;}
 return response.json();
}
export async function onRequestGet({request,env}){
 if(!env.RIOT_API_KEY)return json({status:"needs_configuration",message:"RIOT_API_KEY non configurata."},503);
 const id=new URL(request.url).searchParams.get("match")||"";
 if(!/^EUW1_[0-9]+$/.test(id))return json({status:"invalid_match"},400);
 try{
  const [account,game]=await Promise.all([
   riot("europe","/riot/account/v1/accounts/by-riot-id/daxs/EUW",env.RIOT_API_KEY),
   riot("europe","/lol/match/v5/matches/"+encodeURIComponent(id),env.RIOT_API_KEY)
  ]);
  const players=game.info?.participants||[];
  if(!players.some(p=>p.puuid===account.puuid))return json({status:"not_found"},404);
  const ranks={};
  // Three at a time, so a page expansion does not launch ten requests simultaneously.
  for(let i=0;i<players.length;i+=3){
   await Promise.all(players.slice(i,i+3).map(async p=>{
    try{
     const entries=await riot("euw1","/lol/league/v4/entries/by-puuid/"+encodeURIComponent(p.puuid),env.RIOT_API_KEY);
     const solo=entries.find(e=>e.queueType==="RANKED_SOLO_5x5");
     ranks[p.puuid]=solo?{tier:solo.tier,division:solo.rank,lp:solo.leaguePoints,queue:"Solo/Duo"}:null;
    }catch(error){ranks[p.puuid]=null;}
   }));
  }
  return json({status:"ok",match:id,ranks,asOf:new Date().toISOString()});
 }catch(error){
  if(error.status===401||error.status===403)return json({status:"riot_key_invalid",message:"Chiave Riot non valida."},503);
  if(error.status===429)return json({status:"rate_limited",message:"Limite Riot raggiunto."},429);
  if(error.status===404)return json({status:"not_found",message:"Partita non trovata."},404);
  return json({status:"unavailable",message:"Rank temporaneamente non disponibili."},502);
 }
}
