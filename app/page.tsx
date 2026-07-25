"use client";

import { FormEvent, useMemo, useState } from "react";

type Role = "gc" | "sub";
type View = "dashboard" | "marketplace" | "messages" | "profile";
type Project = { id:number; title:string; trade:string; location:string; budget:number; due:string; company:string; description:string; applicants:number; verified:boolean };

type Conversation = { id:number; name:string; company:string; initials:string; unread:number; messages:{ id:number; mine:boolean; text:string; time:string }[] };

const seedProjects: Project[] = [
  { id:1,title:"Electrical Rough-In — 48 Unit Multifamily",trade:"Electrical",location:"Miami, FL",budget:185000,due:"Aug 18, 2026",company:"Atlas General Contractors",description:"Licensed electrical subcontractor needed for full rough-in, panels, common areas, and final trim on a ground-up multifamily project.",applicants:12,verified:true },
  { id:2,title:"Commercial Roofing Replacement",trade:"Roofing",location:"Fort Lauderdale, FL",budget:96000,due:"Aug 11, 2026",company:"Stonebridge Construction",description:"TPO roof replacement for a 32,000 sq. ft. occupied retail center. Night and weekend sequencing required.",applicants:8,verified:true },
  { id:3,title:"Interior Framing & Drywall Package",trade:"Drywall",location:"Doral, FL",budget:128000,due:"Aug 25, 2026",company:"Crescent Build Group",description:"Metal framing, insulation, drywall, finishing, and punch for a 75,000 sq. ft. medical office conversion.",applicants:17,verified:true },
  { id:4,title:"Restaurant Plumbing Buildout",trade:"Plumbing",location:"Coral Gables, FL",budget:54000,due:"Aug 7, 2026",company:"Meridian Commercial",description:"Complete plumbing scope including grease waste, fixtures, gas, and final inspections.",applicants:5,verified:false },
];

const talent = [
  {name:"Luis Mendoza",company:"Mendoza Electric Group",trade:"Electrical",location:"Miami, FL",rating:"4.9",jobs:86,initials:"LM"},
  {name:"Alicia Grant",company:"Grant Roofing & Restoration",trade:"Roofing",location:"Fort Lauderdale, FL",rating:"4.8",jobs:64,initials:"AG"},
  {name:"Marcus Reed",company:"Precision Interiors LLC",trade:"Drywall",location:"Doral, FL",rating:"4.9",jobs:51,initials:"MR"},
];

const seedConversations: Conversation[] = [
  { id:1,name:"Luis Mendoza",company:"Mendoza Electric Group",initials:"LM",unread:2,messages:[
    {id:1,mine:false,text:"We reviewed the drawings and can cover the full electrical package.",time:"9:14 AM"},
    {id:2,mine:true,text:"Can you confirm manpower and your earliest mobilization date?",time:"9:28 AM"},
    {id:3,mine:false,text:"We can mobilize a 12-person crew on August 5.",time:"10:02 AM"},
  ]},
  { id:2,name:"Alicia Grant",company:"Grant Roofing & Restoration",initials:"AG",unread:0,messages:[
    {id:1,mine:true,text:"Thanks for the proposal. We are reviewing alternates this afternoon.",time:"Yesterday"},
    {id:2,mine:false,text:"I included the occupied-site safety plan and weekend schedule.",time:"Yesterday"},
  ]},
];

const money = (value:number) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(value);

export default function CrewUpDemo(){
  const [role,setRole]=useState<Role>("gc");
  const [view,setView]=useState<View>("dashboard");
  const [projects,setProjects]=useState(seedProjects);
  const [query,setQuery]=useState("");
  const [trade,setTrade]=useState("All trades");
  const [applications,setApplications]=useState<number[]>([]);
  const [saved,setSaved]=useState<number[]>([3]);
  const [modal,setModal]=useState<"project"|"apply"|"upgrade"|null>(null);
  const [activeProject,setActiveProject]=useState<Project|null>(null);
  const [plan,setPlan]=useState<"Free"|"Pro">("Free");
  const [toast,setToast]=useState("");
  const [conversations,setConversations]=useState(seedConversations);
  const [selected,setSelected]=useState(1);
  const [draft,setDraft]=useState("");

  const filtered=useMemo(()=>projects.filter(p=>{
    const text=`${p.title} ${p.trade} ${p.location} ${p.company}`.toLowerCase();
    return (!query||text.includes(query.toLowerCase()))&&(trade==="All trades"||p.trade===trade);
  }),[projects,query,trade]);
  const current=conversations.find(c=>c.id===selected)??conversations[0];
  const notify=(text:string)=>{setToast(text);window.setTimeout(()=>setToast(""),2400)};
  const swapRole=(next:Role)=>{setRole(next);setView("dashboard");notify(next==="gc"?"General Contractor workspace loaded":"Subcontractor workspace loaded")};

  const createProject=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault(); const data=new FormData(event.currentTarget);
    const next:Project={id:Date.now(),title:String(data.get("title")),trade:String(data.get("trade")),location:String(data.get("location")),budget:Number(data.get("budget")),due:String(data.get("due")),company:"Burton Development Group",description:String(data.get("description")),applicants:0,verified:true};
    setProjects(p=>[next,...p]);setModal(null);setView("marketplace");notify("Project published to the marketplace");
  };
  const apply=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!activeProject)return;setApplications(a=>[...a,activeProject.id]);setProjects(p=>p.map(x=>x.id===activeProject.id?{...x,applicants:x.applicants+1}:x));setModal(null);notify("Proposal submitted successfully")};
  const send=()=>{if(!draft.trim())return;setConversations(items=>items.map(c=>c.id===selected?{...c,messages:[...c.messages,{id:Date.now(),mine:true,text:draft.trim(),time:"Just now"}]}:c));setDraft("")};

  return <div className="shell">
    <header className="topbar">
      <button className="brand" onClick={()=>setView("dashboard")}><b>CU</b><span><strong>CrewUp</strong><small>Build better teams</small></span></button>
      <div className="role-switch"><button className={role==="gc"?"active":""} onClick={()=>swapRole("gc")}>GC</button><button className={role==="sub"?"active":""} onClick={()=>swapRole("sub")}>Subcontractor</button></div>
      <div className="top-actions"><button aria-label="Notifications">◎<i/></button><button className="user" onClick={()=>setView("profile")}>KB</button></div>
    </header>

    <aside className="sidebar">
      <nav>
        <Nav active={view==="dashboard"} label="Dashboard" icon="⌂" onClick={()=>setView("dashboard")}/>
        <Nav active={view==="marketplace"} label={role==="gc"?"Projects & Talent":"Find Work"} icon="▦" onClick={()=>setView("marketplace")}/>
        <Nav active={view==="messages"} label="Messages" icon="✉" badge="3" onClick={()=>setView("messages")}/>
        <Nav active={view==="profile"} label="Company Profile" icon="◉" onClick={()=>setView("profile")}/>
      </nav>
      <section className="plan"><small>CURRENT PLAN</small><strong>{plan}</strong><p>{plan==="Free"?"Unlock unlimited projects, advanced search, and verified messaging.":"All professional features are active."}</p>{plan==="Free"&&<button className="button light" onClick={()=>setModal("upgrade")}>Upgrade to Pro</button>}</section>
      <div className="side-user"><Avatar text="KB"/><span><strong>Kohron Burton</strong><small>{role==="gc"?"General Contractor":"Electrical Contractor"}</small></span></div>
    </aside>

    <main>
      {view==="dashboard"&&<Dashboard role={role} projects={projects} applications={applications} onCreate={()=>setModal("project")} onBrowse={()=>setView("marketplace")} onApply={p=>{setActiveProject(p);setModal("apply")}}/>}
      {view==="marketplace"&&<Marketplace role={role} projects={filtered} query={query} trade={trade} applications={applications} saved={saved} onQuery={setQuery} onTrade={setTrade} onCreate={()=>setModal("project")} onSave={id=>setSaved(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id])} onApply={p=>{setActiveProject(p);setModal("apply")}} onMessage={()=>{setView("messages");notify("Conversation opened")}}/>}
      {view==="messages"&&<Messages items={conversations} current={current} selected={selected} draft={draft} onSelect={id=>{setSelected(id);setConversations(c=>c.map(x=>x.id===id?{...x,unread:0}:x))}} onDraft={setDraft} onSend={send}/>} 
      {view==="profile"&&<Profile role={role} plan={plan} onUpgrade={()=>setModal("upgrade")}/>} 
    </main>

    {modal==="project"&&<Modal title="Post a construction project" subtitle="Create a clear scope so qualified trades can respond quickly." onClose={()=>setModal(null)}><form className="form" onSubmit={createProject}><label>Project title<input name="title" required placeholder="Electrical rough-in — 48 units"/></label><div><label>Primary trade<select name="trade">{["Electrical","Roofing","Drywall","Plumbing","Concrete"].map(x=><option key={x}>{x}</option>)}</select></label><label>Location<input name="location" required defaultValue="Miami, FL"/></label></div><div><label>Estimated budget<input name="budget" type="number" min="1000" required placeholder="150000"/></label><label>Bid deadline<input name="due" required placeholder="Aug 18, 2026"/></label></div><label>Scope summary<textarea name="description" rows={5} required placeholder="Scope, schedule, requirements, and drawings…"/></label><footer><button type="button" className="button outline" onClick={()=>setModal(null)}>Cancel</button><button className="button primary">Publish project</button></footer></form></Modal>}
    {modal==="apply"&&activeProject&&<Modal title={activeProject.title} subtitle={`${activeProject.company} · ${activeProject.location} · ${money(activeProject.budget)}`} onClose={()=>setModal(null)}>{applications.includes(activeProject.id)?<div className="success"><b>✓</b><h3>Proposal already submitted</h3><p>Continue the conversation from Messages.</p><button className="button primary" onClick={()=>setModal(null)}>Done</button></div>:<form className="form" onSubmit={apply}><div className="scope"><strong>{activeProject.trade} scope</strong><p>{activeProject.description}</p><small>Bid due {activeProject.due}</small></div><div><label>Your bid amount<input type="number" min="1000" required defaultValue={Math.round(activeProject.budget*.94)}/></label><label>Estimated duration<input required defaultValue="12 weeks"/></label></div><label>Proposal note<textarea rows={5} required defaultValue={`We reviewed the ${activeProject.trade.toLowerCase()} scope and can provide the required manpower, supervision, and insurance documentation.`}/></label><footer><button type="button" className="button outline" onClick={()=>setModal(null)}>Cancel</button><button className="button primary">Submit proposal</button></footer></form>}</Modal>}
    {modal==="upgrade"&&<Modal title="CrewUp Pro" subtitle="Stripe-ready professional marketplace billing." onClose={()=>setModal(null)}><div className="pricing"><section><small>PROFESSIONAL</small><strong>$79<i>/month</i></strong><p>In production this redirects to Stripe Checkout.</p></section><ul><li>Unlimited projects and proposals</li><li>Advanced trade and location filters</li><li>Verified messaging and documents</li><li>Profile analytics and priority placement</li></ul></div><div className="modal-actions"><button className="button outline" onClick={()=>setModal(null)}>Not now</button><button className="button primary" onClick={()=>{setPlan("Pro");setModal(null);notify("Demo Pro subscription activated")}}>Activate demo subscription</button></div></Modal>}
    {toast&&<div className="toast">✓ {toast}</div>}
  </div>
}

function Nav({active,label,icon,badge,onClick}:{active:boolean;label:string;icon:string;badge?:string;onClick:()=>void}){return <button className={`nav ${active?"active":""}`} onClick={onClick}><span>{icon}</span>{label}{badge&&<b>{badge}</b>}</button>}
function Avatar({text}:{text:string}){return <span className="avatar">{text}</span>}
function Heading({role,title,copy,action,onAction}:{role:string;title:string;copy:string;action?:string;onAction?:()=>void}){return <header className="heading"><div><small>{role}</small><h1>{title}</h1><p>{copy}</p></div>{action&&<button className="button primary" onClick={onAction}>{action}</button>}</header>}
function Stat({label,value,detail}:{label:string;value:string;detail:string}){return <article className="stat"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>}

function Dashboard({role,projects,applications,onCreate,onBrowse,onApply}:{role:Role;projects:Project[];applications:number[];onCreate:()=>void;onBrowse:()=>void;onApply:(p:Project)=>void}){
  return <><Heading role={role==="gc"?"GENERAL CONTRACTOR WORKSPACE":"SUBCONTRACTOR WORKSPACE"} title={role==="gc"?"Good afternoon, Kohron":"Ready for your next project?"} copy={role==="gc"?"Track active scopes, compare qualified trades, and keep every conversation moving.":"Discover verified opportunities matched to your trade and service area."} action={role==="gc"?"+ Post a project":"Browse projects"} onAction={role==="gc"?onCreate:onBrowse}/>
  <section className="stats">{role==="gc"?<><Stat label="Active projects" value="4" detail="2 bids due this week"/><Stat label="Qualified applicants" value="37" detail="+12 this week"/><Stat label="Open conversations" value="8" detail="3 unread"/><Stat label="Awarded value" value="$428K" detail="Last 30 days"/></>:<><Stat label="Matched projects" value={String(projects.length)} detail="3 new today"/><Stat label="Proposals sent" value={String(applications.length)} detail="1 under review"/><Stat label="Profile views" value="42" detail="+18% this week"/><Stat label="Pipeline value" value="$239K" detail="Across open bids"/></>}</section>
  <div className="dash-grid"><section className="panel wide"><div className="panel-head"><div><small>{role==="gc"?"ACTIVE PROCUREMENT":"RECOMMENDED FOR YOU"}</small><h2>{role==="gc"?"Project pipeline":"Best-fit opportunities"}</h2></div><button onClick={onBrowse}>View all →</button></div>{projects.slice(0,3).map(p=><article className="project-row" key={p.id}><span className="trade-icon">{p.trade.slice(0,2).toUpperCase()}</span><div><strong>{p.title}</strong><p>{p.location} · {p.trade} · Due {p.due}</p></div><aside><strong>{money(p.budget)}</strong><small>{p.applicants} applicants</small></aside>{role==="sub"&&<button className="button outline compact" disabled={applications.includes(p.id)} onClick={()=>onApply(p)}>{applications.includes(p.id)?"Applied":"View & apply"}</button>}</article>)}</section>
  <section className="panel"><div className="panel-head"><div><small>LIVE ACTIVITY</small><h2>Recent updates</h2></div></div>{[{i:"LM",t:"New proposal received",c:"Mendoza Electric submitted a proposal."},{i:"AG",t:"Message received",c:"Grant Roofing updated its schedule."},{i:"PC",t:"Profile viewed",c:"Precision Concrete viewed your company."}].map((x,n)=><div className="activity" key={x.i}><Avatar text={x.i}/><div><strong>{x.t}</strong><p>{x.c}</p></div><small>{n?`${n} hr`:"12 min"}</small></div>)}</section></div>
  {role==="gc"&&<section className="panel"><div className="panel-head"><div><small>VERIFIED TALENT</small><h2>Top subcontractors near Miami</h2></div><button onClick={onBrowse}>Browse directory →</button></div><div className="talent-grid">{talent.map(t=><TalentCard key={t.name} item={t}/>)}</div></section>}</>
}

function Marketplace({role,projects,query,trade,applications,saved,onQuery,onTrade,onCreate,onSave,onApply,onMessage}:{role:Role;projects:Project[];query:string;trade:string;applications:number[];saved:number[];onQuery:(s:string)=>void;onTrade:(s:string)=>void;onCreate:()=>void;onSave:(id:number)=>void;onApply:(p:Project)=>void;onMessage:()=>void}){
  const [directory,setDirectory]=useState(role==="gc");
  return <><Heading role={role==="gc"?"PROCUREMENT MARKETPLACE":"PROJECT MARKETPLACE"} title={role==="gc"?"Projects & qualified talent":"Find your next construction project"} copy={role==="gc"?"Manage opportunities and connect with vetted subcontractors.":"Search verified scopes and submit a professional proposal."} action={role==="gc"?"+ Post a project":undefined} onAction={onCreate}/>
  {role==="gc"&&<div className="tabs"><button className={!directory?"active":""} onClick={()=>setDirectory(false)}>My projects</button><button className={directory?"active":""} onClick={()=>setDirectory(true)}>Talent directory</button></div>}
  <div className="filters"><label>⌕<input value={query} onChange={e=>onQuery(e.target.value)} placeholder="Search company, trade, or location"/></label><select value={trade} onChange={e=>onTrade(e.target.value)}><option>All trades</option>{["Electrical","Roofing","Drywall","Plumbing","Concrete"].map(x=><option key={x}>{x}</option>)}</select></div>
  {role==="gc"&&directory?<div className="talent-grid directory">{talent.filter(t=>(trade==="All trades"||t.trade===trade)&&(!query||`${t.name} ${t.company} ${t.location}`.toLowerCase().includes(query.toLowerCase()))).map(t=><TalentCard key={t.name} item={t} action={onMessage}/>)}</div>:<div className="project-cards">{projects.map(p=><article className="project-card" key={p.id}><header><span className="trade-icon large">{p.trade.slice(0,2).toUpperCase()}</span><div><div><h2>{p.title}</h2>{p.verified&&<b className="verified">✓ Verified</b>}</div><p>{p.company}</p></div><button className={`save ${saved.includes(p.id)?"active":""}`} onClick={()=>onSave(p.id)}>{saved.includes(p.id)?"★":"☆"}</button></header><section className="facts"><span><small>TRADE</small><strong>{p.trade}</strong></span><span><small>LOCATION</small><strong>{p.location}</strong></span><span><small>BUDGET</small><strong>{money(p.budget)}</strong></span><span><small>BID DUE</small><strong>{p.due}</strong></span></section><p className="description">{p.description}</p><footer><span><b>Open</b>{p.applicants} proposals</span>{role==="sub"?<button className="button primary" disabled={applications.includes(p.id)} onClick={()=>onApply(p)}>{applications.includes(p.id)?"Proposal submitted":"View scope & apply"}</button>:<button className="button outline">Manage project</button>}</footer></article>)}</div>}
  </>
}

function TalentCard({item,action}:{item:typeof talent[number];action?:()=>void}){return <article className="talent"><div><Avatar text={item.initials}/><span><strong>{item.name}</strong><small>{item.company}</small></span></div><section><b>{item.trade}</b><b>{item.location}</b></section><p><strong>★ {item.rating}</strong><span>{item.jobs} completed jobs</span></p><small className="available">● Available now</small><button className="button outline" onClick={action}>{action?"Message contractor":"View profile"}</button></article>}

function Messages({items,current,selected,draft,onSelect,onDraft,onSend}:{items:Conversation[];current:Conversation;selected:number;draft:string;onSelect:(n:number)=>void;onDraft:(s:string)=>void;onSend:()=>void}){return <><Heading role="PROJECT COMMUNICATIONS" title="Messages" copy="Keep project conversations and scope clarifications in one place."/><section className="messaging"><aside><label className="msg-search">⌕<input placeholder="Search messages"/></label>{items.map(c=><button className={`conversation ${selected===c.id?"active":""}`} key={c.id} onClick={()=>onSelect(c.id)}><Avatar text={c.initials}/><span><strong>{c.name}</strong><small>{c.company}</small><p>{c.messages.at(-1)?.text}</p></span>{c.unread>0&&<b>{c.unread}</b>}</button>)}</aside><div className="chat"><header><Avatar text={current.initials}/><span><strong>{current.name}</strong><small>{current.company}</small></span><button className="button outline compact">View profile</button></header><main>{current.messages.map(m=><article className={`bubble ${m.mine?"mine":""}`} key={m.id}><p>{m.text}</p><small>{m.time}</small></article>)}</main><footer><textarea value={draft} onChange={e=>onDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();onSend()}}} placeholder="Write a message…"/><button className="button primary" onClick={onSend}>Send</button></footer></div></section></>}

function Profile({role,plan,onUpgrade}:{role:Role;plan:"Free"|"Pro";onUpgrade:()=>void}){return <><Heading role="COMPANY PROFILE" title="Burton Development Group" copy="Control how your company appears in CrewUp search and recommendations." action="Save changes"/><section className="profile-hero panel"><b>BD</b><div><span><h2>Burton Development Group</h2><i className="verified">✓ Identity verified</i></span><p>{role==="gc"?"General Contractor · Commercial & Multifamily":"Licensed Electrical Contractor · Commercial & Multifamily"}</p></div><aside><strong>92%</strong><small>Profile strength</small></aside></section><div className="profile-grid"><section className="panel"><div className="panel-head"><div><small>COMPANY DETAILS</small><h2>Business information</h2></div><button>Edit</button></div><dl>{[["Business type",role==="gc"?"General Contractor":"Subcontractor"],["Years in business","11 years"],["Typical project size","$50,000 – $2,000,000"],["Service radius","75 miles"],["License","Florida CGC · Active"],["Insurance","COI verified through Dec 2026"]].map(x=><div key={x[0]}><dt>{x[0]}</dt><dd>{x[1]}</dd></div>)}</dl><h3>About</h3><p className="description">Production-minded construction partner focused on commercial, multifamily, and adaptive-reuse projects throughout South Florida.</p></section><aside className="panel membership"><small>MEMBERSHIP</small><h2>{plan} plan</h2><p>{plan==="Free"?"Upgrade to unlock advanced filters, unlimited projects, analytics, and priority placement.":"All professional marketplace features are active."}</p><ul><li>Verified marketplace profile</li><li>Project and talent search</li><li>Secure direct messaging</li><li>Advanced search and analytics</li></ul>{plan==="Free"&&<button className="button primary" onClick={onUpgrade}>Upgrade to Pro</button>}</aside></div></>}

function Modal({title,subtitle,onClose,children}:{title:string;subtitle:string;onClose:()=>void;children:React.ReactNode}){return <div className="backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="modal" role="dialog" aria-modal="true"><header><div><small>CREWUP WORKFLOW</small><h2>{title}</h2><p>{subtitle}</p></div><button onClick={onClose}>×</button></header>{children}</section></div>}
