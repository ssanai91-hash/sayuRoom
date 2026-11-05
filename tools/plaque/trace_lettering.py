"""User-photo letter outlines -> native Three.js shapes; no replacement font or raster asset.
Usage: python tools/plaque/trace_lettering.py <1000051847.jpg>
Offline dependencies match the existing bake tools: Pillow, NumPy, SciPy.
The source photo is not copied into the served assets.
"""
import hashlib,json,sys
from collections import defaultdict
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import grey_opening,binary_closing,label

ROOT=Path(__file__).resolve().parents[2]

def area(points):
    return sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(points,points[1:]+points[:1]))*.5

def inside(point,ring):
    x,y=point;result=False
    for a,b in zip(ring,ring[1:]+ring[:1]):
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:result=not result
    return result

def rdp(points,epsilon=.55):
    if len(points)<3:return points
    a=np.array(points[0]);b=np.array(points[-1]);v=b-a
    q=np.array(points[1:-1])-a
    d=np.abs(q[:,0]*v[1]-q[:,1]*v[0])/max(np.linalg.norm(v),1e-9)
    i=int(np.argmax(d))+1
    if d[i-1]<=epsilon:return [points[0],points[-1]]
    return rdp(points[:i+1],epsilon)[:-1]+rdp(points[i:],epsilon)

def simplify(ring):
    split=max(range(len(ring)),key=lambda i:(ring[i][0]-ring[0][0])**2+(ring[i][1]-ring[0][1])**2)
    return rdp(ring[:split+1])[:-1]+rdp(ring[split:]+[ring[0]])[:-1]

def boundaries(mask,x0,y0):
    edges=defaultdict(list)
    def add(a,b):edges[a].append(b)
    for y,x in np.argwhere(mask):
        y=int(y);x=int(x)
        if y==0 or not mask[y-1,x]:add((x,y),(x+1,y))
        if x+1==mask.shape[1] or not mask[y,x+1]:add((x+1,y),(x+1,y+1))
        if y+1==mask.shape[0] or not mask[y+1,x]:add((x+1,y+1),(x,y+1))
        if x==0 or not mask[y,x-1]:add((x,y+1),(x,y))
    rings=[]
    while edges:
        start=next(iter(edges));point=start;previous=(point[0]-1,point[1]);ring=[]
        while True:
            ring.append(point);choices=edges[point]
            dx,dy=point[0]-previous[0],point[1]-previous[1]
            def turn(b):
                vx,vy=b[0]-point[0],b[1]-point[1]
                return (dx*vy-dy*vx,dx*vx+dy*vy)
            following=max(choices,key=turn);choices.remove(following)
            if not choices:del edges[point]
            previous,point=point,following
            if point==start:break
        if len(ring)>=4 and abs(area(ring))>=3:
            rings.append([(x+x0,y+y0) for x,y in simplify(ring)])
    return rings

def main():
    source=Path(sys.argv[1]);rgb=np.asarray(Image.open(source).convert('RGB')).astype(float)
    regions=[('두루 헤아리며,',(575,245,1145,344)),('깊은 생각에 잠기는 시간',(375,360,1375,475)),
             ('Time to lose yourself',(495,668,1248,736)),('deep in wandering thought',(405,800,1355,889))]
    rings=[]
    for text,(x0,y0,x1,y1) in regions:
        r,g,b=rgb[y0:y1,x0:x1].transpose(2,0,1)
        # Separate warm raised faces from the neutral steel and photographic shadows.
        background=grey_opening(r,size=(19,19))
        mask=(r-background>18)&(r-b>20)&(g-b>8)
        if text.startswith('두루'):
            yy,xx=np.mgrid[y0:y1,x0:x1]
            mask&=(yy>281-.055*(xx-591)-9)&(yy<338-.033*(xx-591)+7)
        mask=binary_closing(mask,structure=np.ones((3,3)))
        labels,_=label(mask);sizes=np.bincount(labels.ravel());sizes[0]=0
        mask=sizes[labels]>=16
        rings.extend(boundaries(mask,x0,y0))
    # The thin metal separator is regular; its original image coordinates are retained.
    rings.append([(800,568),(905,568),(905,573),(800,573)])
    outers=[ring for ring in rings if area(ring)>0]
    holes=[ring for ring in rings if area(ring)<0]
    shapes=[{'outer':ring,'holes':[]} for ring in outers]
    for hole in holes:
        parents=[shape for shape in shapes if inside(hole[0],shape['outer'])]
        if parents:min(parents,key=lambda shape:abs(area(shape['outer'])))['holes'].append(hole)
    # Coordinates are local metres on the panel. Keep the photographed spacing and glyphs.
    def mapped(ring):return [[round((x-872)*.0018,5),round((565-y)*.0018,5)] for x,y in ring]
    for shape in shapes:
        shape['outer']=mapped(shape['outer']);shape['holes']=[mapped(hole) for hole in shape['holes']]
    output={'version':1,'source':'User attachment 1000051847.jpg','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
            'text':['두루 헤아리며,','깊은 생각에 잠기는 시간','—','Time to lose yourself','deep in wandering thought'],
            'method':'Warm-face silhouette trace from supplied photo; original font file unknown; no substitute font',
            'shapes':shapes}
    path=ROOT/'assets/wall-plaque-lettering.json'
    path.write_text(json.dumps(output,ensure_ascii=False,separators=(',',':'))+'\n')
    print('Created native lettering shapes:',len(shapes),'asset bytes:',path.stat().st_size)

if __name__=='__main__':main()
