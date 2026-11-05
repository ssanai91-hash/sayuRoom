// #calib로 연 개발 화면에서만 내려받는다.
const poses = [
  ['입구 전체',[0,1.6,11.4],[0,1.72,-9.75]],
  ['오른쪽 정면',[1.3,1.6,-7.75],[1.3,1.72,-9.75]],
  ['왼쪽 뒤 ¾',[-2.8,1.6,-11.2],[-1.3,1.72,-9.75]],
  ['두 점 대각선',[2.9,1.7,-5.4],[0,1.62,-9.75]]
];

export function mountCalibration(camera,room){
  const saved=JSON.stringify(SAYU_LOOK);
  const panel=document.createElement('details');
  panel.id='sayu-calib';panel.open=true;
  panel.style.cssText='position:fixed;z-index:100;right:max(8px,env(safe-area-inset-right));top:max(8px,env(safe-area-inset-top));width:min(290px,90vw);max-height:53vh;overflow:auto;overscroll-behavior:contain;background:#211a16f5;color:#fff4e3;border:1px solid #99795b;border-radius:8px;padding:8px;font:14px/1.5 system-ui;text-align:left';
  const summary=document.createElement('summary');summary.textContent='색·빛 보정';panel.append(summary);
  let pose=null;
  function button(title,act){
    const b=document.createElement('button');b.type='button';b.textContent=title;b.onclick=act;
    b.style.cssText='padding:5px;margin:2px;color:#fff;background:#45392e;border:1px solid #8d7860;border-radius:4px';
    panel.append(b);return b;
  }
  poses.forEach(([title,eye,target],i)=>{
    button(title,()=>{pose={eye,target};}).dataset.pose=String(i+1);
  });
  button('시점 해제',()=>{pose=null;});
  const controls=[
    ['노출','renderer.exposure',0.5,1.5,.01],['벽 빛띠 세기','wall.strength',.3,2,.01],
    ['빛띠 두께 (m)','wall.width',.01,.5,.005],['벽 번짐 (m)','wall.spread',.4,3,.01],
    ['8자 밝기','ceiling.loopBrightness',.2,2,.01],['8자 크기 (m)','ceiling.loopSize',.01,.08,.001],
    ['배경 점광','ceiling.backgroundBrightness',.1,1,.01],['환경 반사','statue.reflection',.4,2.5,.01],
    ['접촉 음영','statue.ao',0,1.4,.01],['바닥 거칠기','floor.roughness',.2,1,.01],
    ['받침 윗면 반사','pedestalTop.reflection',0,1.4,.01],
    ['원통 옆면 거칠기','pedestal.roughness',.5,1,.01],['원통 옆면 광택','pedestal.reflectivity',0,.5,.01],
    ['오른쪽 청동 채도','statue.colorProfiles.1.saturation',0,1,.01],
    ['오른쪽 청동 밝기','statue.colorProfiles.1.gain',.5,1.4,.01],
    ['오른쪽 청동 붉은기','statue.colorProfiles.1.tint.0',.4,1.2,.01]
  ];
  for(const [name,title] of [['key','주광'],['rim','윤곽광'],['fill','보조광']]){
    controls.push([title+' 세기','lights.'+name+'.intensity',0,14,.05],
      [title+' 색온도 (K)','lights.'+name+'.kelvin',2200,6500,50],
      [title+' 조사각 (rad)','lights.'+name+'.angle',.1,.8,.01]);
  }
  for(const [title,path,min,max,step] of controls){
    const parts=path.split('.'),key=parts.pop(),obj=parts.reduce((o,k)=>o[k],SAYU_LOOK);
    const label=document.createElement('label'),input=document.createElement('input'),value=document.createElement('output');
    label.style.display='block';input.type='range';input.style.cssText='display:block;width:100%';
    Object.assign(input,{min,max,step,value:obj[key]});value.value=obj[key];
    input.oninput=()=>{obj[key]=Number(input.value);value.value=input.value;room.applyLook();};
    label.append(title+' ',value,input);panel.append(label);
  }
  const status=document.createElement('output');status.setAttribute('aria-live','polite');
  button('현재 값 JSON 복사',async()=>{
    const json=JSON.stringify(SAYU_LOOK,null,2);
    try{await navigator.clipboard.writeText(json);status.value='복사됨';}
    catch{const box=document.createElement('textarea');box.value=json;box.setAttribute('aria-label','복사할 JSON');panel.append(box);box.select();status.value='선택한 JSON을 복사하세요.';}
  });
  panel.append(status);document.body.append(panel);
  return {update(){if(pose){const [x,y,z]=pose.eye;
      camera.position.set(x,y+room.groundHeight(x,z),z);
      camera.lookAt(...pose.target);}},
    close(){panel.remove();Object.assign(SAYU_LOOK,JSON.parse(saved));room.applyLook();}};
}
