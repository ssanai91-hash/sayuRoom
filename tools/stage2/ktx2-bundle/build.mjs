import * as esbuild from 'esbuild';
await esbuild.build({entryPoints:['kb/entry.js'],bundle:true,format:'iife',minify:true,outfile:'kb/out/ktx2-loader.r128.js',
  plugins:[{name:'three-global',setup(b){b.onResolve({filter:/^three$/},()=>({path:new URL('./three-shim.js',import.meta.url).pathname}));}}],
  banner:{js:'/* THREE.KTX2Loader (three.js r128 examples/jsm, MIT) — 전역 THREE용 IIFE 번들. tools/stage2/README 참고 */'}});
