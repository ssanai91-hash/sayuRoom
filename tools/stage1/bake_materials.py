"""Bake NMK scan-derived 1024px ORM into existing GLBs; preserve original buffers.

Offline dependencies: numpy, scipy, pillow, trimesh, numba, embreex.
Usage: python tools/stage1/bake_materials.py --source-root /path/to/statue-work
The original museum archives are NOT shipped with the application.
"""
import argparse, hashlib, io, json, math, struct, time
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
from scipy.ndimage import distance_transform_edt, gaussian_filter
import trimesh
from numba import njit
from embreex.rtcore_scene import EmbreeScene
from embreex.mesh_construction import TriangleMesh

SIZE = 1024
RAYS = 128
RADIUS = .18
ROOT = Path(__file__).resolve().parents[2]

def read_glb(path):
    raw = path.read_bytes()
    size = struct.unpack_from('<I', raw, 12)[0]
    data = json.loads(raw[20:20+size])
    start = 28+size
    length = struct.unpack_from('<I', raw, 20+size)[0]
    binary = raw[start:start+length]
    return raw, data, binary

def array(data, binary, index):
    a = data['accessors'][index]; v = data['bufferViews'][a['bufferView']]
    types = {5126:'<f4',5125:'<u4',5123:'<u2'}
    widths = {'VEC3':3,'VEC2':2,'SCALAR':1}
    return np.frombuffer(binary, types[a['componentType']], a['count']*widths[a['type']],
                         v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,widths[a['type']])

@njit(cache=True)
def rasterize(vertices, normals, uv, faces):
    positions = np.zeros((SIZE,SIZE,3),np.float32)
    smooth = np.zeros_like(positions)
    mask = np.zeros((SIZE,SIZE),np.bool_)
    for f in faces:
        a,b,c = uv[f[0]]*SIZE-.5,uv[f[1]]*SIZE-.5,uv[f[2]]*SIZE-.5
        den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(den)<1e-10: continue
        x0=max(0,int(math.ceil(min(a[0],b[0],c[0])))); x1=min(SIZE-1,int(math.floor(max(a[0],b[0],c[0]))))
        y0=max(0,int(math.ceil(min(a[1],b[1],c[1])))); y1=min(SIZE-1,int(math.floor(max(a[1],b[1],c[1]))))
        for y in range(y0,y1+1):
            for x in range(x0,x1+1):
                w0=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den
                w1=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den
                w2=1-w0-w1
                if min(w0,w1,w2)<-1e-5: continue
                for j in range(3):
                    positions[y,x,j]=w0*vertices[f[0],j]+w1*vertices[f[1],j]+w2*vertices[f[2],j]
                    smooth[y,x,j]=w0*normals[f[0],j]+w1*normals[f[1],j]+w2*normals[f[2],j]
                mask[y,x]=True
    return positions,smooth,mask

def smoothstep(a,b,x):
    t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)

def classify(rgb):
    # Work in source sRGB chromaticity, NOT brightness alone. White/blue scan
    # highlights have low saturation or insufficient red/green separation.
    r,g,b=rgb.transpose(2,0,1)
    mx=rgb.max(2); mn=rgb.min(2); sat=(mx-mn)/np.maximum(mx,1e-6)
    gold=smoothstep(.10,.28,sat)*smoothstep(.015,.065,r-g)*smoothstep(.035,.14,g-b)
    gold*=smoothstep(.13,.38,(r+g)*.5)*(1-smoothstep(.90,.995,mx))
    # Low saturation, blue-white highlights stay bronze instead of becoming gold.
    patina=smoothstep(.012,.065,np.maximum(g-r,b-r))*smoothstep(.035,.13,sat)
    patina*=smoothstep(.035,.13,mx)
    gray=(1-smoothstep(.10,.28,sat))*smoothstep(.16,.36,mx)*(1-smoothstep(.65,.85,mx))
    patina=np.maximum(patina,gray*.85)
    gold=gaussian_filter(gold,.65);patina=gaussian_filter(patina,.65)*(1-gold)
    bronze=np.clip(1-gold-patina,0,1)
    metallic=.90*gold+.23*patina+.60*bronze
    roughness=.33*gold+.83*patina+.55*bronze
    return metallic,roughness,gold,patina

def radical_inverse(i):
    value=0.;factor=.5
    while i: value+=factor*(i&1);i>>=1;factor*=.5
    return value

def bake_ao(high,positions,normals,mask):
    scene=EmbreeScene();TriangleMesh(scene,np.asarray(high.vertices,dtype='f'),np.asarray(high.faces,dtype='i'))
    pv=positions[mask];nv=normals[mask];nv/=np.maximum(np.linalg.norm(nv,axis=1,keepdims=True),1e-9)
    out=np.ones(len(pv),np.float32);projected=0
    hvn=np.asarray(high.vertex_normals,dtype='f');faces=np.asarray(high.faces)
    for start in range(0,len(pv),24000):
        stop=min(start+24000,len(pv));p=pv[start:stop].copy();n=nv[start:stop].copy()
        # Project the CURRENT 120k-mesh UV texel onto the ORIGINAL high mesh.
        # A two-sided 12mm cage avoids falsely darkening texels below a decimated surface.
        best=np.full(len(p),np.inf);surface=p.copy();surface_n=n.copy()
        for sign in [1.,-1.]:
            origin=p+n*(.012*sign);direction=-n*sign
            hit=scene.run(origin.astype('f'),direction.astype('f'),output=1)
            valid=(hit['primID']>=0)&(hit['tfar']<.024)
            delta=np.abs(hit['tfar']-.012);valid&=delta<best
            if valid.any():
                best[valid]=delta[valid];surface[valid]=origin[valid]+direction[valid]*hit['tfar'][valid,None]
                f=faces[hit['primID'][valid]];u=hit['u'][valid,None];v=hit['v'][valid,None]
                sn=hvn[f[:,0]]*(1-u-v)+hvn[f[:,1]]*u+hvn[f[:,2]]*v
                sn/=np.maximum(np.linalg.norm(sn,axis=1,keepdims=True),1e-9)
                sn[np.sum(sn*n[valid],axis=1)<0]*=-1
                surface_n[valid]=sn
        projected+=int(np.isfinite(best).sum());n=surface_n
        axis=np.zeros_like(n);axis[:,1]=1;axis[np.abs(n[:,1])>.95]=[1,0,0]
        tangent=np.cross(axis,n);tangent/=np.maximum(np.linalg.norm(tangent,axis=1,keepdims=True),1e-9)
        bitangent=np.cross(n,tangent);origin=(surface+n*.00045).astype('f')
        occlusion=np.zeros(len(p),np.float32)
        for j in range(RAYS):
            u=(j+.5)/RAYS;phi=2*np.pi*radical_inverse(j)
            direction=tangent*(math.sqrt(u)*math.cos(phi))+bitangent*(math.sqrt(u)*math.sin(phi))+n*math.sqrt(1-u)
            hit=scene.run(origin,direction.astype('f'),output=1)
            # Finite-radius distance falloff: local creases darken, distant parts don't turn black.
            distance=hit['tfar'];occlusion+=np.sqrt(np.clip(1-distance/RADIUS,0,1))
        out[start:stop]=np.clip(1-occlusion/RAYS,.06,1)
        print(f'  AO {stop}/{len(pv)} texels',flush=True)
    ao=np.ones((SIZE,SIZE),np.float32);ao[mask]=out
    # Pad atlas islands before filtering/mipmaps; never blur against white empty UV space.
    nearest=distance_transform_edt(~mask,return_distances=False,return_indices=True)
    padded=ao[tuple(nearest)];padded=gaussian_filter(padded,.65)
    return padded,dict(texels=int(mask.sum()),projected=projected,projectionFraction=projected/len(pv),
                       aoMin=float(out.min()),aoMean=float(out.mean()),aoP10=float(np.quantile(out,.1)))

def embed(data,binary,image):
    # Six effective bits/channel: <=2/255 quantization error, smooth filtered boundaries,
    # lossless PNG container, no JPEG channel bleed across the packed material fields.
    values=np.asarray(image,dtype=np.float32)
    image=Image.fromarray(np.uint8(np.round(values*63/255)*255/63))
    payload=io.BytesIO();image.save(payload,'PNG',optimize=True)
    raw=payload.getvalue();offset=len(binary);pad=(-offset)%4;binary+=b'\0'*pad;offset+=pad
    data['bufferViews'].append(dict(buffer=0,byteOffset=offset,byteLength=len(raw)))
    data['images'].append(dict(bufferView=len(data['bufferViews'])-1,mimeType='image/png',name='NMK scan-derived AO roughness metalness 1024'))
    data['textures'].append(dict(sampler=0,source=len(data['images'])-1));index=len(data['textures'])-1
    for m in data['materials']:
        p=m['pbrMetallicRoughness'];p.update(metallicRoughnessTexture=dict(index=index),metallicFactor=1,roughnessFactor=1)
        m['occlusionTexture']=dict(index=index,strength=.8)
    data['asset'].setdefault('extras',{})['stage1']=dict(method='B, offline 1024px packed ORM',ao='original NMK high-resolution OBJ projected to existing 120k UV, 128 cosine hemisphere rays, 0.18m range',color='original source color preserved; chromaticity-gated smooth gold/patina classification; highlights rejected')
    binary+=raw;data['buffers'][0]['byteLength']=len(binary)
    js=json.dumps(data,ensure_ascii=False,separators=(',',':')).encode();js+=b' '*((-len(js))%4);binary+=b'\0'*((-len(binary))%4)
    glb=struct.pack('<4sII',b'glTF',2,28+len(js)+len(binary))+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(binary),b'BIN\0')+binary
    return glb,len(raw)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--source-root',type=Path,required=True);args=parser.parse_args()
    output=ROOT/'verification/stage1';output.mkdir(parents=True,exist_ok=True);records=[]
    for side,number,stem,height in [('left','78','bon002789',.815),('right','83','duk003312',.908)]:
        started=time.perf_counter();path=ROOT/f'models/bangasayu-{side}.glb';raw,data,binary=read_glb(path)
        if 'stage1' in data['asset'].get('extras',{}):raise RuntimeError('Use the original baseline GLB, not an already baked model')
        original_binary=binary
        prim=data['meshes'][0]['primitives'][0];attributes=prim['attributes']
        v=array(data,binary,attributes['POSITION']);n=array(data,binary,attributes['NORMAL']);uv=array(data,binary,attributes['TEXCOORD_0']);f=array(data,binary,prim['indices']).reshape(-1,3)
        source=args.source_root/f'original-{number}'/'디지털콘텐츠_OBJ'/f'{stem}-000-30000.obj'
        high=trimesh.load(source,process=False,force='mesh');high.apply_transform(trimesh.transformations.rotation_matrix(-np.pi/2,[1,0,0]))
        high.apply_scale(height/high.extents[1]);bounds=high.bounds;high.apply_translation([-bounds[:,0].mean(),-bounds[0,1],-bounds[:,2].mean()])
        print(side,len(high.faces),'original triangles',flush=True)
        pos,normal,mask=rasterize(v,n,uv,f);ao,stats=bake_ao(high,pos,normal,mask)
        color=data['images'][0];view=data['bufferViews'][color['bufferView']]
        image=Image.open(io.BytesIO(binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])).convert('RGB').resize((SIZE,SIZE),Image.Resampling.LANCZOS)
        rgb=np.asarray(image,dtype=np.float32)/255;metal,rough,gold,patina=classify(rgb)
        orm=np.uint8(np.clip(np.stack([ao,rough,metal],axis=-1)*255,0,255))
        result,added=embed(data,binary,Image.fromarray(orm));path.write_bytes(result)
        # Proof: unchanged original geometry, original base color, and original normal bytes.
        assert read_glb(path)[2][:len(original_binary)]==original_binary
        for name,channel in [('ao',ao),('roughness',rough),('metalness',metal),('gold-mask',gold),('patina-mask',patina)]:
            Image.fromarray(np.uint8(np.clip(channel*255,0,255))).save(output/f'{side}-{name}.png')
        image.save(output/f'{side}-source-color.jpg',quality=92)
        white=(rgb.max(2)>.7)&((rgb.max(2)-rgb.min(2))<.08)&mask
        stats.update(side=side,originalTriangles=len(high.faces),targetTriangles=len(f),originalBytes=len(raw),newBytes=len(result),downloadIncrease=len(result)-len(raw),ormPngBytes=added,
                     goldCoverage=float(gold[mask].mean()),patinaCoverage=float(patina[mask].mean()),
                     whiteHighlightPixels=int(white.sum()),whiteHighlightGoldMax=float(gold[white].max()) if white.any() else 0,
                     seconds=time.perf_counter()-started,sourceObjSha256=hashlib.sha256(source.read_bytes()).hexdigest(),glbSha256=hashlib.sha256(result).hexdigest())
        records.append(stats);print(json.dumps(stats),flush=True)
    (output/'bake-metrics.json').write_text(json.dumps(dict(size=SIZE,rays=RAYS,radiusMeters=RADIUS,models=records),ensure_ascii=False,indent=2)+'\n')
    assert sum(r['downloadIncrease'] for r in records)<=1500000

if __name__=='__main__':main()
