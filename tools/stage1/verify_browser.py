"""Real Three.js r128 browser comparison; never substitutes an offline PBR renderer.

Place the b54d465 baseline checkout in ../before. Requests are fulfilled locally
by Playwright routing; no HTTP server or production connection is required.
python tools/stage1/verify_browser.py --three /path/to/three-r128.js
Requires Playwright Chromium. Software GPU results are NOT Android performance results.
"""
import argparse, json, statistics, mimetypes
from urllib.parse import urlparse
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'verification/stage1'
CAMERAS=[
    ('right-front-2.1m',[1.3,1.72,-7.65],[1.3,1.75,-9.75]),
    ('left-three-quarter',[-3.0,1.72,-7.90],[-1.3,1.72,-9.75]),
    ('left-rear',[-1.3,1.72,-11.85],[-1.3,1.75,-9.75]),
]

def harness(folder):
    html=(folder/'index.html').read_text()
    # Exercise the exact renderer/environment initialization from index.html.
    code=html[html.index('(function(){')+len('(function(){'):html.index('const enter=document.querySelector')]
    code=code.replace('{canvas,antialias:true}','{canvas,antialias:true,preserveDrawingBuffer:true}')
    return '''<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#080402}canvas{display:block;width:100vw;height:100vh}</style><canvas id="c"></canvas>
    <script src="/three-r128.js"></script><script src="statue-models.js"></script><script src="room-environment.js"></script><script>
    (async()=>{const started=performance.now();
    '''+code+'''
    const loaded=await Promise.all([loadSayuStatue('models/bangasayu-left.glb'),loadSayuStatue('models/bangasayu-right.glb'),room.ready]);
    room.addStatue(loaded[0],0);room.addStatue(loaded[1],1);
    const w=innerWidth,h=innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,2.5,Math.sqrt(4500000/(w*h))));renderer.setSize(w,h,false);
    camera.aspect=w/h;camera.fov=50;camera.updateProjectionMatrix();
    if(starMat.uniforms.uScale)starMat.uniforms.uScale.value=h*renderer.getPixelRatio()/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
    starMat.uniforms.uPR.value=renderer.getPixelRatio();
    camera.position.set(1.3,1.72,-7.65);camera.lookAt(1.3,1.75,-9.75);
    renderer.render(scene,camera);renderer.getContext().finish();
    const readyMs=performance.now()-started;
    window.qa={renderer,scene,room,camera,readyMs,pose(p,t){camera.position.fromArray(p);camera.lookAt(...t);renderer.render(scene,camera);renderer.getContext().finish();},
      async benchmark(frames=45){const starts=[];let last=performance.now();for(let i=0;i<frames;i++){
        await new Promise(requestAnimationFrame);renderer.render(scene,camera);const now=performance.now();starts.push(now-last);last=now;}
        return {frames,meanFrameMs:starts.reduce((a,b)=>a+b,0)/frames,fps:1000/(starts.reduce((a,b)=>a+b,0)/frames)};},
      materials(){const rows=[];for(const item of room.statues)item.grp.traverse(o=>{if(o.isMesh&&o.material.map){const m=o.material;rows.push({ao:!!m.aoMap,mr:!!m.metalnessMap,uv2:!!o.geometry.attributes.uv2,aoIntensity:m.aoMapIntensity,metalness:m.metalness,roughness:m.roughness,env:m.envMapIntensity,ormSize:m.aoMap?[m.aoMap.image.width,m.aoMap.image.height]:null,mapEncoding:m.map.encoding,dataEncoding:m.aoMap?.encoding});}});return rows;}}
    })().catch(e=>{window.qaError=e.stack;console.error(e)});
    </script>'''

def serve(context,folder,three):
    def handler(route):
        name=Path(urlparse(route.request.url).path).name
        if name=='__stage1check__.html':return route.fulfill(body=harness(folder),content_type='text/html')
        if name=='three-r128.js':return route.fulfill(path=str(three),content_type='text/javascript')
        relative=urlparse(route.request.url).path.split('/',2)[-1]
        path=folder/relative
        if path.is_file():return route.fulfill(path=str(path),content_type=mimetypes.guess_type(str(path))[0] or 'application/octet-stream')
        return route.fulfill(status=404,body='not found')
    context.route('**/*',handler)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--three',type=Path,required=True);ap.add_argument('--reuse-before',action='store_true');args=ap.parse_args();OUT.mkdir(parents=True,exist_ok=True)
    results={};errors=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'])
        for variant,folder in [('before',ROOT.parent/'before'),('after',ROOT)]:
            if variant=='before' and args.reuse_before:
                results['before']=json.loads((OUT/'browser-metrics.json').read_text())['before'];continue
            context=browser.new_context(viewport=dict(width=900,height=1200),device_scale_factor=1)
            serve(context,folder,args.three)
            page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
            page.on('console',lambda msg:errors.append(msg.text) if msg.type=='error' and 'favicon' not in msg.text else None)
            url='http://127.0.0.1:8787/'+('before' if variant=='before' else 'sayuRoom')+'/__stage1check__.html'
            page.goto(url);page.wait_for_function('window.qa||window.qaError',timeout=120000)
            assert page.evaluate('window.qaError||null') is None,page.evaluate('window.qaError')
            result=page.evaluate('({readyMs:qa.readyMs,materials:qa.materials(),shadowLights:qa.scene.children.filter(o=>o.isLight&&o.castShadow).length,staticShadows:!qa.renderer.shadowMap.autoUpdate,drawCalls:qa.renderer.info.render.calls,triangles:qa.renderer.info.render.triangles,renderer:qa.renderer.getContext().getParameter(qa.renderer.getContext().getExtension("WEBGL_debug_renderer_info").UNMASKED_RENDERER_WEBGL)})')
            for name,position,target in CAMERAS:
                page.evaluate('args=>qa.pose(...args)',[position,target]);page.screenshot(path=str(OUT/f'{name}-{variant}.png'))
            results[variant]=result
            # Three fresh harness loads, same local transport, no cached GLB across contexts.
            timings=[result['readyMs']]
            for _ in range(2):
                page.reload();page.wait_for_function('window.qa||window.qaError',timeout=120000)
                assert page.evaluate('window.qaError||null') is None
                timings.append(page.evaluate('qa.readyMs'))
            results[variant]['localReadyRunsMs']=timings;results[variant]['localReadyMedianMs']=statistics.median(timings)
            # Mobile-sized desktop SOFTWARE rendering is a smoke check only, not a handset claim.
            mobile=browser.new_context(viewport=dict(width=390,height=844),device_scale_factor=2.5,is_mobile=True,has_touch=True)
            serve(mobile,folder,args.three)
            mp=mobile.new_page();mp.goto(url);mp.wait_for_function('window.qa||window.qaError',timeout=120000)
            results[variant]['softwareMobileViewport']=mp.evaluate('qa.benchmark(30)')
            mobile.close();context.close();print(variant,json.dumps(results[variant]),flush=True)
        browser.close()
    for m in results['after']['materials']:
        assert m['ao'] and m['mr'] and m['uv2']
        assert m['ormSize']==[1024,1024] and m['aoIntensity']==.8
        assert m['metalness']==1 and m['roughness']==1 and 1.6<=m['env']<=2
        assert m['mapEncoding']!=m['dataEncoding']
    assert results['after']['shadowLights']==2 and results['after']['staticShadows']
    results['localReadyIncreaseMs']=results['after']['localReadyMedianMs']-results['before']['localReadyMedianMs']
    results['errors']=errors;results['androidDeviceMeasured']=False
    results['baselineCommit']='b54d465dd7084c47c7be30b9d6f8f719bcddc795'
    results['measurementScope']='Local routed assets, SwiftShader software WebGL; not Android or production network. Reused baseline timings may come from an earlier run.'
    (OUT/'browser-metrics.json').write_text(json.dumps(results,indent=2)+'\n')
    assert not errors,errors
    # Reviewable before/after contact sheet, generated only from actual browser captures.
    sheet=Image.new('RGB',(1200,3*830),(16,12,9));draw=ImageDraw.Draw(sheet)
    for row,(name,_,_) in enumerate(CAMERAS):
        for col,variant in enumerate(['before','after']):
            im=Image.open(OUT/f'{name}-{variant}.png').convert('RGB').resize((600,800))
            sheet.paste(im,(col*600,row*830+30));draw.text((col*600+12,row*830+8),f'{name} / {variant}',fill='white')
    sheet.save(OUT/'comparison.jpg',quality=93)
    print('PASS: actual Three r128 WebGL captures, maps, UV2, static shadow count, console. Android hardware unmeasured.',flush=True)

if __name__=='__main__':main()
