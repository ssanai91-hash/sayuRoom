/* Bundled NMK GLBs only: uncompressed, embedded JPEGs, packed accessors. */
async function readWithProgress(response,onProgress){
  const total=+response.headers.get('content-length')||0;
  if(!response.body||!response.body.getReader){const b=await response.arrayBuffer();onProgress&&onProgress(b.byteLength,b.byteLength);return b;}
  const reader=response.body.getReader(),chunks=[];let got=0;
  for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);got+=value.length;onProgress&&onProgress(got,total);}
  const out=new Uint8Array(got);let o=0;for(const c of chunks){out.set(c,o);o+=c.length;}
  return out.buffer;
}
async function loadSayuStatue(url,onProgress){
  const response=await fetch(url);
  if(!response.ok)throw new Error('모델 응답 '+response.status);
  const bytes=await readWithProgress(response,onProgress), view=new DataView(bytes);
  if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2)throw new Error('GLB 형식 오류');
  const jsonSize=view.getUint32(12,true);
  const data=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,jsonSize)));
  const binStart=20+jsonSize+8;
  if(data.extensionsRequired?.length)throw new Error('지원하지 않는 압축 모델');
  function accessor(index){
    const a=data.accessors[index],b=data.bufferViews[a.bufferView];
    const types={5126:Float32Array,5125:Uint32Array,5123:Uint16Array,5121:Uint8Array};
    const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
    if(b.byteStride||a.sparse||!types[a.componentType]||!sizes[a.type])throw new Error('모델 배열 형식 오류');
    return new THREE.BufferAttribute(new types[a.componentType](bytes,binStart+(b.byteOffset||0)+(a.byteOffset||0),a.count*sizes[a.type]),sizes[a.type],!!a.normalized);
  }
  const textures=await Promise.all(data.textures.map(async t=>{
    const image=data.images[t.source],b=data.bufferViews[image.bufferView];
    const blob=new Blob([new Uint8Array(bytes,binStart+(b.byteOffset||0),b.byteLength)],{type:image.mimeType});
    const src=URL.createObjectURL(blob);
    try{
      const texture=await new Promise((resolve,reject)=>new THREE.TextureLoader().load(src,resolve,undefined,reject));
      texture.flipY=false;return texture;
    }finally{URL.revokeObjectURL(src);}
  }));
  const materials=data.materials.map(m=>{
    const p=m.pbrMetallicRoughness||{};
    const map=p.baseColorTexture?textures[p.baseColorTexture.index]:null;
    if(map)map.encoding=THREE.sRGBEncoding;
    const normal=m.normalTexture,orm=p.metallicRoughnessTexture,occlusion=m.occlusionTexture;
    const mrMap=orm?textures[orm.index]:null,aoMap=occlusion?textures[occlusion.index]:null;
    // glTF ORM: R=AO, G=roughness, B=metalness. Data maps stay linear.
    for(const dataMap of [mrMap,aoMap])if(dataMap)dataMap.encoding=THREE.LinearEncoding;
    const mat=new THREE.MeshStandardMaterial({map,normalMap:normal?textures[normal.index]:null,
      metalnessMap:mrMap,roughnessMap:mrMap,aoMap,aoMapIntensity:occlusion?.strength??.8,
      metalness:p.metallicFactor??1,roughness:p.roughnessFactor??1,side:m.doubleSided?THREE.DoubleSide:THREE.FrontSide});
    mat.userData.sayuPhysicalMaps=!!mrMap;
    if(normal)mat.normalScale.setScalar(normal.scale??1);
    return mat;
  });
  const group=new THREE.Group();
  for(const node of data.nodes){
    if(node.mesh===undefined)continue;
    const part=new THREE.Group();
    if(node.matrix){part.matrix.fromArray(node.matrix);part.matrix.decompose(part.position,part.quaternion,part.scale);}
    else{if(node.translation)part.position.fromArray(node.translation);if(node.rotation)part.quaternion.fromArray(node.rotation);if(node.scale)part.scale.fromArray(node.scale);}
    for(const primitive of data.meshes[node.mesh].primitives){
      if(primitive.mode!==undefined&&primitive.mode!==4)throw new Error('삼각형 모델만 지원');
      const geometry=new THREE.BufferGeometry();
      for(const [name,index] of Object.entries(primitive.attributes)){
        const attr={POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv'}[name];
        if(attr)geometry.setAttribute(attr,accessor(index));
      }
      // r128 samples AO from uv2. Clone only the attribute, never modify source uv.
      if(geometry.attributes.uv&&materials[primitive.material].aoMap)geometry.setAttribute('uv2',geometry.attributes.uv.clone());
      if(primitive.indices!==undefined)geometry.setIndex(accessor(primitive.indices));
      const mesh=new THREE.Mesh(geometry,materials[primitive.material]);part.add(mesh);
    }
    group.add(part);
  }
  return group;
}
