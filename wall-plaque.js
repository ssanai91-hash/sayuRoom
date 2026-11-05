/* 오른쪽 중간 벽의 쇠판. 원본 사진의 글씨·색·양각 음영을 그대로 사용한다. */
function createSayuWallPlaque({THREE,scene,renderer,outline,floorHeight}){
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
  const plate=new THREE.Mesh(new THREE.ExtrudeGeometry(outlineShape,{depth,steps:1,curveSegments:3,
    bevelEnabled:true,bevelThickness:.0025,bevelSize:.0025,bevelSegments:2}),steel);
  plate.name='dark-steel-wall-plaque';group.add(plate);
  group.userData={text:['두루 헤아리며,','깊은 생각에 잠기는 시간','—','Time to lose yourself','deep in wandering thought'],
    width,height,source:'사용자 첨부 1000051847.jpg 원본',sourcePixels:[300,150,1140,836]};

  // 글씨를 다시 그리거나 잘라낸 윤곽으로 재구성하지 않는다.
  // 원본 파일의 픽셀을 UV로 지정해 글자·금속 색·양각 그림자를 함께 보존한다.
  const ready=new Promise(resolve=>{
    const map=new THREE.TextureLoader().load('assets/wall-plaque-original.jpg',()=>{
      map.encoding=THREE.sRGBEncoding;
      map.wrapS=map.wrapT=THREE.ClampToEdgeWrapping;
      map.offset.set(300/1536,1-(150+836)/1152);
      map.repeat.set(1140/1536,836/1152);
      map.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
      map.magFilter=THREE.LinearFilter;
      // WebGL1에서는 비정방형 원본이 작은 POT 이미지로 자동 축소되지 않게 한다.
      map.generateMipmaps=renderer.capabilities.isWebGL2;
      map.minFilter=map.generateMipmaps?THREE.LinearMipmapLinearFilter:THREE.LinearFilter;
      map.needsUpdate=true;
      const material=new THREE.MeshBasicMaterial({map,color:0xffffff,toneMapped:false});
      const faceWidth=width-.01,faceHeight=faceWidth*836/1140;
      const face=new THREE.Mesh(new THREE.PlaneGeometry(faceWidth,faceHeight),material);
      face.name='original-photo-plaque-face';face.position.z=depth+.0028;group.add(face);
      resolve();
    },undefined,error=>{console.warn('쇠판 원본 사진을 불러오지 못했습니다:',error);resolve();});
  });
  return {group,ready};
}
