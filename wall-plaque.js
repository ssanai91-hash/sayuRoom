/* 원본 사진 위에 같은 UV의 픽셀 높이 메시를 더하는 쇠판. 폰트/윤곽 재조립 없음. */
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
    width,height,source:'사용자 첨부 1000051847.jpg 원본',sourcePixels:[300,150,1140,836],
    reliefHeight:.0032,reliefStatus:'loading',reliefMethod:'native-pixel-heightfield'};

  // 색상은 계속 원본이다. 사진에 이미 구워진 빛을 완전히 지울 수 없으므로
  // 배경은 원본 중심, 돌출면은 PBR 중심으로 혼합해 검은 글씨/과노출을 억제한다.
  function photoReliefMaterial(map){
    const material=new THREE.MeshStandardMaterial({map,color:0xffffff,toneMapped:false,
      metalness:.38,roughness:.57,envMapIntensity:.35,
      polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    material.onBeforeCompile=shader=>{
      shader.vertexShader='attribute float aPlaqueHeight; varying float vPlaqueHeight;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvPlaqueHeight=aPlaqueHeight;');
      shader.fragmentShader='varying float vPlaqueHeight;\n'+shader.fragmentShader;
      // Three.js r128 meshphysical_frag의 선형 색 공간에서 혼합, sRGB 출력은 한 번만.
      shader.fragmentShader=shader.fragmentShader.replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
        'float reliefLightMix=mix(0.24,0.72,smoothstep(0.0,0.6,vPlaqueHeight));\n'+
        'outgoingLight=mix(diffuseColor.rgb,outgoingLight,reliefLightMix);\n'+
        'gl_FragColor = vec4( outgoingLight, diffuseColor.a );');
    };
    material.customProgramCacheKey=()=> 'sayu-plaque-photo-relief-r128-v1';
    return material;
  }

  function addRelief(map,face,faceWidth,faceHeight,image){
    const w=image.naturalWidth,h=image.naturalHeight;
    if(w!==1140||h!==836)throw new Error('현판 높이 지도 크기 불일치');
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    if(!context)throw new Error('현판 높이 지도를 읽을 수 없습니다');
    context.drawImage(image,0,0);
    const pixels=context.getImageData(0,0,w,h).data;
    const material=photoReliefMaterial(map),meshes=[];
    // 48줄씩 나눠 최악에도 55,860정점 이하. WebGL1 Uint32 인덱스 확장 불필요.
    // 글씨 주변 셀만 만들며 빈 글자 구멍은 높이 0의 판으로 남긴다.
    for(let start=0;start<h-1;start+=48){
      const end=Math.min(start+48,h-1),positions=[],uvs=[],heights=[],indices=[];
      const lookup=new Int32Array((end-start+1)*w);lookup.fill(-1);
      function vertex(x,y){
        const slot=(y-start)*w+x;
        if(lookup[slot]>=0)return lookup[slot];
        const value=pixels[(y*w+x)*4]/255,index=positions.length/3;
        positions.push(((x+.5)/w-.5)*faceWidth,(.5-(y+.5)/h)*faceHeight,value*.0032);
        uvs.push((x+.5)/w,1-(y+.5)/h);heights.push(value);lookup[slot]=index;return index;
      }
      for(let y=start;y<end;y++)for(let x=0;x<w-1;x++){
        const offset=(y*w+x)*4;
        if(!(pixels[offset]||pixels[offset+4]||pixels[offset+w*4]||pixels[offset+w*4+4]))continue;
        const a=vertex(x,y),b=vertex(x+1,y),c=vertex(x,y+1),d=vertex(x+1,y+1);
        // 사진 y축은 아래, 메시 y축은 위: 앞면(+z)을 향하는 순서.
        indices.push(a,c,b,b,c,d);
      }
      if(!indices.length)continue;
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
      geometry.setAttribute('aPlaqueHeight',new THREE.Float32BufferAttribute(heights,1));
      geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices),1));
      // 중앙차분 높이 기울기. 띠 경계에서도 같은 이웃 픽셀을 읽어 법선 이음새 방지.
      const normals=new Float32Array(positions.length);
      for(let y=start;y<=end;y++)for(let x=0;x<w;x++){
        const index=lookup[(y-start)*w+x];if(index<0)continue;
        const left=Math.max(0,x-1),right=Math.min(w-1,x+1),up=Math.max(0,y-1),down=Math.min(h-1,y+1);
        const dx=(pixels[(y*w+right)*4]-pixels[(y*w+left)*4])*.0032/255/((right-left)*faceWidth/w);
        const dy=(pixels[(up*w+x)*4]-pixels[(down*w+x)*4])*.0032/255/((down-up)*faceHeight/h);
        const length=Math.hypot(dx,dy,1);normals.set([-dx/length,-dy/length,1/length],index*3);
      }
      geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
      const mesh=new THREE.Mesh(geometry,material);mesh.name='plaque-raised-pixel-band-'+start;
      mesh.position.z=face.position.z;mesh.castShadow=true;mesh.receiveShadow=true;meshes.push(mesh);
    }
    if(!meshes.length){material.dispose();throw new Error('빈 현판 높이 지도');}
    // 전부 준비된 뒤 한 번에 교체. 실패 시 원본 사진 면이 그대로 남는다.
    const old=face.material;face.material=material;face.receiveShadow=true;
    face.geometry.setAttribute('aPlaqueHeight',new THREE.Float32BufferAttribute(new Float32Array(4),1));
    old.dispose();meshes.forEach(mesh=>group.add(mesh));

    // 현판 앞의 작은 전용 주광. 방 전체 광원/불상 조명을 덮어쓰지 않는다.
    const key=new THREE.SpotLight(0xfff3e1,2.1,4.5,.82,.5,1);
    key.name='plaque-grazing-light';key.position.set(-.85,1.25,1.65);
    key.target.position.set(0,0,depth);group.add(key,key.target);
    key.castShadow=true;key.shadow.mapSize.set(1024,1024);
    key.shadow.camera.near=.1;key.shadow.camera.far=4.5;
    key.shadow.bias=-.000002;key.shadow.normalBias=.0001;key.shadow.radius=1;
    // 방은 정적 그림자를 쓴다. 이후 앱/GPU 복귀 갱신은 기존 restoreLighting이 담당.
    key.shadow.needsUpdate=true;renderer.shadowMap.needsUpdate=true;
    group.userData.reliefStatus='ready';
    canvas.width=canvas.height=1;
  }

  // 글씨를 다시 그리지 않는다. 사진을 먼저 준비해 높이 지도 실패에도 읽을 수 있게 한다.
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
      const image=new Image();
      image.onload=()=>{
        try{addRelief(map,face,faceWidth,faceHeight,image);}
        catch(error){group.userData.reliefStatus='photo-fallback';console.warn('현판 양각 대신 원본을 표시합니다:',error);}
        resolve();
      };
      image.onerror=()=>{group.userData.reliefStatus='photo-fallback';console.warn('현판 높이 지도를 불러오지 못해 원본을 표시합니다.');resolve();};
      // 높이 PNG는 작은 JSON 안에 무손실로 보관해 소스와 함께 원자적으로 올린다.
      fetch('assets/wall-plaque-relief-v1.json').then(response=>{
        if(!response.ok)throw new Error('현판 높이 지도 HTTP '+response.status);
        return response.json();
      }).then(data=>{
        if(data.sourceSha256!=='c09e73ea91c232500a582a2e078865a5630fa46a171a1b5c51fa8c2a7ce226c9'||
          !data.pngBase64)throw new Error('현판 높이 지도 원본 불일치');
        image.src='data:image/png;base64,'+data.pngBase64;
      }).catch(error=>{group.userData.reliefStatus='photo-fallback';console.warn('현판 양각 대신 원본을 표시합니다:',error);resolve();});
    },undefined,error=>{group.userData.reliefStatus='source-error';console.warn('쇠판 원본 사진을 불러오지 못했습니다:',error);resolve();});
  });
  return {group,ready};
}

