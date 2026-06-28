/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef } from "react";

const BG     = "#060D1F";
const CARD   = "#0D1929";
const TEAL   = "#00C4AF";
const AMBER  = "#F59E0B";
const GREEN  = "#10B981";
const RED    = "#EF4444";
const PURPLE = "#A78BFA";
const TEXT   = "#FFFFFF";
const MUTED  = "#94A3B8";
const DIM    = "#64748B";
const BORDER = "hsl(var(--border))";

const STRATEGY_BASE: Record<string, number> = {
  echo:43, impact:38, gems:51, earners:62, rescue:29, new:47, price:55,
};
const MAX_SCORE = 74;

const STYLES = `
  @keyframes riq-slideUp   {from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
  @keyframes riq-fadeIn    {from{opacity:0}to{opacity:1}}
  @keyframes riq-cardOut   {from{opacity:1;transform:translateX(0) scale(1)}to{opacity:0;transform:translateX(-24px) scale(0.96)}}
  @keyframes riq-sheetUp   {from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}
  @keyframes riq-batchUp   {from{opacity:0;transform:scale(.94) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}
  @keyframes riq-whilePop  {from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:translateX(0)}}
  @keyframes riq-trackIn   {from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:translateX(0)}}
  @keyframes riq-scoreFlip {0%,100%{opacity:1;transform:translateY(0)}40%{opacity:0;transform:translateY(-8px)}60%{opacity:0;transform:translateY(8px)}}
  @keyframes riq-radarSpin {from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  @keyframes riq-pulse     {0%,100%{box-shadow:0 0 0 0 rgba(0,196,175,.45)}50%{box-shadow:0 0 0 7px rgba(0,196,175,0)}}
  @keyframes riq-ping      {0%{transform:scale(1);opacity:.8}100%{transform:scale(2.4);opacity:0}}
  @keyframes riq-swipeRight{from{transform:translateX(0) rotate(0deg);opacity:1}to{transform:translateX(120%) rotate(8deg);opacity:0}}
  @keyframes riq-swipeLeft {from{transform:translateX(0) rotate(0deg);opacity:1}to{transform:translateX(-120%) rotate(-8deg);opacity:0}}
  @keyframes riq-cardNext  {from{opacity:0;transform:scale(.92) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}

  .riq-btn{transition:all .15s ease;cursor:pointer;border:none;font-family:'Inter',sans-serif;}
  .riq-btn:hover:not(:disabled){filter:brightness(1.12);transform:scale(1.02);}
  .riq-btn:active:not(:disabled){transform:scale(0.97);}
  .riq-btn:disabled{opacity:.35;cursor:not-allowed;}
  .fix-card{transition:transform .18s ease,box-shadow .18s ease;}
  .fix-card.tappable:hover{transform:translateY(-2px);box-shadow:0 10px 32px rgba(0,196,175,.12)!important;}
  .strategy-pill{transition:all .18s ease;cursor:pointer;white-space:nowrap;border:none;font-family:'Inter',sans-serif;}
  .strategy-pill:hover{filter:brightness(1.14);}
  .track-entry{animation:riq-trackIn .32s ease forwards;}
`;

function generateListings(fix: any) {
  const templates: Record<string, any[]> = {
    Tags: [
      { name:"Macramé Wall Art Set",    before:["wall art","bohemian","handmade"],       after:["wall art","bohemian","handmade","boho decor","minimalist home","handmade gift","unique decor","shelf decor"] },
      { name:"Ceramic Plant Pot Trio",  before:["plant pot","ceramic","white"],           after:["plant pot","ceramic","white","minimalist home","handmade gift","boho decor","planter set","indoor plant"] },
      { name:"Woven Basket Set of 3",   before:["basket","woven","natural"],              after:["basket","woven","natural","storage basket","handmade gift","boho decor","home organization","minimalist"] },
      { name:"Driftwood Wall Hanging",  before:["wall hanging","driftwood","coastal"],    after:["wall hanging","driftwood","coastal","boho decor","unique decor","handmade gift","beach house","natural decor"] },
      { name:"Linen Table Runner",      before:["table runner","linen","natural"],        after:["table runner","linen","natural","minimalist home","handmade gift","boho decor","dining decor","farmhouse"] },
    ],
    Policy: [
      { name:"Macramé Wall Art Set",    before:"No return policy set",                   after:"Returns accepted within 14 days. Buyer pays return shipping." },
      { name:"Ceramic Plant Pot Trio",  before:"No return policy set",                   after:"Returns accepted within 14 days. Buyer pays return shipping." },
      { name:"Woven Basket Set of 3",   before:"No return policy set",                   after:"Returns accepted within 14 days. Item must be unused and in original packaging." },
      { name:"Driftwood Wall Hanging",  before:"No return policy set",                   after:"All sales final for custom orders. Returns accepted on ready-made items within 7 days." },
    ],
    Title: [
      { name:"Macramé Wall Art Set",    before:"Macramé Wall Hanging",                   after:"Boho Macramé Wall Art Set — Handmade Large Wall Hanging for Living Room, Bedroom Decor Gift" },
    ],
  };
  const pool = templates[fix.category] || templates.Tags;
  return Array.from({ length: Math.min(fix.count, 8) }, (_, i) => ({
    ...pool[i % pool.length],
    id: i,
  }));
}

function ScoreRing({ score, animating }: { score: number; animating: boolean }) {
  const r=52, circ=2*Math.PI*r;
  const offset=circ-(score/100)*circ;
  const color=score>=70?GREEN:score>=45?AMBER:RED;
  return (
    <div style={{position:"relative",width:144,height:144,flexShrink:0}}>
      {[1,.68,.38].map((s,i)=>(
        <div key={i} style={{
          position:"absolute",inset:0,borderRadius:"50%",margin:"auto",
          top:0,left:0,right:0,bottom:0,
          border:`1px solid rgba(0,196,175,${.05+i*.025})`,
          transform:`scale(${s})`,
        }}/>
      ))}
      <div style={{position:"absolute",inset:0,borderRadius:"50%",overflow:"hidden"}}>
        <div style={{
          position:"absolute",inset:0,borderRadius:"50%",
          background:`conic-gradient(rgba(0,196,175,.09) 0deg,transparent 55deg)`,
          animation:"riq-radarSpin 4s linear infinite",
        }}/>
      </div>
      <svg width="144" height="144" viewBox="0 0 144 144"
        style={{position:"absolute",inset:0,transform:"rotate(-90deg)",filter:`drop-shadow(0 0 8px ${color}55)`}}>
        <circle cx="72" cy="72" r={r} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth="7"/>
        <circle cx="72" cy="72" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{transition:animating?"stroke-dashoffset 1.2s cubic-bezier(.34,1.56,.64,1),stroke .4s ease":"none"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2}}>
        <span style={{fontFamily:"Bricolage Grotesque, system-ui, sans-serif",fontSize:30,fontWeight:800,color,lineHeight:1,animation:animating?"riq-scoreFlip .5s ease":"none"}}>{score}</span>
        <span style={{fontSize:9,color:DIM,textTransform:"uppercase",letterSpacing:".1em"}}>Market Score</span>
        <span style={{fontSize:9,color,marginTop:1}}>{score>=70?"Strong ↑":score>=45?"Growing →":"Needs work"}</span>
      </div>
    </div>
  );
}

const STRATEGIES=[
  {id:"echo",   emoji:"🌀",label:"Echo's Pick",   desc:"Echo decides based on your shop's current state"},
  {id:"impact", emoji:"🎯",label:"Highest Impact",desc:"Fix what moves your score the most, fastest"},
  {id:"gems",   emoji:"📈",label:"Hidden Gems",   desc:"Getting views but not converting"},
  {id:"earners",emoji:"🏆",label:"Top Earners",   desc:"Protect and optimize your best performers"},
  {id:"rescue", emoji:"⚰️",label:"Rescue Mode",   desc:"Zero sales 90+ days — last chance optimization"},
  {id:"new",    emoji:"🆕",label:"New First",     desc:"Optimize recent listings while the algorithm watches"},
  {id:"price",  emoji:"💰",label:"Most Expensive",desc:"High-price listings have the most to gain"},
];

function StrategySelector({active,onChange}:{active:string;onChange:(id:string)=>void}){
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <p style={{fontSize:10,color:DIM,textTransform:"uppercase",letterSpacing:".1em",fontWeight:600}}>Fix Strategy</p>
        <p style={{fontSize:10,color:TEAL,maxWidth:"55%",textAlign:"right",lineHeight:1.3}}>
          {STRATEGIES.find(s=>s.id===active)?.desc}
        </p>
      </div>
      <div style={{display:"flex",gap:7,overflowX:"auto",paddingBottom:4,scrollbarWidth:"none"}}>
        {STRATEGIES.map(s=>(
          <button key={s.id} className="strategy-pill" onClick={()=>onChange(s.id)} style={{
            padding:"6px 11px",borderRadius:10,fontSize:11,fontWeight:600,
            background:active===s.id?(s.id==="echo"?"rgba(0,196,175,.18)":"rgba(255,255,255,.09)"):"rgba(255,255,255,.03)",
            border:`1px solid ${active===s.id?(s.id==="echo"?TEAL:"rgba(255,255,255,.28)"):BORDER}`,
            color:active===s.id?TEXT:MUTED,
            display:"flex",alignItems:"center",gap:5,flexShrink:0,
          }}>
            <span>{s.emoji}</span><span>{s.label}</span>
            {s.id==="echo"&&active==="echo"&&(
              <span style={{width:5,height:5,borderRadius:"50%",background:TEAL,boxShadow:`0 0 5px ${TEAL}`,animation:"riq-pulse 2s infinite",display:"inline-block"}}/>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function FixCard({fix,onFix,fixed,leaving,index}:{fix:any;onFix:(f:any)=>void;fixed:boolean;leaving:boolean;index:number}){
  return(
    <div className={`fix-card${!fixed&&!leaving?" tappable":""}`}
      onClick={()=>!fixed&&!leaving&&onFix(fix)}
      style={{
        background:fixed?"rgba(16,185,129,.06)":CARD,
        border:`1px solid ${fixed?"rgba(16,185,129,.22)":BORDER}`,
        borderRadius:14,padding:"13px 15px",
        display:"flex",alignItems:"center",gap:12,
        animation:leaving?"riq-cardOut .3s ease forwards":`riq-slideUp .38s ease ${index*.07}s both`,
        cursor:fixed?"default":"pointer",
        transition:"border-color .3s,background .3s",
      }}>
      <div style={{
        width:38,height:38,borderRadius:11,flexShrink:0,
        background:fixed?"rgba(16,185,129,.15)":`${fix.color}18`,
        border:`1px solid ${fixed?"rgba(16,185,129,.3)":`${fix.color}35`}`,
        display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,transition:"all .3s",
      }}>{fixed?"✓":fix.icon}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:3,flexWrap:"wrap"}}>
          <span style={{fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:fixed?GREEN:fix.color}}>{fix.category}</span>
          {fix.canBulk&&!fixed&&(
            <span style={{fontSize:9,color:TEAL,background:"rgba(0,196,175,.10)",border:"1px solid rgba(0,196,175,.22)",borderRadius:4,padding:"1px 5px",fontWeight:600}}>{fix.count} listings</span>
          )}
          <span style={{
            fontSize:9,fontWeight:600,
            color:fixed?GREEN:AMBER,
            background:fixed?"rgba(16,185,129,.10)":"rgba(245,158,11,.10)",
            border:`1px solid ${fixed?"rgba(16,185,129,.2)":"rgba(245,158,11,.2)"}`,
            borderRadius:4,padding:"1px 5px",
          }}>{fixed?"Applied ✓":`+${fix.points} pts`}</span>
        </div>
        <p style={{
          fontSize:12.5,fontWeight:600,lineHeight:1.3,
          color:fixed?"rgba(16,185,129,.85)":TEXT,
          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",transition:"color .3s",
        }}>{fixed?(fix.canBulk?`Applied to ${fix.approvedCount??fix.count} listings — tracking started`:"Change applied — tracking started"):fix.issue}</p>
        {!fixed&&(
          <p style={{fontSize:10.5,color:DIM,marginTop:2}}>
            {fix.effort} · {fix.canBulk?"Tap to review batch":"Tap to apply"}
          </p>
        )}
      </div>
      {!fixed&&(
        <button className="riq-btn" onClick={e=>{e.stopPropagation();onFix(fix);}} style={{
          padding:"6px 12px",borderRadius:9,
          background:`${fix.color}18`,border:`1px solid ${fix.color}40`,
          color:fix.color,fontSize:11,fontWeight:700,flexShrink:0,
        }}>{fix.canBulk?"Review →":"Fix →"}</button>
      )}
    </div>
  );
}

function BatchSheet({fix,onApplyAll,onReviewEach,onClose}:any){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(6,13,31,.88)",backdropFilter:"blur(8px)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:"#0D1929",border:"1px solid rgba(0,196,175,.25)",
        borderRadius:"20px 20px 0 0",padding:"22px 20px 36px",
        width:"100%",maxWidth:480,
        animation:"riq-batchUp .28s ease both",
        boxShadow:"0 -20px 60px rgba(0,0,0,.55)",
      }}>
        <div style={{width:34,height:3,borderRadius:2,background:"rgba(255,255,255,.15)",margin:"0 auto 20px"}}/>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
          <div style={{width:40,height:40,borderRadius:12,background:`${fix.color}18`,border:`1px solid ${fix.color}35`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{fix.icon}</div>
          <div>
            <p style={{fontSize:13,fontWeight:700,color:TEXT}}>{fix.category} Batch Fix</p>
            <p style={{fontSize:11,color:DIM}}>Affects {fix.count} listings</p>
          </div>
          <span style={{marginLeft:"auto",fontSize:11,fontWeight:700,color:AMBER,background:"rgba(245,158,11,.10)",border:"1px solid rgba(245,158,11,.22)",borderRadius:6,padding:"3px 9px"}}>+{fix.points} pts</span>
        </div>
        <div style={{background:"rgba(255,255,255,.03)",border:`1px solid ${BORDER}`,borderRadius:12,padding:"12px 14px",marginBottom:14}}>
          <p style={{fontSize:12.5,color:"#CBD5E1",lineHeight:1.65}}>{fix.detail}</p>
        </div>
        <div style={{background:"rgba(0,196,175,.05)",border:"1px solid rgba(0,196,175,.18)",borderRadius:10,padding:"10px 13px",marginBottom:18,display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:15}}>🛡️</span>
          <p style={{fontSize:11.5,color:MUTED,lineHeight:1.5}}>
            <strong style={{color:TEAL}}>Nothing changes without your approval.</strong>{" "}
            Review each listing individually or apply all at once. Undo anytime within 24 hours.
          </p>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button className="riq-btn" onClick={onReviewEach} style={{
            flex:1,padding:"12px",borderRadius:12,
            background:`rgba(0,196,175,.10)`,border:`1px solid rgba(0,196,175,.3)`,
            color:TEAL,fontSize:13,fontWeight:700,
          }}>Review Each →</button>
          <button className="riq-btn" onClick={onApplyAll} style={{
            flex:2,padding:"12px",borderRadius:12,
            background:TEAL,border:"none",color:BG,
            fontSize:13,fontWeight:700,boxShadow:`0 8px 24px ${TEAL}40`,
          }}>Apply All {fix.count} →</button>
        </div>
      </div>
    </div>
  );
}

function ReviewFlow({fix,onComplete,onClose}:any){
  const listings = generateListings(fix);
  const [idx,setIdx]           = useState(0);
  const [approved,setApproved] = useState<any[]>([]);
  const [skipped,setSkipped]   = useState<any[]>([]);
  const [swipeAnim,setSwipeAnim]= useState<string|null>(null);
  const [flashBg,setFlashBg]   = useState<string|null>(null);
  const [done,setDone]         = useState(false);

  const current = listings[idx];
  const remaining = listings.length - idx;
  const isLast = idx === listings.length - 1;

  const advance = (action: string) => {
    setSwipeAnim(action==="approve"?"right":"left");
    setFlashBg(action);
    if(action==="approve") setApproved(p=>[...p,current]);
    else setSkipped(p=>[...p,current]);

    setTimeout(()=>{
      setSwipeAnim(null);
      setFlashBg(null);
      if(isLast) setDone(true);
      else setIdx(i=>i+1);
    },380);
  };

  const approveAll = () => {
    setApproved([...approved,...listings.slice(idx)]);
    setDone(true);
  };

  const isTagFix = fix.category==="Tags";

  if(done){
    const count=approved.length;
    return(
      <div style={{position:"fixed",inset:0,background:"rgba(6,13,31,.92)",backdropFilter:"blur(10px)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:300}}>
        <div style={{
          background:"#0D1929",border:"1px solid rgba(16,185,129,.3)",
          borderRadius:"20px 20px 0 0",padding:"28px 20px 40px",
          width:"100%",maxWidth:480,animation:"riq-sheetUp .3s ease both",
          boxShadow:"0 -20px 60px rgba(0,0,0,.55)",
        }}>
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={{fontSize:36,marginBottom:8}}>✅</div>
            <p style={{fontFamily:"Bricolage Grotesque, system-ui, sans-serif",fontSize:18,fontWeight:800,color:TEXT,marginBottom:6}}>
              {count} listing{count!==1?"s":""} approved
            </p>
            <p style={{fontSize:12.5,color:MUTED,lineHeight:1.6}}>
              {skipped.length>0?`${skipped.length} skipped — you can review them later.`:"All changes approved."}{" "}
              Changes will apply now and Echo will track results for 7 days.
            </p>
          </div>
          {count>0&&(
            <div style={{background:"rgba(16,185,129,.06)",border:"1px solid rgba(16,185,129,.2)",borderRadius:12,padding:"10px 14px",marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:12,color:MUTED}}>Points applied</span>
                <span style={{fontSize:14,fontWeight:700,color:GREEN}}>+{Math.round((fix.points/fix.count)*count)} pts</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
                <span style={{fontSize:12,color:MUTED}}>Now tracking</span>
                <span style={{fontSize:12,fontWeight:600,color:TEAL}}>{count} listing{count!==1?"s":""} · 7 days</span>
              </div>
            </div>
          )}
          <button className="riq-btn" onClick={()=>onComplete(count,Math.round((fix.points/fix.count)*count))} style={{
            width:"100%",padding:"13px",borderRadius:12,
            background:count>0?TEAL:"rgba(255,255,255,.07)",
            border:`1px solid ${count>0?"transparent":BORDER}`,
            color:count>0?BG:MUTED,fontSize:13,fontWeight:700,
          }}>{count>0?"Apply & Start Tracking →":"Close — nothing changed"}</button>
        </div>
      </div>
    );
  }

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(6,13,31,.92)",backdropFilter:"blur(10px)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:300}}>
      <div style={{width:"100%",maxWidth:480,animation:"riq-sheetUp .32s ease both"}}>
        <div style={{
          background:"rgba(13,25,41,.98)",borderBottom:`1px solid ${BORDER}`,
          padding:"14px 18px 12px",
          display:"flex",alignItems:"center",justifyContent:"space-between",
        }}>
          <button className="riq-btn" onClick={onClose} style={{
            background:"none",border:"none",color:MUTED,fontSize:13,fontWeight:600,padding:"4px 8px",borderRadius:8,
          }}>← Back</button>
          <div style={{textAlign:"center"}}>
            <p style={{fontSize:12,fontWeight:700,color:TEXT}}>{fix.icon} {fix.category} Review</p>
            <p style={{fontSize:10,color:DIM}}>{idx+1} of {listings.length}</p>
          </div>
          <button className="riq-btn" onClick={approveAll} style={{
            background:"rgba(0,196,175,.12)",border:"1px solid rgba(0,196,175,.28)",
            color:TEAL,fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:8,
          }}>Approve rest</button>
        </div>

        <div style={{height:3,background:"rgba(255,255,255,.06)"}}>
          <div style={{
            height:"100%",background:TEAL,
            width:`${(idx/listings.length)*100}%`,
            transition:"width .3s ease",
          }}/>
        </div>

        <div style={{
          padding:"20px 18px 24px",
          animation:swipeAnim==="right"?"riq-swipeRight .38s ease forwards":swipeAnim==="left"?"riq-swipeLeft .38s ease forwards":"riq-cardNext .28s ease both",
          background: flashBg==="approve"?"rgba(16,185,129,.08)":flashBg==="skip"?"rgba(239,68,68,.06)":"#0D1929",
          transition:"background .15s ease",
        }}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
            <div style={{
              width:32,height:32,borderRadius:9,
              background:`${fix.color}18`,border:`1px solid ${fix.color}35`,
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0,
            }}>{fix.icon}</div>
            <div>
              <p style={{fontSize:13,fontWeight:700,color:TEXT,lineHeight:1.2}}>{current.name}</p>
              <p style={{fontSize:10,color:DIM,marginTop:1}}>Proposed {fix.category.toLowerCase()} change</p>
            </div>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
            <div style={{background:"rgba(239,68,68,.06)",border:"1px solid rgba(239,68,68,.18)",borderRadius:12,padding:"11px 13px"}}>
              <p style={{fontSize:9,fontWeight:700,color:RED,textTransform:"uppercase",letterSpacing:".1em",marginBottom:6}}>Before</p>
              {isTagFix?(
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {current.before.map((t:string)=>(
                    <span key={t} style={{fontSize:11,color:"rgba(148,163,184,.7)",background:"rgba(255,255,255,.04)",border:`1px solid ${BORDER}`,borderRadius:5,padding:"2px 7px"}}>{t}</span>
                  ))}
                </div>
              ):(
                <p style={{fontSize:12,color:"rgba(148,163,184,.75)",lineHeight:1.5,fontStyle:"italic"}}>{current.before}</p>
              )}
            </div>

            <div style={{background:"rgba(0,196,175,.06)",border:"1px solid rgba(0,196,175,.22)",borderRadius:12,padding:"11px 13px"}}>
              <p style={{fontSize:9,fontWeight:700,color:TEAL,textTransform:"uppercase",letterSpacing:".1em",marginBottom:6}}>After</p>
              {isTagFix?(
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {current.after.map((t:string)=>(
                    <span key={t} style={{
                      fontSize:11,
                      color:current.before.includes(t)?MUTED:TEXT,
                      background:current.before.includes(t)?"rgba(255,255,255,.04)":"rgba(0,196,175,.14)",
                      border:`1px solid ${current.before.includes(t)?BORDER:"rgba(0,196,175,.35)"}`,
                      borderRadius:5,padding:"2px 7px",
                      fontWeight:current.before.includes(t)?400:600,
                    }}>{t}{!current.before.includes(t)&&<span style={{marginLeft:3,fontSize:9,color:TEAL}}>+new</span>}</span>
                  ))}
                </div>
              ):(
                <p style={{fontSize:12,color:TEXT,lineHeight:1.5}}>{current.after}</p>
              )}
            </div>
          </div>

          {remaining>1&&(
            <p style={{fontSize:10.5,color:DIM,textAlign:"center",marginBottom:14}}>
              {remaining-1} more listing{remaining-1!==1?"s":""} waiting to review
            </p>
          )}

          <div style={{display:"flex",gap:10}}>
            <button className="riq-btn" onClick={()=>advance("skip")} style={{
              flex:1,padding:"13px",borderRadius:12,
              background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.22)",
              color:RED,fontSize:13,fontWeight:700,
              display:"flex",alignItems:"center",justifyContent:"center",gap:6,
            }}>
              <span style={{fontSize:16}}>✕</span> Skip
            </button>
            <button className="riq-btn" onClick={()=>advance("approve")} style={{
              flex:2,padding:"13px",borderRadius:12,
              background:TEAL,border:"none",color:BG,
              fontSize:13,fontWeight:700,
              boxShadow:`0 8px 24px ${TEAL}40`,
              display:"flex",alignItems:"center",justifyContent:"center",gap:6,
            }}>
              <span style={{fontSize:16}}>✓</span> Approve →
            </button>
          </div>

          <p style={{fontSize:10,color:DIM,textAlign:"center",marginTop:10,lineHeight:1.5}}>
            Skipped listings stay in your queue. You can come back to them anytime.
          </p>
        </div>
      </div>
    </div>
  );
}

const WHILE_HERE=[
  {id:"w1",category:"Title", icon:"✏️",color:TEAL,  note:"While you're here — this listing also has a title gap worth +9 pts. Add to queue?"},
  {id:"w2",category:"Photos",icon:"📸",color:PURPLE,note:"While you're here — lead photo underperforms by 18% CTR. Flag for your attention?"},
  {id:"w3",category:"Policy",icon:"📋",color:GREEN, note:"While you're here — return policy missing. +4 pts, instant fix."},
];

function WhileHereCard({item,onAdd,onDismiss}:any){
  return(
    <div style={{background:"rgba(13,25,41,.98)",border:"1px solid rgba(0,196,175,.28)",borderRadius:14,padding:"12px 14px",animation:"riq-whilePop .32s ease both",boxShadow:"0 8px 28px rgba(0,0,0,.4)"}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
        <div style={{width:32,height:32,borderRadius:9,flexShrink:0,background:`${item.color}18`,border:`1px solid ${item.color}35`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>{item.icon}</div>
        <div style={{flex:1}}>
          <p style={{fontSize:10,color:TEAL,fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",marginBottom:3}}>While you're here</p>
          <p style={{fontSize:12,color:"#CBD5E1",lineHeight:1.55}}>{item.note}</p>
        </div>
        <button className="riq-btn" onClick={onDismiss} style={{background:"none",border:"none",color:DIM,fontSize:18,lineHeight:1,padding:"0 2px",flexShrink:0}}>×</button>
      </div>
      <div style={{display:"flex",gap:8,marginTop:10}}>
        <button className="riq-btn" onClick={onDismiss} style={{flex:1,padding:"7px",borderRadius:9,background:"rgba(255,255,255,.04)",border:`1px solid ${BORDER}`,color:MUTED,fontSize:11,fontWeight:600}}>Not now</button>
        <button className="riq-btn" onClick={onAdd} style={{flex:2,padding:"7px",borderRadius:9,background:`${item.color}20`,border:`1px solid ${item.color}40`,color:item.color,fontSize:11,fontWeight:700}}>Add to queue →</button>
      </div>
    </div>
  );
}

function AutoApproveNudge({category,onAccept,onDecline}:any){
  return(
    <div style={{background:"rgba(0,196,175,.06)",border:"1px solid rgba(0,196,175,.25)",borderRadius:12,padding:"12px 14px",animation:"riq-slideUp .3s ease both"}}>
      <p style={{fontSize:12,fontWeight:600,color:TEXT,marginBottom:4}}>Auto-approve {category} fixes going forward?</p>
      <p style={{fontSize:11,color:MUTED,lineHeight:1.5,marginBottom:10}}>RadarIQ will apply {category.toLowerCase()} fixes automatically and notify you weekly. Turn off anytime.</p>
      <div style={{display:"flex",gap:8}}>
        <button className="riq-btn" onClick={onDecline} style={{flex:1,padding:"7px",borderRadius:9,background:"rgba(255,255,255,.04)",border:`1px solid ${BORDER}`,color:MUTED,fontSize:11,fontWeight:600}}>I'll approve each</button>
        <button className="riq-btn" onClick={onAccept} style={{flex:2,padding:"7px",borderRadius:9,background:"rgba(0,196,175,.18)",border:"1px solid rgba(0,196,175,.35)",color:TEAL,fontSize:11,fontWeight:700}}>Yes, auto-fix {category.toLowerCase()} →</button>
      </div>
    </div>
  );
}

function TrackEntry({fix}:{fix:any}){
  return(
    <div className="track-entry" style={{background:"rgba(16,185,129,.05)",border:"1px solid rgba(16,185,129,.15)",borderRadius:11,padding:"9px 13px",display:"flex",alignItems:"center",gap:10}}>
      <div style={{position:"relative",width:8,height:8,flexShrink:0}}>
        <div style={{position:"absolute",inset:0,borderRadius:"50%",background:GREEN,animation:"riq-ping 1.6s ease-out infinite"}}/>
        <div style={{position:"absolute",inset:0,borderRadius:"50%",background:GREEN}}/>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <p style={{fontSize:11.5,fontWeight:600,color:TEXT,lineHeight:1.2}}>
          {fix.category} fix {fix.canBulk?`· ${fix.approvedCount??fix.count} listings`:"applied"}
        </p>
        <p style={{fontSize:10,color:DIM,marginTop:1}}>Just now · Tracking 7 days</p>
      </div>
      <span style={{fontSize:11,fontWeight:700,color:GREEN,background:"rgba(16,185,129,.10)",border:"1px solid rgba(16,185,129,.22)",borderRadius:6,padding:"2px 7px",flexShrink:0}}>+{fix.appliedPoints??fix.points} pts</span>
    </div>
  );
}

const FIX_POOLS: Record<string, any[]> = {
  echo:[
    {id:1, category:"Tags",   icon:"🏷️",color:AMBER, issue:"23 listings missing high-traffic tags",      detail:"Competitors use 'handmade gift', 'boho decor', 'minimalist home' — all missing from your listings.", points:12,effort:"Batch apply",canBulk:true, count:23},
    {id:2, category:"Title",  icon:"✏️",color:TEAL,  issue:"Title 31 chars shorter than top rankers",    detail:"Missing keywords driving 40% of impressions. Market-informed rewrite ready.", points:9, effort:"1 click",   canBulk:false,count:1},
    {id:3, category:"Photos", icon:"📸",color:PURPLE,issue:"Lead photo underperforms competitors",       detail:"Top 5 sellers use lifestyle shots. Yours is product-only. CTR gap: ~18%.", points:7, effort:"Your action",canBulk:false,count:1},
  ],
  impact:[
    {id:10,category:"Tags",   icon:"🏷️",color:AMBER, issue:"31 listings missing critical tags",         detail:"High-confidence additions only. Top missing: 'personalized gift', 'unique finds', 'handcrafted'.", points:14,effort:"Batch apply",canBulk:true, count:31},
    {id:11,category:"Title",  icon:"✏️",color:TEAL,  issue:"Top listing title needs keyword expansion", detail:"Your #1 revenue listing misses 3 keywords competitors use. Rewrite adds 28 chars of high-value terms.", points:11,effort:"1 click",   canBulk:false,count:1},
    {id:12,category:"Policy", icon:"📋",color:GREEN, issue:"14 listings missing return policy",         detail:"Listings with return policies rank 22% higher on average. These 14 are missing it entirely.", points:8, effort:"Batch apply",canBulk:true, count:14},
  ],
  gems:[
    {id:20,category:"Title",  icon:"✏️",color:TEAL,  issue:"'Macramé Wall Set' — 847 views, 0 sales",  detail:"Getting traffic but not converting. Title missing purchase-intent keywords.", points:14,effort:"1 click",   canBulk:false,count:1},
    {id:21,category:"Tags",   icon:"🏷️",color:AMBER, issue:"8 high-view listings need buyer-intent tags",detail:"Adding 'ready to ship', 'ships fast', 'gift ready' to listings already getting discovery traffic.", points:9, effort:"Batch apply",canBulk:true, count:8},
  ],
  earners:[
    {id:30,category:"Title",  icon:"✏️",color:TEAL,  issue:"Top earner title losing ground to competitor",detail:"Competitor updated 3 weeks ago, gained 12 positions. Your title hasn't changed in 4 months.", points:8, effort:"1 click",   canBulk:false,count:1},
    {id:31,category:"Tags",   icon:"🏷️",color:AMBER, issue:"Top 5 earners missing seasonal tags",      detail:"Q4 approaching. Your top earners are missing gift-season tags competitors added last week.", points:4, effort:"Batch apply",canBulk:true, count:5},
  ],
  rescue:[
    {id:40,category:"Tags",   icon:"🏷️",color:AMBER, issue:"19 rescue listings missing all key tags",  detail:"Dormant 90+ days. Full tag overhaul is the fastest path to re-indexing.", points:18,effort:"Batch apply",canBulk:true, count:19},
    {id:41,category:"Title",  icon:"✏️",color:TEAL,  issue:"Dormant listing needs complete title rewrite",detail:"Original title has zero search-volume terms. Rewrite targets current trending searches.", points:10,effort:"1 click",   canBulk:false,count:1},
    {id:42,category:"Pricing",icon:"💰",color:RED,   issue:"Rescue listing priced out of its category", detail:"14 similar items average $22. This listing is at $38 with no differentiation signal.", points:7, effort:"Your call",  canBulk:false,count:1},
  ],
  new:[
    {id:50,category:"Tags",   icon:"🏷️",color:AMBER, issue:"6 new listings need tags while algorithm watches",detail:"First 30 days are critical. Weak tags now = slow indexing. Adding maximizes early ranking.", points:14,effort:"Batch apply",canBulk:true, count:6},
    {id:51,category:"Title",  icon:"✏️",color:TEAL,  issue:"New listing missing trending keywords",    detail:"Posted 4 days ago. Title lacks 3 terms currently trending in your niche. Time-sensitive.", points:9, effort:"1 click",   canBulk:false,count:1},
  ],
  price:[
    {id:60,category:"Title",  icon:"✏️",color:TEAL,  issue:"Premium listing title undersells the value",detail:"Your $89 listing title reads like a $20 product. Top premium sellers use value-signal language. Rewrite ready.", points:12,effort:"1 click",   canBulk:false,count:1},
    {id:61,category:"Tags",   icon:"🏷️",color:AMBER, issue:"Top 4 expensive listings missing premium tags",detail:"High-price listings need luxury/premium discovery tags to reach the right buyers.", points:7, effort:"Batch apply",canBulk:true, count:4},
  ],
};

function FixDemoInner(){
  const [strategy,setStrategy] = useState("echo");
  const [scoreByStrategy,setScoreByStrategy] = useState<Record<string,number>>({...STRATEGY_BASE});
  const [fixedByStrategy,setFixedByStrategy] = useState<Record<string,number[]>>({});
  const [trackedByStrategy,setTrackedByStrategy] = useState<Record<string,any[]>>({});
  const [animScore,setAnimScore] = useState(false);
  const [batchFix,setBatchFix] = useState<any>(null);
  const [reviewFix,setReviewFix] = useState<any>(null);
  const [whileHere,setWhileHere] = useState<any>(null);
  const [autoNudge,setAutoNudge] = useState<string|null>(null);
  const [autoApproved,setAutoApproved] = useState<string[]>([]);
  const [leavingIds,setLeavingIds] = useState<number[]>([]);
  const [hasInteracted,setHasInteracted] = useState(false);
  const whileIdx = useRef(0);

  useEffect(()=>{const t=setTimeout(()=>setAnimScore(true),500);return()=>clearTimeout(t);},[]);

  const currentScore   = scoreByStrategy[strategy]??STRATEGY_BASE[strategy];
  const currentFixed   = fixedByStrategy[strategy]??[];
  const currentTracked = trackedByStrategy[strategy]??[];
  const fixes          = FIX_POOLS[strategy]??FIX_POOLS.echo;
  const pendingFixes   = fixes.filter(f=>!currentFixed.includes(f.id));
  const doneFixes      = fixes.filter(f=> currentFixed.includes(f.id));
  const pointsGained   = currentScore-(STRATEGY_BASE[strategy]??43);

  const handleStrategyChange=(id:string)=>{
    setStrategy(id);setWhileHere(null);setAutoNudge(null);
    setLeavingIds([]);setHasInteracted(false);setAnimScore(true);
  };

  const commitFix=(fix:any,approvedCount:number,appliedPoints:number)=>{
    setHasInteracted(true);
    setLeavingIds(p=>[...p,fix.id]);
    setTimeout(()=>{
      setLeavingIds(p=>p.filter(id=>id!==fix.id));
      const enriched={...fix,approvedCount,appliedPoints};
      setFixedByStrategy(p=>({...p,[strategy]:[...(p[strategy]??[]),fix.id]}));
      setTrackedByStrategy(p=>({...p,[strategy]:[enriched,...(p[strategy]??[])]}));
      setScoreByStrategy(p=>{
        const cur=p[strategy]??STRATEGY_BASE[strategy];
        return{...p,[strategy]:Math.min(MAX_SCORE,cur+appliedPoints)};
      });
      setAnimScore(true);
      if(!whileHere&&whileIdx.current<WHILE_HERE.length){
        setTimeout(()=>{setWhileHere(WHILE_HERE[whileIdx.current]);whileIdx.current++;},700);
      }
      if(fix.canBulk&&!autoApproved.includes(fix.category)&&!autoNudge){
        setTimeout(()=>setAutoNudge(fix.category),1100);
      }
    },320);
  };

  const handleCardTap=(fix:any)=>{
    if(fix.canBulk) setBatchFix(fix);
    else commitFix(fix,1,fix.points);
  };

  const allDone=pendingFixes.length===0&&hasInteracted;

  return(
    <section id="how" style={{background:"transparent",padding:0}}>
      <style>{STYLES}</style>

      {batchFix&&!reviewFix&&(
        <BatchSheet
          fix={batchFix}
          onApplyAll={()=>{const f=batchFix;setBatchFix(null);commitFix(f,f.count,f.points);}}
          onReviewEach={()=>{setReviewFix(batchFix);setBatchFix(null);}}
          onClose={()=>setBatchFix(null)}
        />
      )}

      {reviewFix&&(
        <ReviewFlow
          fix={reviewFix}
          onComplete={(approvedCount:number,appliedPoints:number)=>{
            const f=reviewFix;
            setReviewFix(null);
            commitFix(f,approvedCount,appliedPoints);
          }}
          onClose={()=>setReviewFix(null)}
        />
      )}

      <div style={{minHeight:"100vh",background:"transparent",padding:"32px 16px 72px",display:"flex",flexDirection:"column",alignItems:"center",gap:22}}>

        <div style={{textAlign:"center",maxWidth:480,animation:"riq-fadeIn .7s ease both"}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:7,padding:"5px 13px",borderRadius:999,border:"1px solid rgba(0,196,175,.3)",background:"rgba(0,196,175,.08)",color:TEAL,fontSize:10,fontWeight:700,letterSpacing:".14em",textTransform:"uppercase",marginBottom:14}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:TEAL,boxShadow:`0 0 6px ${TEAL}`,display:"inline-block"}}/>
            Live Demo — Real Interactions
          </div>
          <h2 style={{fontFamily:"Bricolage Grotesque, system-ui, sans-serif",fontSize:"clamp(1.5rem,4vw,2.2rem)",fontWeight:800,color:TEXT,letterSpacing:"-.02em",lineHeight:1.15,marginBottom:8}}>
            This is what managing<br/>your shop actually feels like.
          </h2>
          <p style={{color:MUTED,fontSize:13,lineHeight:1.7}}>
            Choose a strategy. Tap a fix. Watch your score move.<br/>
            This is the real product loop — not a mockup.
          </p>
        </div>

        <div style={{background:CARD,border:"1px solid rgba(0,196,175,.18)",borderRadius:22,padding:"20px",width:"100%",maxWidth:480,boxShadow:"0 24px 80px rgba(0,0,0,.45),0 0 0 1px rgba(0,196,175,.06)",display:"flex",flexDirection:"column",gap:18,animation:"riq-slideUp .5s ease both"}}>

          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <ScoreRing score={currentScore} animating={animScore}/>
            <div style={{flex:1}}>
              <p style={{fontSize:10,color:DIM,textTransform:"uppercase",letterSpacing:".1em",marginBottom:3}}>Active Shop</p>
              <p style={{fontFamily:"Bricolage Grotesque, system-ui, sans-serif",fontSize:15,fontWeight:700,color:TEXT,marginBottom:8}}>BohoHomeByMara</p>
              <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
                {[{l:"Listings",v:"47"},{l:"Applied",v:`${currentFixed.length}`},{l:"Pts gained",v:`+${pointsGained}`,hi:pointsGained>0}].map(s=>(
                  <div key={s.l}>
                    <p style={{fontFamily:"Bricolage Grotesque, system-ui, sans-serif",fontSize:15,fontWeight:700,lineHeight:1,color:s.hi?GREEN:TEXT,transition:"color .4s"}}>{s.v}</p>
                    <p style={{fontSize:9,color:DIM,marginTop:2,textTransform:"uppercase",letterSpacing:".08em"}}>{s.l}</p>
                  </div>
                ))}
              </div>
              <div style={{marginTop:10}}>
                <div style={{height:3,borderRadius:2,background:"rgba(255,255,255,.05)",overflow:"hidden"}}>
                  <div style={{height:"100%",borderRadius:2,background:currentScore>=70?GREEN:AMBER,width:`${currentScore}%`,transition:"width 1.2s cubic-bezier(.34,1.56,.64,1)"}}/>
                </div>
              </div>
            </div>
          </div>

          <div style={{height:1,background:BORDER}}/>
          <StrategySelector active={strategy} onChange={handleStrategyChange}/>
          <div style={{height:1,background:BORDER}}/>

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <p style={{fontSize:10,color:DIM,textTransform:"uppercase",letterSpacing:".1em",fontWeight:600}}>
              {allDone?"All fixes applied 🎉":`${pendingFixes.length} fix${pendingFixes.length!==1?"es":""} ready`}
            </p>
            {!hasInteracted&&(
              <span style={{fontSize:10,color:TEAL,background:"rgba(0,196,175,.08)",border:"1px solid rgba(0,196,175,.2)",borderRadius:6,padding:"2px 8px",animation:"riq-pulse 2s infinite"}}>Tap to fix →</span>
            )}
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {pendingFixes.map((fix,i)=>(
              <FixCard key={`${strategy}-${fix.id}`} fix={fix} index={i} fixed={false} leaving={leavingIds.includes(fix.id)} onFix={handleCardTap}/>
            ))}
            {doneFixes.map((fix,i)=>(
              <FixCard key={`done-${strategy}-${fix.id}`} fix={fix} index={i} fixed leaving={false} onFix={()=>{}}/>
            ))}
            {allDone&&(
              <div style={{padding:"14px",borderRadius:12,background:"rgba(16,185,129,.08)",border:"1px solid rgba(16,185,129,.22)",textAlign:"center",animation:"riq-slideUp .4s ease both"}}>
                <p style={{fontSize:13,fontWeight:600,color:GREEN,marginBottom:3}}>Score up {pointsGained} points — Echo is tracking everything</p>
                <p style={{fontSize:11,color:DIM}}>Check back in 7 days for real impact data. Try another strategy above.</p>
              </div>
            )}
          </div>

          {whileHere&&!autoNudge&&(
            <WhileHereCard item={whileHere} onAdd={()=>setWhileHere(null)} onDismiss={()=>setWhileHere(null)}/>
          )}
          {autoNudge&&(
            <AutoApproveNudge category={autoNudge}
              onAccept={()=>{setAutoApproved(p=>[...p,autoNudge!]);setAutoNudge(null);}}
              onDecline={()=>setAutoNudge(null)}/>
          )}
        </div>

        {currentTracked.length>0&&(
          <div style={{width:"100%",maxWidth:480,animation:"riq-slideUp .4s ease both"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <div style={{position:"relative",width:8,height:8}}>
                <div style={{position:"absolute",inset:0,borderRadius:"50%",background:GREEN,animation:"riq-ping 1.6s ease-out infinite"}}/>
                <div style={{position:"absolute",inset:0,borderRadius:"50%",background:GREEN}}/>
              </div>
              <p style={{fontSize:10,color:GREEN,textTransform:"uppercase",letterSpacing:".1em",fontWeight:700}}>
                Tracking — {currentTracked.length} active fix{currentTracked.length!==1?"es":""}
              </p>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {currentTracked.map((fix,i)=><TrackEntry key={`${fix.id}-${i}`} fix={fix}/>)}
            </div>
            <p style={{fontSize:10.5,color:DIM,marginTop:10,textAlign:"center",lineHeight:1.6}}>
              Echo checks every fix at 7 days and reports exactly what moved — and what to do next.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

export const FixDemo = React.memo(FixDemoInner);
