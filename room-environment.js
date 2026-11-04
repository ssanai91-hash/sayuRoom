/* 긴 마름모꼴 평면: 불상 뒤는 짧은 직선 벽, 양옆 벽은 비스듬히 벌어져 입구 쪽에서 가장 넓다.
   방 치수는 설계값(m), 불상은 실물 규격. outline은 위에서 본 (x,z) 꼭짓점, 반시계 방향. */
const SAYU_ROOM_SPEC=Object.freeze({
  outline:Object.freeze([[-3.6,-13],[3.6,-13],[5.5,10],[4.4,14],[-4.4,14],[-5.5,10]]),
  wallHeight:4.2,
  view:Object.freeze({startZ:12.8,entryZ:11.4,entryPitch:.03,walkSpeed:1,portraitFov:82,landscapeFov:62}),
  platform:Object.freeze({radiusX:3.3,radiusZ:2.7,centerZ:-9.5,height:.12}),
  ceilingLights:Object.freeze({width:5,depth:2.7,centerZ:-9.75,loopCount:96,backgroundCount:1440}),
  pedestals:Object.freeze([
    Object.freeze({x:-1.3,z:-9.75,width:.64,depth:.64,height:1.02,statueHeight:.815}),
    Object.freeze({x:1.3,z:-9.75,width:.68,depth:.68,height:1.02,statueHeight:.908})
  ])
});

function createSayuEnvironment({THREE,scene,renderer,loadTexture,environment=true}){
  const spec=SAYU_ROOM_SPEC,p=spec.platform,statues=[],pending=[];
  const maxAnisotropy=renderer.capabilities.getMaxAnisotropy();
  const loader=new THREE.TextureLoader();
  function texture(path,color){
    let map;
    if(loadTexture)map=loadTexture(path);
    else pending.push(new Promise(resolve=>{
      map=loader.load(path,()=>resolve(),undefined,error=>{console.warn('전시실 재질을 불러오지 못했습니다:',path,error);resolve();});
    }));
    map.wrapS=map.wrapT=THREE.RepeatWrapping;
    map.anisotropy=Math.min(8,maxAnisotropy);
    map.encoding=color?THREE.sRGBEncoding:THREE.LinearEncoding;
    return map;
  }
  const wood=texture('assets/gallery-wood.webp',true);
  const bump=texture('assets/gallery-wood-bump.png',false);
  const roughness=texture('assets/gallery-wood-roughness.png',false);
  function floorMaterial(color,rough,reflection){
    return new THREE.MeshStandardMaterial({color,map:wood,bumpMap:bump,bumpScale:.009,
      roughnessMap:roughness,roughness:rough,metalness:0,envMapIntensity:reflection});
  }
  // 같은 판재 폭을 유지하도록 도형의 실제 X/Z 좌표로 UV를 만든다.
  function planarUV(geometry,zOffset=0){
    const a=geometry.attributes.position,uv=geometry.attributes.uv;
    for(let i=0;i<a.count;i++)uv.setXY(i,a.getX(i)/1.8,(a.getZ(i)+zOffset)/3.6);
    uv.needsUpdate=true;return geometry;
  }
  // 각진 볼록 다각형 평면. 바닥은 rotateX(-90°)에서 도형 y가 -z가 되므로 y=-z로 넣는다.
  const corners=spec.outline.map(([x,z])=>({x,z}));
  const xs=corners.map(c=>c.x),zs=corners.map(c=>c.z);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  const spanX=maxX-minX,spanZ=maxZ-minZ;
  const outline=new THREE.Shape(corners.map(c=>new THREE.Vector2(c.x,-c.z)));
  // 변마다 안쪽을 향한 단위 법선. 반시계 순서라 (−dz, dx)가 안쪽이다.
  const edges=corners.map((a,i)=>{const b=corners[(i+1)%corners.length],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz);
    return {a,nx:-dz/l,nz:dx/l};});
  function constrainPosition(x,z,margin=.45){
    // 볼록 다각형: 벽에서 margin 안쪽으로 들어올 때까지 어긴 변의 법선 방향으로 민다.
    for(let k=0;k<6;k++){let moved=false;
      for(const e of edges){const d=(x-e.a.x)*e.nx+(z-e.a.z)*e.nz;
        if(d<margin){x+=(margin-d)*e.nx;z+=(margin-d)*e.nz;moved=true;}}
      if(!moved)break;}
    return {x,z};
  }
  const floorGeo=new THREE.ShapeGeometry(outline,1);
  floorGeo.rotateX(-Math.PI/2);planarUV(floorGeo);
  const floor=new THREE.Mesh(floorGeo,floorMaterial(0x777d7f,.58,.65));
  floor.name='gallery-floor';floor.receiveShadow=true;scene.add(floor);

  const platformGeo=new THREE.CylinderGeometry(.996,1,p.height,128,1);
  platformGeo.scale(p.radiusX,1,p.radiusZ);planarUV(platformGeo,p.centerZ);
  const edge=new THREE.MeshStandardMaterial({color:new THREE.Color(0x171310).convertSRGBToLinear(),roughness:.64,metalness:0});
  const platform=new THREE.Mesh(platformGeo,[edge,floorMaterial(0x8c7d70,.94,.16),edge]);
  platform.name='elliptical-timber-platform';platform.position.set(0,p.height/2,p.centerZ);
  platform.receiveShadow=true;scene.add(platform);
  // 얇은 검은 하부 틈의 그림자로 단의 두께를 표현한다.
  const recess=new THREE.Mesh(new THREE.CylinderGeometry(.995,.995,.025,128,1),new THREE.MeshStandardMaterial({color:new THREE.Color(0x050505).convertSRGBToLinear(),roughness:.9}));
  recess.scale.set(p.radiusX,1,p.radiusZ);recess.position.set(0,.013,p.centerZ);scene.add(recess);

  const wallMat=new THREE.ShaderMaterial({side:THREE.BackSide,
    uniforms:{uGlow:{value:1},uPerimeter:{value:corners.reduce((t,a,i)=>{const b=corners[(i+1)%corners.length];return t+Math.hypot(b.x-a.x,b.z-a.z);},0)}},
    vertexShader:`varying vec2 vUv;varying vec3 vP;void main(){vUv=uv;vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 vUv;varying vec3 vP;uniform float uGlow;uniform float uPerimeter;
    float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
    void main(){
      float y=vUv.y;float along=vUv.x*uPerimeter;
      float plaster=.6*n(vec2(along*6.,vP.y*31.))+.4*n(vec2(along*24.,vP.y*125.));
      vec3 low=vec3(.004,.0023,.0017),mid=vec3(.075,.030,.015),top=vec3(.66,.38,.23);
      vec3 c=mix(low,mid,smoothstep(.05,.86,y));
      c=mix(c,top,exp((y-1.)*8.)*uGlow);
      c*=.965+.07*plaster;gl_FragColor=vec4(c,1.);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }`
  });
  // 같은 꼭짓점으로 벽을 세운다. 모서리는 각지게 두고, 상단 간접광은 둘레를 따라 끊김 없이 잇는다.
  const perimeter=[];
  corners.forEach((a,i)=>{const b=corners[(i+1)%corners.length],n=Math.max(2,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.5));
    for(let k=0;k<n;k++)perimeter.push({x:a.x+(b.x-a.x)*k/n,z:a.z+(b.z-a.z)*k/n});});
  perimeter.push({...corners[0]});
  const wallVertices=[],wallUV=[],wallIndices=[];let run=0;
  for(let i=0;i<perimeter.length;i++){
    const v=perimeter[i];if(i)run+=Math.hypot(v.x-perimeter[i-1].x,v.z-perimeter[i-1].z);
    wallVertices.push(v.x,0,v.z,v.x,spec.wallHeight,v.z);
    wallUV.push(run,0,run,1);
    if(i<perimeter.length-1){const j=i*2;wallIndices.push(j,j+1,j+2,j+2,j+1,j+3);}
  }
  for(let i=0;i<wallUV.length;i+=2)wallUV[i]/=run;
  const wallGeo=new THREE.BufferGeometry();
  wallGeo.setAttribute('position',new THREE.Float32BufferAttribute(wallVertices,3));
  wallGeo.setAttribute('uv',new THREE.Float32BufferAttribute(wallUV,2));
  wallGeo.setIndex(wallIndices);wallGeo.computeVertexNormals();
  const wall=new THREE.Mesh(wallGeo,wallMat);
  wall.name='warm-plaster-cove-wall';scene.add(wall);
  // 바닥과 같은 평면을 위에 두고 아래에서 보이도록 뒷면을 그린다(뒤집으면 앞뒤가 바뀐다).
  const ceiling=new THREE.Mesh(floorGeo.clone(),new THREE.MeshBasicMaterial({color:0x010101,side:THREE.BackSide}));
  ceiling.name='black-ceiling';ceiling.position.y=spec.wallHeight+.02;scene.add(ceiling);

  // 가로 8자의 두 고리. 호 길이를 따라 나눠 점광 사이의 간격을 일정하게 유지한다.
  const lighting=spec.ceilingLights,count=lighting.loopCount+lighting.backgroundCount;
  const positions=new Float32Array(count*3),phase=new Float32Array(count),size=new Float32Array(count),luminosity=new Float32Array(count);
  let seed=28483;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const samples=[],lengths=[0],steps=1024;
  for(let j=0;j<=steps;j++){
    const t=j/steps*Math.PI*2,point=new THREE.Vector2(lighting.width/2*Math.sin(t),lighting.depth/2*Math.sin(2*t));
    if(j)lengths[j]=lengths[j-1]+point.distanceTo(samples[j-1]);samples.push(point);
  }
  let segment=0;
  for(let i=0;i<lighting.loopCount;i++){
    // 교차점에 전구가 정확히 중복되지 않도록 반 간격 이동한다.
    const distance=(i+.5)/lighting.loopCount*lengths[steps];
    while(segment<steps-1&&lengths[segment+1]<distance)segment++;
    const f=(distance-lengths[segment])/(lengths[segment+1]-lengths[segment]);
    const point=samples[segment].clone().lerp(samples[segment+1],f);
    positions.set([point.x,spec.wallHeight-.025,point.y+lighting.centerZ],i*3);
    phase[i]=random()*Math.PI*2;size[i]=2.65+random()*.25;luminosity[i]=1.2;
  }
  // 사진처럼 방 전체를 덮는 조용한 점광 격자. 작품 위 8자만 더 밝게 둔다.
  const columns=Math.ceil(spanX/.55),rows=Math.ceil(lighting.backgroundCount/columns);
  for(let i=lighting.loopCount;i<count;i++){
    const cell=i-lighting.loopCount;
    let x=minX+.35+(cell%columns+.5)*(spanX-.7)/columns;
    let z=minZ+.35+(Math.floor(cell/columns)+.5)*(spanZ-.7)/rows;
    x+=(random()-.5)*.07;z+=(random()-.5)*.07;
    let nearLoop,outside;
    do{
      const bounded=constrainPosition(x,z,.25);
      outside=Math.hypot(bounded.x-x,bounded.z-z)>.001;nearLoop=false;
      for(let k=0;k<lighting.loopCount;k++)if(Math.hypot(x-positions[k*3],z-positions[k*3+2])<.18){nearLoop=true;break;}
      if(nearLoop||outside){x=minX+.35+random()*(spanX-.7);z=minZ+.35+random()*(spanZ-.7);}
    }while(nearLoop||outside);
    positions.set([x,spec.wallHeight-.012,z],i*3);
    phase[i]=random()*Math.PI*2;size[i]=.55+random()*.65;luminosity[i]=.18+random()*.18;
  }
  const starsGeo=new THREE.BufferGeometry();
  starsGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));
  starsGeo.setAttribute('aPh',new THREE.BufferAttribute(phase,1));
  starsGeo.setAttribute('aSz',new THREE.BufferAttribute(size,1));
  starsGeo.setAttribute('aLum',new THREE.BufferAttribute(luminosity,1));
  const starMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{uT:{value:0},uB:{value:1},uPR:{value:renderer.getPixelRatio()}},
    vertexShader:`attribute float aPh;attribute float aSz;attribute float aLum;uniform float uT;uniform float uPR;varying float vA;
    void main(){vec4 mv=modelViewMatrix*vec4(position,1.);bool loopLight=aLum>1.;
      float shimmer=loopLight ? (.98+.02*sin(uT*.35+aPh)) : (.85+.15*sin(uT*.35+aPh));vA=aLum*shimmer;
      gl_PointSize=clamp(aSz*uPR*7./max(1.,-mv.z),loopLight ? 2.5*uPR : .65,7.*uPR);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`varying float vA;uniform float uB;void main(){float r=length(gl_PointCoord-.5)*2.;
      float halo=pow(max(0.,1.-r),2.);float core=1.-smoothstep(.12,.38,r);
      float a=clamp((core*.9+halo*.38)*vA*uB,0.,1.);gl_FragColor=vec4(vec3(.86,.95,1.)*(core+halo*.45),a);}`
  });
  const stars=new THREE.Points(starsGeo,starMaterial);stars.name='quiet-ceiling-lights';scene.add(stars);

  // 검은 천장과 따뜻한 벽 상단을 반사 환경에 반영한다.
  if(environment&&typeof document!=='undefined'){
    const directions=[(u,v)=>[1,-v,-u],(u,v)=>[-1,-v,u],(u,v)=>[u,1,v],(u,v)=>[u,-1,-v],(u,v)=>[u,-v,1],(u,v)=>[-u,-v,-1]];
    const faces=directions.map(direction=>{
      const c=document.createElement('canvas');c.width=c.height=64;
      const context=c.getContext('2d'),data=context.createImageData(64,64);
      for(let y=0;y<64;y++)for(let x=0;x<64;x++){
        const d=new THREE.Vector3(...direction((x+.5)/32-1,(y+.5)/32-1)).normalize();
        const band=Math.exp(-Math.pow((d.y-.23)/.13,2));
        const softbox=Math.pow(Math.max(0,d.dot(new THREE.Vector3(.2,.85,.48).normalize())),64);
        const i=(y*64+x)*4;
        data.data[i]=Math.min(255,12+band*126+softbox*150);
        data.data[i+1]=Math.min(255,10+band*91+softbox*151);
        data.data[i+2]=Math.min(255,9+band*62+softbox*154);data.data[i+3]=255;
      }
      context.putImageData(data,0,0);return c;
    });
    const cube=new THREE.CubeTexture(faces);cube.encoding=THREE.sRGBEncoding;cube.needsUpdate=true;
    const pmrem=new THREE.PMREMGenerator(renderer),target=pmrem.fromCubemap(cube);
    scene.environment=target.texture;cube.dispose();pmrem.dispose();
  }

  scene.add(new THREE.HemisphereLight(0xd4dce3,0x171009,.12));
  scene.add(new THREE.AmbientLight(0xffefe0,.08));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate=false;
  const pedestalMaterial=new THREE.MeshPhysicalMaterial({color:new THREE.Color(0x141516).convertSRGBToLinear(),roughness:.48,metalness:.04,clearcoat:.1,clearcoatRoughness:.65,envMapIntensity:.26});
  function beveledBox(width,height,depth){
    const b=.003,shape=new THREE.Shape(),w=width/2-b,d=depth/2-b,r=.009;
    shape.moveTo(-w+r,-d);shape.lineTo(w-r,-d);shape.quadraticCurveTo(w,-d,w,-d+r);
    shape.lineTo(w,d-r);shape.quadraticCurveTo(w,d,w-r,d);shape.lineTo(-w+r,d);
    shape.quadraticCurveTo(-w,d,-w,d-r);shape.lineTo(-w,-d+r);shape.quadraticCurveTo(-w,-d,-w+r,-d);
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:height-2*b,bevelEnabled:true,bevelSize:b,bevelThickness:b,bevelSegments:1,steps:1,curveSegments:3});
    geometry.rotateX(-Math.PI/2);geometry.translate(0,b,0);return geometry;
  }
  function addStatue(model,index){
    const s=spec.pedestals[index],group=new THREE.Group();group.position.set(s.x,p.height,s.z);
    const pedestal=new THREE.Mesh(beveledBox(s.width,s.height,s.depth),pedestalMaterial);
    pedestal.name='rectangular-pedestal-'+index;pedestal.castShadow=true;pedestal.receiveShadow=true;group.add(pedestal);
    model.position.y=s.height;
    model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;
      for(const material of (Array.isArray(o.material)?o.material:[o.material]))material.envMapIntensity=1.3;
    }});group.add(model);scene.add(group);
    const spot=new THREE.SpotLight(0xfff8f2,6.2,8,.29,.9,1.3);
    spot.position.set(s.x-.5,spec.wallHeight-.15,s.z+1.8);spot.target.position.set(s.x,1.63,s.z);
    spot.castShadow=true;spot.shadow.mapSize.set(1024,1024);spot.shadow.camera.near=.3;spot.shadow.camera.far=8;
    spot.shadow.bias=-.0001;spot.shadow.normalBias=.003;spot.shadow.radius=2;scene.add(spot,spot.target);
    const rim=new THREE.SpotLight(0xe7f0ff,1.6,6,.32,.95,1.5);
    rim.position.set(s.x+.5,spec.wallHeight-.45,s.z-1.7);rim.target.position.set(s.x,1.65,s.z);scene.add(rim,rim.target);
    const fill=new THREE.SpotLight(0xe8f1ff,.65,4,.38,.95,1.5);
    fill.position.set(s.x+.65,2.4,s.z+1.5);fill.target.position.set(s.x,1.7,s.z);scene.add(fill,fill.target);
    const focusY=p.height+s.height+s.statueHeight*.65;
    const item={grp:group,x:s.x,z:s.z,focusY};statues.push(item);
    renderer.shadowMap.needsUpdate=true;return item;
  }
  function groundHeight(x,z){return (x*x/(p.radiusX*p.radiusX)+(z-p.centerZ)*(z-p.centerZ)/(p.radiusZ*p.radiusZ))<1?p.height:0;}
  return {spec,statues,starMaterial,addStatue,groundHeight,constrainPosition,ready:Promise.all(pending)};
}
if(typeof module!=='undefined')module.exports={SAYU_ROOM_SPEC,createSayuEnvironment};
