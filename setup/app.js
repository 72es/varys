// varys app. Content arrives encrypted (data.enc); the passphrase is typed once per device and only its derived key is kept.
const FEEDBACK_URL = '__FEEDBACK_URL__';   // Apps Script web app (回饋與同步)
const HOME_H = 24, KEEP_D = 15;
const DEEP_DEFAULT = [["The Great Acceleration","AI 是總引擎，帶動五大平台同時加速"],["AI Infrastructure","AI 基礎建設"],["The AI Consumer Operating System","AI 消費者作業系統"],["AI Productivity","AI 生產力"],["Bitcoin","比特幣"],["Tokenized Assets","資產代幣化"],["Decentralized Finance Applications","去中心化金融應用"],["Multiomics","多體學"],["Reusable Rockets","可重複使用火箭"],["Robotics","機器人"],["Distributed Energy","分散式能源"],["Autonomous Vehicles","自動駕駛車"],["Autonomous Logistics","自動化物流"]];

(function(){
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ls={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};
const b64e=u=>btoa(String.fromCharCode(...u)); const b64d=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');

/* ---------- state (local + synced) ---------- */
let D=null, KEY=null, TOKEN=null, ENV=null;
const S={view:'home',open:{},
  read:ls.get('v-read',{}),      // id -> time read
  saved:ls.get('v-saved',{}),    // id -> {t, item} ; {t, del:true} when removed
  fb:ls.get('v-fb',{}),          // id -> {stars, st (time), note, noteSent}
  hl:ls.get('v-hl',{}),          // id -> [text, ...]
  prefs:ls.get('v-prefs',{scale:1,theme:'auto',t:0})};
const persist=()=>{ls.set('v-read',S.read);ls.set('v-saved',S.saved);ls.set('v-fb',S.fb);ls.set('v-hl',S.hl);ls.set('v-prefs',S.prefs);};

/* ---------- crypto ---------- */
async function deriveRaw(pass,salt,iter){
  const km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass.normalize('NFKC').trim()),'PBKDF2',false,['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:iter,hash:'SHA-256'},km,256)); }
async function openEnv(env,raw){
  const k=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
  const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64d(env.iv)},k,b64d(env.ct));
  return JSON.parse(new TextDecoder().decode(pt)); }
async function tokenFor(raw){ const m=new Uint8Array(raw.length+5); m.set(raw); m.set(new TextEncoder().encode('/sync'),raw.length); return hex(await crypto.subtle.digest('SHA-256',m)); }
async function fetchEnv(){ const r=await fetch('data.enc?v='+Date.now(),{cache:'no-store'}); if(!r.ok) throw new Error('fetch'); return r.json(); }

/* ---------- time ---------- */
const tsOf=it=>Date.parse(it.ts||(String(it.date||'').replace(/\//g,'-')+'T07:15:00+08:00'))||0;
const ageH=it=>(Date.now()-tsOf(it))/36e5;
const fmtDate=it=>String(it.date||'');

/* ---------- font & theme ---------- */
const STEPS=[.875,1,1.125,1.25,1.375,1.5,1.75];
let si=Math.max(0,STEPS.indexOf(Number(S.prefs.scale))); if(STEPS.indexOf(Number(S.prefs.scale))<0) si=1;
function applyScale(save){document.documentElement.style.setProperty('--scale',STEPS[si]);$('#zVal').textContent=Math.round(STEPS[si]*100)+'%';$('#zOut').disabled=si===0;$('#zIn').disabled=si===STEPS.length-1; if(save){S.prefs.scale=STEPS[si];S.prefs.t=Date.now();persist();queuePush();}}
$('#zIn').onclick=()=>{if(si<STEPS.length-1){si++;applyScale(true)}}; $('#zOut').onclick=()=>{if(si>0){si--;applyScale(true)}};
function applyTheme(){ const t=S.prefs.theme; if(t==='auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme=t; }
applyScale(false); applyTheme();
let pd=null; const dist=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
['gesturestart','gesturechange','gestureend'].forEach(n=>document.addEventListener(n,e=>e.preventDefault()));
document.addEventListener('touchstart',e=>{pd=e.touches.length===2?dist(e.touches):null},{passive:true});
document.addEventListener('touchmove',e=>{ if(e.touches.length!==2) return; e.preventDefault(); if(!pd){pd=dist(e.touches);return}
  const r=dist(e.touches)/pd; if(r>1.18&&si<STEPS.length-1){si++;applyScale(true);pd=dist(e.touches)} else if(r<.85&&si>0){si--;applyScale(true);pd=dist(e.touches)} },{passive:false});
document.addEventListener('touchend',e=>{if(e.touches.length<2) pd=null},{passive:true});

/* ---------- feedback outbox & sync ---------- */
function send(rec){ const q=ls.get('v-queue',[]); q.push(Object.assign({sid:Date.now().toString(36)+Math.random().toString(36).slice(2,7),edition:D?D.edition.id:''},rec)); ls.set('v-queue',q.slice(-300)); flush(); }
const api=body=>fetch(FEEDBACK_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({token:TOKEN},body))}).then(r=>r.json());
let flushing=false;
async function flush(){ if(flushing||!FEEDBACK_URL.startsWith('https')||!TOKEN||!navigator.onLine) return; const q=ls.get('v-queue',[]); if(!q.length) return; flushing=true;
  try{ const r=await api({action:'fb',recs:q}); if(r&&r.ok){ const left=ls.get('v-queue',[]).filter(x=>!q.some(y=>y.sid===x.sid)); ls.set('v-queue',left); } }catch(e){}
  flushing=false; }
addEventListener('online',()=>{flush();pushNow();});
function syncState(){ return {read:S.read,saved:S.saved,fb:Object.fromEntries(Object.entries(S.fb).map(([k,v])=>[k,{stars:v.stars||0,st:v.st||0}])),hl:S.hl,prefs:S.prefs}; }
function merge(r){ if(!r) return false; let ch=false;
  for(const [k,v] of Object.entries(r.read||{})) if(!S.read[k]){S.read[k]=v;ch=true;}
  for(const [k,v] of Object.entries(r.saved||{})) if(!S.saved[k]||(v.t||0)>(S.saved[k].t||0)){S.saved[k]=v;ch=true;}
  for(const [k,v] of Object.entries(r.fb||{})){ const m=S.fb[k]||{}; if((v.st||0)>(m.st||0)){S.fb[k]=Object.assign({},m,{stars:v.stars,st:v.st});ch=true;} }
  for(const [k,v] of Object.entries(r.hl||{})){ const m=new Set(S.hl[k]||[]); const n=m.size; (v||[]).forEach(x=>m.add(x)); if(m.size!==n){S.hl[k]=[...m];ch=true;} }
  if(r.prefs&&(r.prefs.t||0)>(S.prefs.t||0)){S.prefs=r.prefs; si=Math.max(0,STEPS.indexOf(Number(S.prefs.scale))); applyScale(false); applyTheme(); ch=true;}
  persist(); return ch; }
let syncStatus='尚未同步';
async function pull(){ if(!FEEDBACK_URL.startsWith('https')||!TOKEN) {syncStatus='同步尚未設定';return false;} try{ const r=await api({action:'pull'}); if(r&&r.ok){ syncStatus='已同步 '+new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'}); return merge(r.state);} syncStatus='同步失敗'; }catch(e){syncStatus='離線，連上網路再同步';} return false; }
let pushT=null; function queuePush(){ clearTimeout(pushT); pushT=setTimeout(pushNow,2500); }
async function pushNow(){ clearTimeout(pushT); if(!FEEDBACK_URL.startsWith('https')||!TOKEN||!navigator.onLine) return;
  try{ const r=await api({action:'pull'}); if(r&&r.ok) merge(r.state); await api({action:'push',state:syncState()}); syncStatus='已同步 '+new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'}); }catch(e){} }
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden'){ pushNow(); flush(); } });

/* ---------- lists ---------- */
const savedOn=id=>S.saved[id]&&!S.saved[id].del;
const allItems=()=>D.items.concat(D.firsthand||[],(D.deep&&D.deep.items)||[],D.monthly||[]);
const byId=id=>allItems().find(i=>i.id===id)||(S.saved[id]&&S.saved[id].item);
const sortNew=a=>a.slice().sort((x,y)=>tsOf(y)-tsOf(x));
const homeItems=()=>D.items.filter(i=>ageH(i)<HOME_H);
const olderItems=()=>D.items.filter(i=>{const h=ageH(i);return h>=HOME_H&&h<KEEP_D*24&&!savedOn(i.id)});
const savedItems=()=>Object.keys(S.saved).filter(savedOn).map(id=>allItems().find(i=>i.id===id)||S.saved[id].item).filter(Boolean);
const unread=()=>homeItems().filter(i=>!S.read[i.id]).length;

function rowHTML(it){ const rd=!!S.read[it.id],op=!!S.open[it.id],sv=savedOn(it.id);
  const tk=(it.tickers||[]).length?`<span class="tk">${it.tickers.map(t=>`<i>${esc(t)}</i>`).join('')}</span>`:'';
  const isNew=ageH(it)<12;
  return `<div class="row ${rd?'read':''}" data-row="${esc(it.id)}"><button class="rt" type="button" data-toggle="${esc(it.id)}" aria-expanded="${op}">${isNew?'<span class="new" title="12 小時內"></span>':''}<span class="tw"><span class="t">${esc(it.title)}</span>${tk}</span>${sv?'<svg class="mk" aria-label="已收藏"><use href="#mark"/></svg>':''}</button>${op?cardHTML(it):''}</div>`; }
function para(t){ if(Array.isArray(t)) return t.map(para).join(''); if(t&&typeof t==='object'){ if(t.list) return `<ul class="bl">${t.list.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`; if(t.table){const tb=t.table;return `<div class="tbl">${tb.cap?`<p class="tb-cap">${esc(tb.cap)}</p>`:''}${(tb.rows||[]).map(r=>`<div class="tb2"><b>${esc(r[0])}</b><span>${esc(r.slice(1).join('　'))}</span></div>`).join('')}</div>`;} return ''; }
  return String(t||'').split(/\n\s*\n/).filter(s=>s.trim()).map(p=>`<p>${esc(p)}</p>`).join(''); }
function cardHTML(it){ const f=S.fb[it.id]||{}, sv=savedOn(it.id);
  const det=(it.detail||[]).length?`<details class="more"><summary>${it.detail.length} 個重點</summary><ul>${it.detail.map(x=>{const m=String(x).match(/^([^｜]{1,16})｜([\s\S]*)$/);return m?`<li><b>${esc(m[1])}</b>｜${esc(m[2])}</li>`:`<li>${esc(x)}</li>`}).join('')}</ul>${it.watch?`<p class="watch">${esc(it.watch)}</p>`:''}</details>`:'';
  const ex=(it.extra_links||[]).length?`<div class="more-links">${it.extra_links.map(l=>`<a href="${esc(l.u)}" target="_blank" rel="noopener">${esc(l.t)} ↗</a>`).join('')}</div>`:'';
  return `<article class="card" data-id="${esc(it.id)}">
   <div class="byline"><span class="src">${esc(it.media)}${it.author?'・'+esc(it.author):''}</span>${it.tier?`<span class="tier">${esc(it.tier)}</span>`:''}<span>${esc(fmtDate(it))}</span>${it.updated?'<span class="tier">已補完整摘要</span>':''}</div>
   <div class="prose" data-hl="${esc(it.id)}">${para(it.summary)}</div>
   ${it.why?`<div class="why" data-hl="${esc(it.id)}"><span class="l">跟你的關係</span>${para(it.why)}</div>`:''}
   ${it.action?`<div class="act"><span class="l">行動</span>${esc(it.action)}</div>`:''}
   ${det}${it.note?`<p class="note">${esc(it.note)}</p>`:''}
   <div class="fb">
     <div class="line">${it.link?`<a class="link-out" href="${esc(it.link)}" target="_blank" rel="noopener">讀原文 ↗</a>`:''}</div>${ex}
     <div class="rate"><div class="stars" role="group" aria-label="有幫助嗎？"><span class="l">有幫助嗎？</span>${[1,2,3,4,5].map(n=>`<button type="button" class="star ${f.stars>=n?'on':''}" data-star="${esc(it.id)}" data-n="${n}" aria-label="${n} 顆星">★</button>`).join('')}</div>
       <button class="savebtn" type="button" data-save="${esc(it.id)}" aria-pressed="${sv}"><svg aria-hidden="true"><use href="#mark"/></svg>${sv?'已收藏':'收藏'}</button></div>
     <textarea class="nbox" rows="1" placeholder="看不懂、想追問、要我補什麼，寫這裡">${esc(f.note||'')}</textarea>
     <div class="line"><button class="btn" type="button" data-send="${esc(it.id)}">送出</button><span class="sent">${f.noteSent?'已送出，下一期處理':''}</span></div>
   </div></article>`; }
function secsHTML(items,empty){ const h=D.sections.map(s=>{const l=sortNew(items.filter(i=>i.sec===s.id)); if(!l.length) return '';
  return `<section class="sec" id="sec-${s.id}"><div class="sec-h"><h2>${esc(s.name)}</h2><span class="sub">${esc(s.sub||'')}</span><span class="c">${l.length} 則</span></div><div class="list">${l.map(rowHTML).join('')}</div></section>`}).join('');
  return h||`<div class="empty">${empty}</div>`; }
function skipHTML(){ const sk=D.skipped||[]; if(!sk.length) return ''; return `<section class="sec skip" id="sec-skip"><div class="sec-h"><h2>跳過也沒差</h2><span class="sub">被擋下、最接近門檻的</span><span class="c">${sk.length} 則</span></div><div class="list">${sk.map((s,k)=>`<div class="row"><button class="rt" type="button" data-skip="${k}"><span class="tw"><span class="t">${esc(s.x)}</span></span></button>${S.open['skip'+k]?`<div class="why2">${esc(s.why)}${s.src?'・'+esc(s.src):''}</div>`:''}</div>`).join('')}</div></section>`; }
function monthlyBox(){ const m=sortNew(D.monthly||[])[0]; if(!m||(Date.now()-tsOf(m))>32*864e5) return ''; return `<section class="box monthly"><div class="k">月報・${esc(m.month||'')}</div><div class="list">${rowHTML(m)}</div></section>`; }
function homeHTML(){ return `<section class="intro"><div class="date">${esc(D.edition.stamp||'')}</div><h1>${esc(D.edition.label)}</h1></section>${monthlyBox()}
  ${(D.bluf||[]).length?`<section class="box bluf"><div class="k">三句話看完本期</div><ol>${D.bluf.map(b=>`<li>${esc(b)}</li>`).join('')}</ol></section>`:''}
  ${secsHTML(homeItems(),'<b>24 小時內沒有新文章</b>更早的在 yesterday。')}${skipHTML()}
  ${D.sources_note?`<p class="foot">${esc(D.sources_note)}</p>`:''}`; }
function radarHTML(){ const ev=((D.primary&&D.primary.events)||[]).slice().sort((a,b)=>String(a.d).localeCompare(String(b.d))).filter(e=>Date.parse(e.d)>=Date.now()-4*864e5);
  return `<h1 class="view-h">持倉</h1><p class="view-sub">每檔今天有什麼事。點「出處」直接跳到那篇。</p>
  <div class="legend"><span><i class="dot s-alert"></i>要注意</span><span><i class="dot s-warn"></i>留意</span><span><i class="dot s-act"></i>可行動</span><span><i class="dot s-quiet"></i>沒事</span></div>
  <div class="radar">${(D.radar||[]).map(r=>`<div class="rd"><div class="rd-h"><i class="dot s-${esc(r.s)}"></i>${esc(r.t)}</div><ul>${(r.lines||[]).map(l=>`<li>${esc(l.x)}${l.ref?`<a href="#" data-jump="${esc(l.ref)}">出處</a>`:''}</li>`).join('')}</ul></div>`).join('')}</div>
  <h1 class="view-h" style="padding-top:32px">一手行事曆</h1>${D.primary&&D.primary.intro?`<p class="view-sub">${esc(D.primary.intro)}</p>`:''}
  <div class="cal">${ev.map(e=>`<div class="ev ${e.status==='done'?'done':''}"><div class="d">${esc(e.tw)}</div><div><b>${esc(e.t)}${e.status==='done'?'<span class="st">已發生</span>':''}</b><p>${esc(e.why)}${e.ref&&byId(e.ref)?` <a href="#" data-jump="${esc(e.ref)}">讀分析</a>`:''}</p></div></div>`).join('')}</div>`; }
function deepHTML(){ const dp=D.deep||{}; const ch=dp.chapters||DEEP_DEFAULT.map((c,k)=>({no:k+1,en:c[0],zh:c[1]})); const done=ch.filter(c=>c.id&&byId(c.id)).length;
  return `<h1 class="view-h">深讀</h1><p class="view-sub">長篇報告拆成一章一篇，可以評分、留言追問。</p>
  <section class="deep-hero"><div class="k">ARK INVEST・BIG IDEAS 2026・111 頁</div><h2>ARK 年度報告：13 個大趨勢</h2><p>ARK 自己有部位、立場偏多。每章都對照你的持倉，並附上反方說法。</p><div class="prog">${ch.map(c=>`<i class="${c.id&&byId(c.id)?'on':''}"></i>`).join('')}</div></section>
  <div class="list" style="margin-top:8px">${ch.map(c=>{const it=c.id&&byId(c.id); if(it) return rowHTML(it).replace('<span class="tw">',`<span class="no">${String(c.no).padStart(2,'0')}</span><span class="tw">`);
    return `<div class="row ch later"><div class="rt"><span class="no">${String(c.no).padStart(2,'0')}</span><span class="tw"><span class="t">${esc(c.zh)}</span><span class="tk"><i>${esc(c.en)}</i></span></span>${c.next?'<span class="pill">下一章</span>':''}</div></div>`;}).join('')}</div>
  ${(D.monthly||[]).length?`<section class="sec"><div class="sec-h"><h2>月報</h2><span class="sub">每月 1 號，把上個月的內容重新讀過、收斂成一份</span></div><div class="list">${sortNew(D.monthly).map(rowHTML).join('')}</div></section>`:''}
  <section class="sec"><div class="sec-h"><h2>一手分析</h2><span class="sub">財報、Fed、13F 這類原始文件的解讀</span></div><div class="list">${sortNew(D.firsthand||[]).map(rowHTML).join('')||'<p class="empty">還沒有</p>'}</div></section>
  <p class="foot">月報、一手分析、ARK 章節都永久保留。所有文章另外加密存檔，日後提問時可以回頭查。</p>`; }
function chips(items){ const c=$('#chips'); if(S.view!=='home'&&S.view!=='older'){c.hidden=true;return} c.hidden=false; const have=new Set(items.map(i=>i.sec));
  c.innerHTML=D.sections.filter(s=>have.has(s.id)).map(s=>`<a href="#sec-${s.id}" data-sec="${s.id}">${esc(s.name)}</a>`).join('')+(S.view==='home'&&(D.skipped||[]).length?`<a href="#sec-skip" data-sec="skip">跳過也沒差</a>`:''); }
function render(){ if(!D) return; const m=$('#main'); let items=[];
  if(S.view==='home'){items=homeItems();m.innerHTML=homeHTML();}
  else if(S.view==='radar') m.innerHTML=radarHTML();
  else if(S.view==='deep') m.innerHTML=deepHTML();
  else if(S.view==='saved'){items=savedItems();m.innerHTML=`<h1 class="view-h">收藏</h1><p class="view-sub">收藏的永遠留著，換手機也在。</p>`+secsHTML(items,'<b>還沒有收藏</b>點開任何一篇，按「收藏」就會留在這裡。');}
  else {items=olderItems();m.innerHTML=`<h1 class="view-h">yesterday</h1><p class="view-sub">超過 24 小時的文章，最多留 15 天；收藏的不會出現在這裡。</p>`+secsHTML(items,'<b>還沒有更早的文章</b>');}
  $('#edLabel').textContent=D.edition.label||''; chips(items); spy(); paintHL(); watchRead();
  document.querySelectorAll('.tab').forEach(t=>t.setAttribute('aria-selected',t.dataset.view===S.view));
  const n=unread(); $('#unread').hidden=!n; $('#unread').textContent=n; }
let co; function spy(){ if(co) co.disconnect(); co=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){const id=e.target.id.slice(4);document.querySelectorAll('.chips a').forEach(a=>a.classList.toggle('on',a.dataset.sec===id))}}),{rootMargin:'-35% 0px -55% 0px'}); document.querySelectorAll('.sec').forEach(s=>co.observe(s)); }
function toast(m){const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>t.hidden=true,1800)}

/* read = opened and scrolled to the end of the card (or rated) */
const openedAt={}; let ro=null;
function watchRead(){ if(ro) ro.disconnect(); ro=new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting){ const id=e.target.closest('.card').dataset.id; markRead(id); } }),{threshold:.9}); document.querySelectorAll('.card .fb').forEach(x=>ro.observe(x)); }
function markRead(id){ if(S.read[id]) return; S.read[id]=Date.now(); persist(); queuePush(); const n=unread(); $('#unread').hidden=!n; $('#unread').textContent=n; }

/* highlights */
function paintHL(){ document.querySelectorAll('[data-hl]').forEach(el=>{ (S.hl[el.dataset.hl]||[]).forEach(txt=>wrapText(el,txt)); }); }
function wrapText(el,txt){ if(!txt) return; const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT); let n; while((n=w.nextNode())){ if(n.parentElement.closest('mark')) continue; const i=n.data.indexOf(txt); if(i>=0){ const r=document.createRange(); r.setStart(n,i); r.setEnd(n,i+txt.length); const m=document.createElement('mark'); try{r.surroundContents(m)}catch(e){} return; } } }
const hb=$('#hlbtn'); let sel=null;
document.addEventListener('selectionchange',()=>{const s=getSelection(); if(!s.rangeCount||s.isCollapsed){hb.hidden=true;return} const r=s.getRangeAt(0); const host=r.commonAncestorContainer.nodeType===1?r.commonAncestorContainer:r.commonAncestorContainer.parentElement; const box=host&&host.closest('[data-hl]'); if(!box){hb.hidden=true;return}
  sel={id:box.dataset.hl,text:s.toString().trim()}; const b=r.getBoundingClientRect(); hb.style.left=Math.max(8,Math.min(innerWidth-90,b.left+b.width/2-34))+'px'; hb.style.top=Math.max(70,b.top-48)+'px'; hb.hidden=false;});
hb.addEventListener('mousedown',e=>e.preventDefault());
hb.onclick=()=>{ if(!sel||!sel.text) return; const a=S.hl[sel.id]||[]; if(!a.includes(sel.text)) a.push(sel.text); S.hl[sel.id]=a; persist(); queuePush();
  const it=byId(sel.id); send({type:'highlight',itemId:sel.id,title:it?it.title:'',text:sel.text}); getSelection().removeAllRanges(); hb.hidden=true; paintHL(); toast('已劃線，update 時進 Obsidian'); };

/* events */
document.addEventListener('click',e=>{
  const tg=e.target.closest('[data-toggle]'); if(tg){const id=tg.dataset.toggle; const was=!!S.open[id]; S.open={}; if(!was){S.open[id]=1;openedAt[id]=Date.now();} render(); if(!was){const r=document.querySelector('.row [data-toggle="'+CSS.escape(id)+'"]'); r&&r.closest('.row').scrollIntoView({block:'start'})} return;}
  const sk=e.target.closest('[data-skip]'); if(sk){const k='skip'+sk.dataset.skip; const was=S.open[k]; S.open={}; if(!was) S.open[k]=1; render(); const el=document.getElementById('sec-skip'); el&&el.scrollIntoView({block:'start'}); return;}
  const st=e.target.closest('[data-star]'); if(st){const id=st.dataset.star,n=+st.dataset.n; const f=S.fb[id]=Object.assign({},S.fb[id]); f.stars=f.stars===n?0:n; f.st=Date.now(); persist(); queuePush(); markRead(id);
    const it=byId(id); send({type:'rating',itemId:id,title:it?it.title:'',stars:f.stars||'',text:''});
    st.parentNode.querySelectorAll('.star').forEach(b=>b.classList.toggle('on',+b.dataset.n<=f.stars)); toast(f.stars?f.stars+' 顆星':'已取消評分'); return;}
  const sv=e.target.closest('[data-save]'); if(sv){const id=sv.dataset.save; const it=byId(id); if(savedOn(id)) S.saved[id]={t:Date.now(),del:true}; else S.saved[id]={t:Date.now(),item:it};
    persist(); queuePush(); render(); toast(savedOn(id)?'已收藏':'已取消收藏'); return;}
  const sd=e.target.closest('[data-send]'); if(sd){const id=sd.dataset.send; const cd=sd.closest('.card'); const t=cd.querySelector('.nbox').value.trim(); if(!t){toast('先寫點什麼');return}
    const f=S.fb[id]=Object.assign({},S.fb[id],{note:t,noteSent:true}); persist(); const it=byId(id);
    send({type:'note',itemId:id,title:it?it.title:'',stars:f.stars||'',text:t}); cd.querySelector('.sent').textContent='已送出，下一期處理'; toast('收到'); return;}
  const jp=e.target.closest('[data-jump]'); if(jp){e.preventDefault(); const id=jp.dataset.jump; const it=byId(id); if(!it){toast('這則已經不在了');return}
    const inHome=homeItems().some(i=>i.id===id), inOld=olderItems().some(i=>i.id===id), inFirst=(D.firsthand||[]).concat(D.monthly||[],(D.deep&&D.deep.items)||[]).some(i=>i.id===id);
    S.view=inHome?'home':inOld?'older':inFirst?'deep':savedOn(id)?'saved':'home'; S.open={}; S.open[id]=1; render(); const r=document.querySelector('[data-row="'+CSS.escape(id)+'"]'); r&&r.scrollIntoView({block:'start'}); return;}
  const tb=e.target.closest('.tab'); if(tb){S.view=tb.dataset.view;S.open={};render();scrollTo(0,0);return;}
});

/* settings */
$('#openSet').onclick=()=>{ $('#sheet').innerHTML=`<h2>設定</h2>
  <div class="opt"><span>外觀</span><span><button class="btn" data-theme-set="auto">自動</button> <button class="btn" data-theme-set="light">淺色</button> <button class="btn" data-theme-set="dark">深色</button></span></div>
  <div class="opt"><span>同步</span><span id="syncTxt" style="color:var(--gold-ink);font-weight:700">${esc(syncStatus)}</span></div>
  <div class="opt"><span>解鎖畫面</span><button class="btn" id="showLock">預覽</button></div>
  <p style="font-size:.8125rem;color:var(--ink-3)">放到主畫面：Safari →「分享」→「加入主畫面」。</p>
  <button class="btn primary" id="closeSet">關閉</button>`; $('#scrim').hidden=false;
  document.querySelectorAll('[data-theme-set]').forEach(b=>b.onclick=()=>{S.prefs.theme=b.dataset.themeSet;S.prefs.t=Date.now();persist();applyTheme();queuePush();});
  $('#closeSet').onclick=()=>$('#scrim').hidden=true;
  $('#showLock').onclick=()=>{$('#scrim').hidden=true; showLock(true);}; };
$('#scrim').onclick=e=>{if(e.target.id==='scrim')$('#scrim').hidden=true};

/* lock */
let preview=false;
function showLock(isPreview){ preview=!!isPreview; $('#lock').hidden=false; $('#lockErr').textContent=''; $('#pass').value=''; $('#lockCancel').hidden=!preview; if(!preview) setTimeout(()=>$('#pass').focus(),50); }
$('#lockCancel').onclick=()=>{$('#lock').hidden=true;};
async function unlock(){ if(preview){$('#lock').hidden=true;return}
  const p=$('#pass').value; if(!p.trim()){$('#lockErr').textContent='請輸入通關密語';return}
  $('#unlock').disabled=true; $('#unlock').textContent='解鎖中…';
  try{ ENV=ENV||await fetchEnv(); const raw=await deriveRaw(p,b64d(ENV.salt),ENV.iter); D=await openEnv(ENV,raw);
    KEY=raw; TOKEN=await tokenFor(raw); ls.set('v-key',{salt:ENV.salt,k:b64e(raw)}); $('#lock').hidden=true; start(); }
  catch(e){ $('#lockErr').textContent=e.message==='fetch'?'連不上網路，稍後再試':'通關密語不對'; }
  $('#unlock').disabled=false; $('#unlock').textContent='解鎖'; }
$('#unlock').onclick=unlock; $('#pass').addEventListener('keydown',e=>{if(e.key==='Enter')unlock()});

/* load */
function tidy(){ for(const id of Object.keys(S.saved)){ if(savedOn(id)){const fresh=allItems().find(i=>i.id===id); if(fresh) S.saved[id].item=fresh;} }
  const keep=new Set(allItems().map(i=>i.id).concat(Object.keys(S.saved))); for(const k of Object.keys(S.read)) if(!keep.has(k)) delete S.read[k]; persist(); }
async function load(){ ENV=await fetchEnv(); const st=ls.get('v-key',null); if(!st||st.salt!==ENV.salt){ showLock(false); return false; }
  const raw=b64d(st.k); try{ D=await openEnv(ENV,raw); }catch(e){ ls.del('v-key'); showLock(false); return false; }
  KEY=raw; TOKEN=TOKEN||await tokenFor(raw); return true; }
let started=false;
async function start(){ tidy(); render(); if(started) return; started=true; flush(); if(await pull()) render(); pushNow(); }
load().then(ok=>{ if(ok) start(); }).catch(()=>{ $('#main').innerHTML='<p class="empty"><b>暫時打不開</b>請確認網路後，往下拉重新整理。</p>'; });

/* page updates & pull to refresh */
let pageTag=null; async function tagNow(){ try{const r=await fetch('./index.html?t='+Date.now(),{method:'HEAD',cache:'no-store'}); return r.headers.get('etag')||r.headers.get('last-modified');}catch(e){return null} }
tagNow().then(t=>pageTag=t);
async function appChanged(){ const t=await tagNow(); return !!(pageTag&&t&&t!==pageTag); }
let lastCheck=Date.now();
document.addEventListener('visibilitychange',async()=>{ if(document.visibilityState!=='visible'||Date.now()-lastCheck<30000) return; lastCheck=Date.now();
  if(await appChanged()){location.reload();return} if(KEY&&await load()){ tidy(); if(await pull()); render(); } });
let y0=null,pulled=0,busy=false; const ptr=$('#ptr');
addEventListener('touchstart',e=>{ if(scrollY<=0&&!busy&&$('#scrim').hidden&&$('#lock').hidden) y0=e.touches.length===1?e.touches[0].clientY:null; else y0=null; },{passive:true});
addEventListener('touchmove',e=>{ if(y0==null) return; pulled=Math.max(0,Math.min(110,(e.touches[0].clientY-y0)*.5)); ptr.style.transition='none'; ptr.style.height=pulled+'px'; ptr.classList.toggle('spin',pulled>60); },{passive:true});
addEventListener('touchend',async()=>{ if(y0==null) return; y0=null; ptr.style.transition='';
  if(pulled>60){busy=true; ptr.style.height='64px'; ptr.classList.add('spin'); try{ if(await appChanged()){location.reload();return} if(await load()){ tidy(); await pull(); render(); } }catch(e){toast('重新整理失敗，稍後再試')}
    setTimeout(()=>{ptr.classList.remove('spin');ptr.style.height='0';busy=false},500);} else {ptr.style.height='0';ptr.classList.remove('spin');}
  pulled=0; });
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
