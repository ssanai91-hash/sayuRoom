/* 오른쪽 중간 벽의 쇠판. 글자는 첨부 사진에서 추출한 윤곽을 실제 양각으로 만든다. */
function createSayuWallPlaque({THREE,scene,outline,floorHeight}){
  // 오른쪽의 긴 직선 벽을 골라 그 중간에 밀착한다. 방 외곽선을 바꾸면 위치도 함께 따라간다.
  const candidates=outline.map((a,i)=>{
    const b=outline[(i+1)%outline.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    return {a,b,length,nx:-dz/length,nz:dx/length};
  }).filter(edge=>edge.a[0]>0&&edge.b[0]>0&&edge.nx<-.9);
  const edge=candidates.sort((a,b)=>b.length-a.length)[0];
  const group=new THREE.Group();group.name='right-mid-contemplation-plaque';
  const x=(edge.a[0]+edge.b[0])/2,z=(edge.a[1]+edge.b[1])/2;
  group.position.set(x+edge.nx*.028,floorHeight(z)+1.65,z+edge.nz*.028);
  group.rotation.y=Math.atan2(edge.nx,edge.nz);scene.add(group);

  const width=2.25,height=1.65,depth=.018;
  function roundedPanel(w,h,r){
    const shape=new THREE.Shape(),left=-w/2,right=w/2,bottom=-h/2,top=h/2;
    shape.moveTo(left+r,bottom);shape.lineTo(right-r,bottom);
    shape.quadraticCurveTo(right,bottom,right,bottom+r);shape.lineTo(right,top-r);
    shape.quadraticCurveTo(right,top,right-r,top);shape.lineTo(left+r,top);
    shape.quadraticCurveTo(left,top,left,top-r);shape.lineTo(left,bottom+r);
    shape.quadraticCurveTo(left,bottom,left+r,bottom);return shape;
  }
  const outlineShape=roundedPanel(width,height,.007);
  const contact=new THREE.Mesh(new THREE.ShapeGeometry(outlineShape,3),new THREE.MeshBasicMaterial({
    color:0x050504,transparent:true,opacity:.52,depthWrite:false}));
  contact.position.set(.006,-.009,-.025);contact.scale.set(1.02,1.02,1);
  contact.name='plaque-wall-contact-shadow';group.add(contact);

  const steel=new THREE.MeshStandardMaterial({color:new THREE.Color(0x353638).convertSRGBToLinear(),
    metalness:.52,roughness:.73,envMapIntensity:.45});
  // 미세한 금속 입자 결을 코드로 표현하고 이 방의 실제 조명·반사를 받는다.
  steel.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec2 vPlate;\n'+shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vPlate=position.xy;');
    shader.fragmentShader='varying vec2 vPlate;\n'+shader.fragmentShader.replace('#include <color_fragment>',
      `#include <color_fragment>
       float grain=fract(sin(dot(floor(vPlate*1700.),vec2(127.1,311.7)))*43758.5453);
       float brushed=.5+.5*sin(vPlate.y*2400.+sin(vPlate.x*71.)*.5);
       diffuseColor.rgb*=.945+.085*grain+.025*brushed;`);
  };
  const plate=new THREE.Mesh(new THREE.ExtrudeGeometry(outlineShape,{depth,steps:1,curveSegments:3,
    bevelEnabled:true,bevelThickness:.0025,bevelSize:.0025,bevelSegments:2}),steel);
  plate.name='dark-steel-wall-plaque';group.add(plate);
  group.userData={text:['두루 헤아리며,','깊은 생각에 잠기는 시간','—','Time to lose yourself','deep in wandering thought'],
    width,height,letterRelief:.0032,source:'사용자 첨부 1000051847.jpg의 글자 윤곽'};

  // 이 판만 은은하게 비추는 상부 조명. 별도 그림자 맵은 만들지 않는다.
  const light=new THREE.SpotLight(0xffefdb,2.8,4.5,.85,.95,1.4);
  light.position.set(-.42,.9,1.6);light.target.position.set(0,0,.02);
  group.add(light,light.target);

  const ready=fetch('assets/wall-plaque-lettering.json').then(response=>{
    if(!response.ok)throw new Error('plaque lettering '+response.status);
    return response.json();
  }).then(data=>{
    const shapes=data.shapes.map(item=>{
      const shape=new THREE.Shape(item.outer.map(([x,y])=>new THREE.Vector2(x,y)));
      for(const ring of item.holes)shape.holes.push(new THREE.Path(ring.map(([x,y])=>new THREE.Vector2(x,y))));
      return shape;
    });
    const brass=new THREE.MeshStandardMaterial({color:new THREE.Color(0xc6b49c).convertSRGBToLinear(),
      metalness:.68,roughness:.46,envMapIntensity:.65});
    const lettering=new THREE.Mesh(new THREE.ExtrudeGeometry(shapes,{depth:.0032,steps:1,curveSegments:1,
      bevelEnabled:true,bevelThickness:.00055,bevelSize:.00055,bevelSegments:1}),brass);
    lettering.geometry.clearGroups(); // 모든 글자를 단일 재질·한 번의 드로로 그린다.
    lettering.name='photo-traced-raised-brass-lettering';lettering.position.z=depth+.00065;group.add(lettering);
    // 글자 밑에 아주 좁은 접촉 음영을 둬 양각 두께를 드러낸다.
    const letterShadow=new THREE.Mesh(new THREE.ShapeGeometry(shapes,1),new THREE.MeshBasicMaterial({
      color:0x0c0b09,transparent:true,opacity:.48,depthWrite:false}));
    letterShadow.name='raised-letter-contact-shadows';letterShadow.position.set(.0014,-.0022,depth+.00008);group.add(letterShadow);
  }).catch(error=>{console.warn('쇠판 글자를 불러오지 못했습니다:',error);});
  return {group,ready};
}
