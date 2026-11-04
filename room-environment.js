/* 사진을 기준으로 맞춘 전시실. 불상은 실물 규격, 전시대 치수는 사진 비례 추정값(m). */
const SAYU_ROOM_SPEC=Object.freeze({
  radius:9,wallHeight:3.2,
  platform:Object.freeze({radiusX:3.3,radiusZ:2.7,centerZ:-.6,height:.12}),
  ceilingLights:Object.freeze({width:5,depth:2.7,centerZ:-.85,loopCount:96,backgroundCount:160}),
  pedestals:Object.freeze([
    Object.freeze({x:-1.3,z:-.85,width:.64,depth:.64,height:1.02,statueHeight:.815}),
    Object.freeze({x:1.3,z:-.85,width:.68,depth:.68,height:1.02,statueHeight:.908})
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
  const floorGeo=new THREE.CircleGeometry(spec.radius,128);
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
    uniforms:{uGlow:{value:1}},
    vertexShader:`varying vec2 vUv;varying vec3 vP;void main(){vUv=uv;vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 vUv;varying vec3 vP;uniform float uGlow;
    float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
    void main(){
      float y=vUv.y;float a=atan(vP.z,vP.x);
      float plaster=.6*n(vec2(a*95.,vP.y*31.))+.4*n(vec2(a*380.,vP.y*125.));
      vec3 low=vec3(.004,.0023,.0017),mid=vec3(.075,.030,.015),top=vec3(.66,.38,.23);
      vec3 c=mix(low,mid,smoothstep(.05,.86,y));
      c=mix(c,top,exp((y-1.)*8.)*uGlow);
      c*=.965+.07*plaster;gl_FragColor=vec4(c,1.);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }`
  });
  const wall=new THREE.Mesh(new THREE.CylinderGeometry(spec.radius+.07,spec.radius,spec.wallHeight,160,1,true),wallMat);
  wall.name='warm-plaster-cove-wall';wall.position.y=spec.wallHeight/2;scene.add(wall);
  const ceiling=new THREE.Mesh(new THREE.CircleGeometry(spec.radius+.15,128),new THREE.MeshBasicMaterial({color:0x010101}));
  ceiling.name='black-ceiling';ceiling.rotation.x=Math.PI/2;ceiling.position.y=spec.wallHeight+.02;scene.add(ceiling);

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
  for(let i=lighting.loopCount;i<count;i++){
    let x,z,nearLoop;
    do{
      const radius=Math.sqrt(random())*(spec.radius-.35),angle=random()*Math.PI*2;
      x=Math.cos(angle)*radius;z=Math.sin(angle)*radius;nearLoop=false;
      for(let k=0;k<lighting.loopCount;k++)if(Math.hypot(x-positions[k*3],z-positions[k*3+2])<.18){nearLoop=true;break;}
    }while(nearLoop);
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
    const spot=new THREE.SpotLight(0xfff8f2,5.2,8,.29,.9,1.3);
    spot.position.set(s.x-.5,spec.wallHeight-.15,s.z+1.8);spot.target.position.set(s.x,1.63,s.z);
    spot.castShadow=true;spot.shadow.mapSize.set(1024,1024);spot.shadow.camera.near=.3;spot.shadow.camera.far=8;
    spot.shadow.bias=-.0001;spot.shadow.normalBias=.003;spot.shadow.radius=2;scene.add(spot,spot.target);
    const rim=new THREE.SpotLight(0xe7f0ff,1.25,6,.32,.95,1.5);
    rim.position.set(s.x+.5,spec.wallHeight-.45,s.z-1.7);rim.target.position.set(s.x,1.65,s.z);scene.add(rim,rim.target);
    const fill=new THREE.SpotLight(0xe8f1ff,.65,4,.38,.95,1.5);
    fill.position.set(s.x+.65,2.4,s.z+1.5);fill.target.position.set(s.x,1.7,s.z);scene.add(fill,fill.target);
    const focusY=p.height+s.height+s.statueHeight*.65;
    const item={grp:group,x:s.x,z:s.z,focusY};statues.push(item);
    renderer.shadowMap.needsUpdate=true;return item;
  }
  function groundHeight(x,z){return (x*x/(p.radiusX*p.radiusX)+(z-p.centerZ)*(z-p.centerZ)/(p.radiusZ*p.radiusZ))<1?p.height:0;}
  return {spec,statues,starMaterial,addStatue,groundHeight,ready:Promise.all(pending)};
}
if(typeof module!=='undefined')module.exports={SAYU_ROOM_SPEC,createSayuEnvironment};
