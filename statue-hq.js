/* 2단계 고화질: 불상에 다가가면 KTX2 고화질 텍스처로 부드럽게 교체한다.
   - models/hq/manifest.json이 없으면(아직 고화질 파일이 없으면) 아무것도 하지 않는다.
   - 받지 않는 경우: 데이터 절약 모드, 기기 메모리 4GB 미만, 압축 텍스처 미지원 기기.
   - 절하기·명상 중에는 교체를 미루고 끝난 뒤 적용한다.
   - 시험용: 주소에 ?hq=force (조건 무시하고 받기) / ?hq=off (끄기). */
function createSayuHQ({THREE,renderer,statues,isBusy=()=>false,base='models/hq/',transcoder='vendor/three-r128/basis/',triggerDistance=6,fadeSeconds=.8}){
  const mode=new URLSearchParams(location.search).get('hq');
  const models=[];               // index → 불러온 2K 모델(Group)
  const state={phase:'idle',reason:'',swapped:0};
  let manifest=null,loader=null,fades=[],pendingSwaps=[];

  function log(...a){console.info('[사유의 방 고화질]',...a);}
  function eligible(){
    if(mode==='off')return 'off';
    if(mode==='force')return '';
    const c=navigator.connection;
    if(c&&c.saveData)return 'saveData';
    if(typeof navigator.deviceMemory==='number'&&navigator.deviceMemory<4)return 'deviceMemory<4';
    const cfg=loader&&loader.basisLoader&&loader.basisLoader.workerConfig;
    if(cfg&&!(cfg.astcSupported||cfg.etc2Supported||cfg.etc1Supported||cfg.dxtSupported||cfg.bptcSupported||cfg.pvrtcSupported))return 'noCompressedFormat';
    return '';
  }

  // 아주 옅은 진행 점: 받는 동안만 화면 위 왼쪽 구석에 숨 쉬듯 깜빡인다.
  let dot=null;
  function showDot(on){
    if(on&&!dot){
      dot=document.createElement('div');dot.setAttribute('aria-hidden','true');dot.title='불상 고화질 준비 중';
      dot.style.cssText='position:fixed;z-index:7;width:6px;height:6px;border-radius:50%;background:#e8c7a4;opacity:.0;pointer-events:none;'+
        'left:calc(max(12px,env(safe-area-inset-left,0px)) + 2px);top:calc(env(safe-area-inset-top,0px) + 8px);transition:opacity 1.2s';
      document.body.appendChild(dot);
      let t=0;dot._timer=setInterval(()=>{t^=1;dot.style.opacity=t?'.55':'.15';},1300);
      requestAnimationFrame(()=>dot&&(dot.style.opacity='.4'));
    }else if(!on&&dot){clearInterval(dot._timer);const d=dot;dot=null;d.style.opacity='0';setTimeout(()=>d.remove(),1300);}
  }

  async function init(){
    if(mode==='off'){state.phase='off';return;}
    try{
      const r=await fetch(base+'manifest.json',{cache:'no-cache'});
      if(!r.ok){state.phase='none';state.reason='manifest '+r.status;return;}
      manifest=await r.json();
    }catch(e){state.phase='none';state.reason='manifest';return;}
    if(!THREE.KTX2Loader){state.phase='none';state.reason='loader';log('KTX2Loader 없음');return;}
    loader=new THREE.KTX2Loader().setTranscoderPath(transcoder).detectSupport(renderer);
    const why=eligible();
    if(why){state.phase='skip';state.reason=why;log('2K 유지:',why);return;}
    state.phase='ready';
  }
  const ready=init();

  function setModel(index,model){models[index]=model;}

  // manifest 항목은 파일 이름 문자열이거나, 큰 파일을 나눈 {"parts":[...],"bytes":N,"sha256":"..."}.
  // 받은 바이트는 크기·SHA-256으로 확인한다(이름 해시 8자리 또는 sha256 전체). 잘린 파일은 쓰지 않는다.
  async function fetchBytes(spec){
    const parts=typeof spec==='string'?[spec]:spec.parts;
    const buffers=await Promise.all(parts.map(async p=>{const r=await fetch(base+p);if(!r.ok)throw new Error(p+' '+r.status);return r.arrayBuffer();}));
    const total=buffers.reduce((s,b)=>s+b.byteLength,0),bytes=new Uint8Array(total);let o=0;
    for(const b of buffers){bytes.set(new Uint8Array(b),o);o+=b.byteLength;}
    if(spec.bytes&&total!==spec.bytes)throw new Error('크기 불일치 '+total+'≠'+spec.bytes);
    const want=(typeof spec==='string'?(spec.match(/\.([0-9a-f]{8})\.ktx2$/)||[])[1]:spec.sha256)||'';
    if(want&&crypto.subtle){
      const hex=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
      if(!hex.startsWith(want.toLowerCase()))throw new Error('해시 불일치 '+hex.slice(0,8)+'≠'+want.slice(0,8));
    }
    return bytes;
  }
  async function loadTexture(spec,color){
    const url=URL.createObjectURL(new Blob([await fetchBytes(spec)]));
    try{
      return await new Promise((resolve,reject)=>loader.load(url,t=>{
        t.flipY=false;t.encoding=color?THREE.sRGBEncoding:THREE.LinearEncoding;
        t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());resolve(t);},undefined,reject));
    }finally{URL.revokeObjectURL(url);}
  }

  async function fetchStatue(entry){
    const [map,normal,orm]=await Promise.all([loadTexture(entry.color,true),loadTexture(entry.normal,false),loadTexture(entry.orm,false)]);
    return {entry,map,normal,orm};
  }

  // 같은 형상 위에 고화질 재질을 겹쳐 0→1로 서서히 보이게 한 뒤 원래 재질과 바꾼다.
  function applySwap(job){
    const model=models[job.entry.index];if(!model)return;
    const done=[];
    model.traverse(o=>{
      if(!o.isMesh||o.userData.sayuHQ)return;
      const old=o.material,hq=old.clone();
      hq.map=job.map;hq.normalMap=job.normal;hq.normalScale.setScalar(job.entry.normalScale??.65);
      hq.roughnessMap=hq.metalnessMap=hq.aoMap=job.orm;hq.aoMapIntensity=job.entry.aoIntensity??old.aoMapIntensity;
      hq.metalness=1;hq.roughness=1;
      if(!o.geometry.attributes.uv2&&o.geometry.attributes.uv)o.geometry.setAttribute('uv2',o.geometry.attributes.uv.clone());
      const fadeMat=hq.clone();fadeMat.transparent=true;fadeMat.opacity=0;fadeMat.depthWrite=false;fadeMat.depthFunc=THREE.LessEqualDepth;
      const overlay=new THREE.Mesh(o.geometry,fadeMat);overlay.userData.sayuHQ=true;overlay.renderOrder=2;overlay.castShadow=false;
      o.add(overlay);done.push({mesh:o,old,hq,overlay,fadeMat});
    });
    fades.push({t:0,parts:done,job});
  }
  function finishFade(f){
    const oldTextures=new Set();
    for(const p of f.parts){
      p.mesh.material=p.hq;p.mesh.remove(p.overlay);p.fadeMat.dispose();
      for(const k of ['map','normalMap','roughnessMap','metalnessMap','aoMap'])if(p.old[k])oldTextures.add(p.old[k]);
      p.old.dispose();
    }
    // 2K 텍스처는 버려 GPU 메모리를 돌려받는다(고화질 재질이 쓰는 것은 제외).
    for(const t of oldTextures)if(t!==f.job.map&&t!==f.job.normal&&t!==f.job.orm)t.dispose();
    state.swapped++;log('교체 완료:',f.job.entry.side);
  }

  async function start(from){
    state.phase='loading';showDot(true);
    const order=manifest.statues.slice().sort((a,b)=>{
      const s=i=>statues[i]?Math.hypot(statues[i].x-from.x,statues[i].z-from.z):0;return s(a.index)-s(b.index);});
    for(const entry of order){
      try{const job=await fetchStatue(entry);pendingSwaps.push(job);}
      catch(e){console.warn('[사유의 방 고화질] 받기 실패, 2K 유지:',entry.side,e);}
    }
    showDot(false);state.phase='loaded';
  }

  function update(cameraPos,dt){
    if(state.phase==='ready'&&models.filter(Boolean).length===statues.length){
      for(const s of statues){
        if(Math.hypot(s.x-cameraPos.x,s.z-cameraPos.z)<triggerDistance){start(cameraPos);break;}
      }
    }
    if(pendingSwaps.length&&!fades.length&&!isBusy())applySwap(pendingSwaps.shift());
    for(let i=fades.length-1;i>=0;i--){
      const f=fades[i];f.t+=dt/fadeSeconds;const k=Math.min(1,f.t);
      for(const p of f.parts)p.fadeMat.opacity=k*k*(3-2*k);
      if(f.t>=1){finishFade(f);fades.splice(i,1);}
    }
  }
  return {ready,setModel,update,state};
}
if(typeof module!=='undefined')module.exports={createSayuHQ};
