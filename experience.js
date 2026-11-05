/* 사유의 방 체험: 공간·불상 코드는 index.html에서 관리한다. */
function createSayuExperience({THREE,canvas,camera,statues,roomSpec,constrainPosition,starBrightness,groundHeight=()=>0}){
const $=s=>document.querySelector(s);
/* ---------- 시점 ---------- */
const view=roomSpec.view;
const st={x:0,z:view.startZ,eye:1.6,yaw:0,pitch:view.entryPitch};
let locked=true;
function applyCam(){
  const eyeY=st.eye+groundHeight(st.x,st.z);
  camera.position.set(st.x,eyeY,st.z);
  const cp=Math.cos(st.pitch);
  camera.lookAt(st.x-Math.sin(st.yaw)*cp,eyeY+Math.sin(st.pitch),st.z-Math.cos(st.yaw)*cp);
}
function clampPos(){
  const position=constrainPosition(st.x,st.z);st.x=position.x;st.z=position.z;
  for(const s of statues){const dx=st.x-s.x,dz=st.z-s.z,dd=Math.hypot(dx,dz);if(dd<1.15){if(dd<.0001){st.z=s.z+1.15;continue;}st.x=s.x+dx/dd*1.15;st.z=s.z+dz/dd*1.15;}}
}

/* 트윈 */
const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
const tweens=[];
function tween(props,dur,easing=ease){return new Promise(res=>{const from={};for(const k in props)from[k]=st[k];
  if('yaw' in props){let d=props.yaw-from.yaw;d=Math.atan2(Math.sin(d),Math.cos(d));props.yaw=from.yaw+d;}
  tweens.push({from,props,dur,easing,t:0,res});});}
const wait=ms=>new Promise(r=>setTimeout(r,ms));

/* 끌어서 둘러보기 / 탭으로 다가가기 */
let drag=null;
canvas.addEventListener('pointerdown',e=>{if(locked)return;drag={x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(locked||!drag||e.pointerId!==drag.id)return;
  const k=2.6/Math.max(innerWidth,innerHeight);
  st.yaw+=(e.clientX-drag.x)*k; st.pitch=Math.max(-1.2,Math.min(1.1,st.pitch+(e.clientY-drag.y)*k));
  drag.x=e.clientX;drag.y=e.clientY;});
canvas.addEventListener('pointerup',e=>{if(locked){drag=null;return;}if(!drag)return;const moved=Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy);drag=null;if(moved<8)pick(e);});
canvas.addEventListener('pointercancel',()=>drag=null);
const ray=new THREE.Raycaster();
function pick(e){
  const r=canvas.getBoundingClientRect();
  ray.setFromCamera({x:((e.clientX-r.left)/r.width)*2-1,y:-((e.clientY-r.top)/r.height)*2+1},camera);
  for(const s of statues){if(ray.intersectObject(s.grp,true).length){approach(s);return;}}
}
async function approach(s){
  if(locked)return;locked=true;resetInput();
  const distance=view.approachDistance;
  const tx=s.x,tz=s.z+distance;
  const yaw0=Math.atan2(-(tx-st.x),-(tz-st.z));
  const dist=Math.hypot(tx-st.x,tz-st.z);
  if(dist>.3){await tween({yaw:yaw0,pitch:0},.9);await tween({x:tx,z:tz},Math.max(1.4,dist)/view.walkSpeed,t=>t);}
  await tween({yaw:0,pitch:Math.atan2((s.focusY??2.05)-st.eye-groundHeight(tx,tz),distance)},1.3);
  locked=false;
}

/* 걷기 */
const keys={};let move={x:0,y:0};
const joy=$('#joy'),knob=$('#knob');let joyId=null;
function joyReset(){joyId=null;move={x:0,y:0};knob.style.transform='';joy.classList.remove('on');}
function resetInput(){for(const k in keys)delete keys[k];joyReset();drag=null;}
addEventListener("blur",resetInput);
document.addEventListener("visibilitychange",resetInput);
addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;});
addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false;});
function joyUpdate(e){const r=joy.getBoundingClientRect();let dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);
  const m=r.width/2-12,d=Math.hypot(dx,dy);if(d>m){dx*=m/d;dy*=m/d;}knob.style.transform=`translate(${dx}px,${dy}px)`;
  const k=d<m*.12?0:1; move={x:dx/m*k,y:-dy/m*k};}
joy.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();if(locked)return;joyId=e.pointerId;try{joy.setPointerCapture(e.pointerId);}catch(_){}joy.classList.add('on');joyUpdate(e);});
joy.addEventListener('pointermove',e=>{if(e.pointerId===joyId)joyUpdate(e);});
const joyEnd=e=>{if(e.pointerId===joyId)joyReset();};
joy.addEventListener('pointerup',joyEnd);joy.addEventListener('pointercancel',joyEnd);

/* ---------- 소리: 싱잉볼과 낮은 울림 ---------- */
let ac=null,master=null,droneGain=null,soundOn=true;
function initAudio(){
  try{ac=new (window.AudioContext||window.webkitAudioContext)();}catch(e){return;}
  master=ac.createGain();master.gain.value=.9;master.connect(ac.destination);
  // 잔향
  const conv=ac.createConvolver();const len=ac.sampleRate*4.5,ir=ac.createBuffer(2,len,ac.sampleRate);
  for(let c=0;c<2;c++){const d=ir.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.6);}
  conv.buffer=ir;const wet=ac.createGain();wet.gain.value=.35;conv.connect(wet);wet.connect(master);
  ac._rev=conv;
  // 공간의 낮은 울림
  droneGain=ac.createGain();droneGain.gain.value=0;droneGain.connect(master);droneGain.connect(conv);
  for(const [f,v] of [[55,.05],[82.4,.03],[110.2,.012]]){const o=ac.createOscillator();o.frequency.value=f;const g=ac.createGain();g.gain.value=v;
    const lfo=ac.createOscillator();lfo.frequency.value=.05+Math.random()*.05;const lg=ac.createGain();lg.gain.value=v*.6;lfo.connect(lg);lg.connect(g.gain);
    o.connect(g);g.connect(droneGain);o.start();lfo.start();}
  // 공기 소리
  const nb=ac.createBuffer(1,ac.sampleRate*3,ac.sampleRate),nd=nb.getChannelData(0);let last=0;
  for(let i=0;i<nd.length;i++){last=(last+.02*(Math.random()*2-1))/1.02;nd[i]=last*3;}
  const ns=ac.createBufferSource();ns.buffer=nb;ns.loop=true;const nf=ac.createBiquadFilter();nf.type='lowpass';nf.frequency.value=380;
  const ngn=ac.createGain();ngn.gain.value=.05;ns.connect(nf);nf.connect(ngn);ngn.connect(droneGain);ns.start();
  droneGain.gain.linearRampToValueAtTime(1,ac.currentTime+6);
}
function bowl(vol=1,base=196){
  if(!ac||!soundOn)return;const t=ac.currentTime;
  const parts=[[1,1,9],[2.71,.5,6.5],[5.15,.22,4],[8.1,.1,2.6],[1.003,.6,9]];
  for(const [m,a,dec] of parts){const o=ac.createOscillator();o.type='sine';o.frequency.value=base*m;
    const g=ac.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.12*a*vol,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+dec);
    o.connect(g);g.connect(master);g.connect(ac._rev);o.start(t);o.stop(t+dec+.1);}
}
function knock(){ // 절할 때 바닥에 닿는 작은 목탁 소리
  if(!ac||!soundOn)return;const t=ac.currentTime;const o=ac.createOscillator();o.frequency.setValueAtTime(420,t);o.frequency.exponentialRampToValueAtTime(260,t+.12);
  const g=ac.createGain();g.gain.setValueAtTime(.22,t);g.gain.exponentialRampToValueAtTime(.0001,t+.35);o.connect(g);g.connect(master);g.connect(ac._rev);o.start(t);o.stop(t+.4);}

/* ---------- 연출 ---------- */
function toast(txt,ms=2600){const el=$('#toast');el.textContent=txt;el.style.opacity=1;clearTimeout(toast._t);toast._t=setTimeout(()=>el.style.opacity=0,ms);}
function showUI(v){for(const id of ['#bar','#pad','#presence'])$(id).style.opacity=v?1:0;$('#bar').style.pointerEvents=v?'auto':'none';$('#pad').style.pointerEvents=v?'auto':'none';}

// 화면이 멈춰도 시작 시각에서 현재 자세와 마친 횟수를 다시 계산한다.
// 각 단계의 길이는 기존 절하기와 같다: 1.5 + 1.8 + 1.5 + 1.5 + 1.5 + 0.4초.
const BOW_KEY='sayu-bow-v1',BOW_CYCLE=8200;
let bowSession=null,lastBowElapsed=null;
function readBowSession(){
  try{
    const saved=JSON.parse(sessionStorage.getItem(BOW_KEY));
    if(!saved)return null;
    if(saved.version!==1||![1,3,108].includes(saved.target)||!Number.isFinite(saved.startedAt)||saved.startedAt<=0||saved.startedAt>Date.now()+1000||
      !saved.pose||!['x','z','yaw','pitch','eye'].every(k=>Number.isFinite(saved.pose[k]))||saved.pose.eye!==1.6||Math.abs(saved.pose.pitch)>1.2){
      sessionStorage.removeItem(BOW_KEY);return null;
    }
    return saved;
  }catch(_){return null;}
}
function saveBowSession(){try{sessionStorage.setItem(BOW_KEY,JSON.stringify(bowSession));}catch(_){} }
function finishBow(done){
  if(!bowSession)return;
  const session=bowSession;bowSession=null;lastBowElapsed=null;
  try{sessionStorage.removeItem(BOW_KEY);}catch(_){}
  st.eye=session.pose.eye;st.pitch=session.pose.pitch;
  $('#bowing').hidden=true;locked=false;resetInput();showUI(true);
  if(done){bowl(.7);toast(session.target+'배를 마쳤습니다',3500);}
  const button=session.target===108?'#bBow108':session.target===3?'#bBow3':'#bBow';
  $(button).focus({preventScroll:true});
}
function updateBow(silent=false){
  if(!bowSession)return;
  const elapsed=Math.max(0,Date.now()-bowSession.startedAt),total=bowSession.target*BOW_CYCLE;
  const completed=Math.min(bowSession.target,Math.floor(elapsed/BOW_CYCLE));
  const label=completed+' / '+bowSession.target+'배';
  if($('#bowCount').textContent!==label)$('#bowCount').textContent=label;
  if(elapsed>=total){
    // 화면이 꺼진 동안 끝나면 완료 안내·소리는 돌아왔을 때 한 번만 낸다.
    if(!document.hidden)finishBow(true);
    return;
  }
  const phase=elapsed%BOW_CYCLE,p0=bowSession.pose.pitch;
  let from,to,progress;
  if(phase<1500){from={eye:1.6,pitch:p0};to={eye:1.05,pitch:-.1};progress=phase/1500;}
  else if(phase<3300){from={eye:1.05,pitch:-.1};to={eye:.55,pitch:-1.05};progress=(phase-1500)/1800;}
  else if(phase<4800){from=to={eye:.55,pitch:-1.05};progress=0;}
  else if(phase<6300){from={eye:.55,pitch:-1.05};to={eye:1,pitch:-.25};progress=(phase-4800)/1500;}
  else if(phase<7800){from={eye:1,pitch:-.25};to={eye:1.6,pitch:p0};progress=(phase-6300)/1500;}
  else{from=to={eye:1.6,pitch:p0};progress=0;}
  const k=ease(progress);st.eye=from.eye+(to.eye-from.eye)*k;st.pitch=from.pitch+(to.pitch-from.pitch)*k;
  // 복귀 때 지나간 목탁 소리를 몰아서 재생하지 않는다.
  if(!silent&&!document.hidden&&lastBowElapsed!==null&&elapsed-lastBowElapsed>=0&&elapsed-lastBowElapsed<600&&
    Math.floor(lastBowElapsed/BOW_CYCLE)===Math.floor(elapsed/BOW_CYCLE)&&lastBowElapsed%BOW_CYCLE<3300&&phase>=3300)knock();
  lastBowElapsed=elapsed;
}
function beginBow(session){
  bowSession=session;lastBowElapsed=null;locked=true;resetInput();showUI(false);
  Object.assign(st,session.pose);clampPos();
  $('#bowing').hidden=false;$('#bowStop').focus({preventScroll:true});
  updateBow(true);
}
function bow(n){
  if(locked||bowSession)return;
  const session={version:1,target:n,startedAt:Date.now(),pose:{x:st.x,z:st.z,yaw:st.yaw,pitch:st.pitch,eye:1.6}};
  beginBow(session);saveBowSession();
}
function restoreBow(){const session=readBowSession();if(session)beginBow(session);}
$('#bowStop').addEventListener('click',()=>finishBow(false));

/* 명상 */
let med=null;let wakeLock=null;
async function startMed(min){
  if(med||!locked)return;resetInput();
  $('#pick').hidden=true;locked=true;showUI(false);
  med={end:Date.now()+min*60000,start:Date.now()};
  try{wakeLock=await navigator.wakeLock?.request('screen');}catch(e){}
  bowl(1);
  $('#medi').classList.add('on','reveal');$('#mStop').focus();
}
async function endMed(done){
  if(!med)return;med=null;$('#medi').classList.remove('on','reveal');
  try{wakeLock&&wakeLock.release();}catch(e){}wakeLock=null;
  starBrightness.value=1;
  if(done){bowl(.9);await wait(2600);bowl(.8,174.6);await wait(2600);bowl(1);toast('명상을 마쳤습니다',3500);}
  locked=false;showUI(true);
}
$('#medi').addEventListener('pointerdown',e=>{if(e.target.id==='mStop')return;$('#medi').classList.add('reveal');clearTimeout(endMed._t);endMed._t=setTimeout(()=>$('#medi').classList.remove('reveal'),3500);});
$('#mStop').addEventListener('click',()=>endMed(false));

/* 버튼 */
$('#bBow').addEventListener('click',()=>bow(1));
$('#bBow3').addEventListener('click',()=>bow(3));
$('#bBow108').addEventListener('click',()=>bow(108));
$('#bMed').addEventListener('click',()=>{if(!locked){locked=true;resetInput();$('#pick').hidden=false;$('#pickCancel').focus();}});
$('#pickCancel').addEventListener('click',()=>{ $('#pick').hidden=true;locked=false;$('#bMed').focus(); });
document.querySelectorAll('#pick [data-min]').forEach(b=>b.addEventListener('click',()=>startMed(+b.dataset.min)));
$('#bSnd').addEventListener('click',()=>{soundOn=!soundOn;$('#bSnd').setAttribute('aria-pressed',soundOn);
  if(master){master.gain.cancelScheduledValues(ac.currentTime);master.gain.setTargetAtTime(soundOn?.9:0,ac.currentTime,.15);if(soundOn)ac.resume().catch(()=>{});}});

/* 입장 */
$('#enter').addEventListener('click',async()=>{
  if($('#enter').disabled)return;$('#enter').disabled=true;
  initAudio();if(ac&&ac.state==='suspended')ac.resume().catch(()=>{});
  $('#gate').classList.add('gone');
  setTimeout(()=>bowl(.8),1600);
  await tween({z:view.entryZ,pitch:view.entryPitch},6.5);
  locked=false;$('#bar').hidden=false;$('#pad').hidden=false;showUI(true);
  $('#presence').hidden=false;
  restoreBow();
});


document.addEventListener('visibilitychange',async()=>{
  if(document.hidden){if(ac)ac.suspend().catch(()=>{});return;}
  if(ac&&soundOn)ac.resume().catch(()=>{});
  updateBow(true);applyCam();
  if(med&&med.end>Date.now()){
    try{if(!wakeLock||wakeLock.released)wakeLock=await navigator.wakeLock?.request('screen');}catch(e){}
  }
});

return {update(now,dt){
  updateBow();
  for(let i=tweens.length-1;i>=0;i--){const tw=tweens[i];tw.t+=dt/tw.dur;const k=tw.easing(Math.min(1,tw.t));
    for(const p in tw.props)st[p]=tw.from[p]+(tw.props[p]-tw.from[p])*k;
    if(tw.t>=1){tweens.splice(i,1);tw.res();}}
  if(!locked){
    // 조이스틱: 위아래 = 앞뒤, 좌우 = 옆걸음. 키보드: W/S 앞뒤, A/D 고개 돌리기
    let fw=move.y,sd=move.x;if(keys['w']||keys['arrowup'])fw=1;if(keys['s']||keys['arrowdown'])fw=-1;
    if(keys['a']||keys['arrowleft'])st.yaw+=dt*1.2;if(keys['d']||keys['arrowright'])st.yaw-=dt*1.2;
    if(fw||sd){const sp=view.walkSpeed*dt,sy=Math.sin(st.yaw),cy=Math.cos(st.yaw);
      st.x+=(-sy*fw+cy*sd)*sp;st.z+=(-cy*fw-sy*sd)*sp;clampPos();}
  }
  if(med){
    const el=(Date.now()-med.start)/1000,cyc=el%10,inhale=cyc<4;
    const br=inhale?cyc/4:1-(cyc-4)/6;
    starBrightness.value=.55+.75*ease(br);
    const b=$('#breath');const want=inhale?'들이쉬고':'내쉬고';if(b.textContent!==want)b.textContent=want;
    const left=Math.max(0,med.end-Date.now());const m=Math.floor(left/60000),s=Math.floor(left/1000)%60;
    $('#remain').textContent=m+':'+String(s).padStart(2,'0');
    if(left<=0)endMed(true);
  }
  applyCam();
}};
}
