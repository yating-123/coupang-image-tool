const $=id=>document.getElementById(id);
const fileInput=$('fileInput'),dropzone=$('dropzone'),processBtn=$('processBtn'),clearBtn=$('clearBtn');
const resultsSection=$('resultsSection'),resultList=$('resultList'),downloadAllBtn=$('downloadAllBtn'),summary=$('summary'),statusEl=$('status'),fileSummary=$('fileSummary');
let files=[],results=[];

const controls=[
 ['bgTolerance','bgToleranceOut',v=>v],['edgeBarrier','edgeBarrierOut',v=>v],['edgeProtect','edgeProtectOut',v=>v+' px'],['feather','featherOut',v=>v+' px'],
 ['canvasRatio','canvasRatioOut',v=>v+'%'],['shadowStrength','shadowStrengthOut',v=>v+'%'],['shadowBlur','shadowBlurOut',v=>v+' px'],['shadowY','shadowYOut',v=>v+' px'],['shadowScale','shadowScaleOut',v=>v+'%']
];
controls.forEach(([a,b,fmt])=>$(a).addEventListener('input',e=>$(b).value=fmt(e.target.value)));
function setStatus(t){statusEl.textContent=t||''}
function updateUI(){processBtn.disabled=!files.length;clearBtn.disabled=!files.length&&!results.length;fileSummary.textContent=files.length?`已選擇 ${files.length} 張圖片`:'尚未選取檔案'}
function addFiles(list){const incoming=[...list].filter(f=>/^image\/(jpeg|png|webp)$/.test(f.type));files=[...files,...incoming];updateUI()}
fileInput.addEventListener('change',e=>addFiles(e.target.files));
['dragenter','dragover'].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.add('drag')}));
['dragleave','drop'].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.remove('drag')}));
dropzone.addEventListener('drop',e=>addFiles(e.dataTransfer.files));
clearBtn.addEventListener('click',()=>{files=[];results=[];resultList.innerHTML='';resultsSection.hidden=true;downloadAllBtn.disabled=true;fileInput.value='';setStatus('');updateUI()});
function loadImage(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('圖片讀取失敗'))};img.src=url})}

function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function luminance(r,g,b){return .2126*r+.7152*g+.0722*b}
function median(a){a.sort((x,y)=>x-y);return a[Math.floor(a.length/2)]}
function estimateBackground(data,w,h){
  const rs=[],gs=[],bs=[],ls=[]; const band=Math.max(2,Math.round(Math.min(w,h)*.035));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    if(x<band||y<band||x>=w-band||y>=h-band){const i=(y*w+x)*4;rs.push(data[i]);gs.push(data[i+1]);bs.push(data[i+2]);ls.push(luminance(data[i],data[i+1],data[i+2]))}
  }
  return {r:median(rs),g:median(gs),b:median(bs),l:median(ls)};
}
function colorDist(r,g,b,bg){const dr=r-bg.r,dg=g-bg.g,db=b-bg.b;return Math.sqrt(dr*dr+dg*dg+db*db)}
function buildMask(srcCanvas,mode,tol,edgeBarrier,protect){
  const w=srcCanvas.width,h=srcCanvas.height,ctx=srcCanvas.getContext('2d'),img=ctx.getImageData(0,0,w,h),d=img.data,N=w*h;
  const bg=estimateBackground(d,w,h);
  const dist=new Float32Array(N),lum=new Float32Array(N);
  for(let i=0;i<N;i++){const p=i*4;dist[i]=colorDist(d[p],d[p+1],d[p+2],bg);lum[i]=luminance(d[p],d[p+1],d[p+2])}
  const visited=new Uint8Array(N),q=new Int32Array(N),parent=new Int32Array(N);let head=0,tail=0;
  function push(i){if(!visited[i]){visited[i]=1;q[tail++]=i}}
  for(let x=0;x<w;x++){push(x);if(h>1)push((h-1)*w+x)}
  for(let y=1;y<h-1;y++){push(y*w);if(w>1)push(y*w+w-1)}
  const baseTol=tol;
  function bgLike(i){
    const brightGap=Math.abs(lum[i]-bg.l);
    const t=mode==='safe'?baseTol:(mode==='balanced'?baseTol+5:baseTol+10);
    return dist[i]<=t || brightGap<=t*.72;
  }
  function canCross(a,b){
    const grad=Math.abs(lum[a]-lum[b]);
    const colorGap=Math.abs(dist[a]-dist[b]);
    const limit=edgeBarrier;
    return grad<=limit && colorGap<=limit*1.35;
  }
  while(head<tail){
    const i=q[head++]; const x=i%w,y=(i/w)|0;
    const ns=[]; if(x>0)ns.push(i-1);if(x<w-1)ns.push(i+1);if(y>0)ns.push(i-w);if(y<h-1)ns.push(i+w);
    for(const n of ns){if(visited[n]||!bgLike(n))continue;if(!canCross(i,n))continue;push(n)}
  }
  const alpha=new Uint8Array(N);
  for(let i=0;i<N;i++)alpha[i]=visited[i]?0:255;

  // Remove tiny background islands only when clearly background-like; preserve enclosed white product areas.
  const seen=new Uint8Array(N), stack=new Int32Array(Math.min(N,200000));
  const minIsland=Math.max(12,Math.round(N/9000));
  for(let start=0;start<N;start++){
    if(seen[start]||alpha[start]!==0)continue; seen[start]=1;let sh=0,sz=0;stack[sh++]=start;const members=[];
    while(sh){const i=stack[--sh];members.push(i);sz++;const x=i%w,y=(i/w)|0;const ns=[];if(x>0)ns.push(i-1);if(x<w-1)ns.push(i+1);if(y>0)ns.push(i-w);if(y<h-1)ns.push(i+w);for(const n of ns)if(!seen[n]&&alpha[n]===0){seen[n]=1;if(sh<stack.length)stack[sh++]=n}}
    if(sz<minIsland)for(const i of members)alpha[i]=255;
  }
  // Protect a narrow halo around foreground. This does not change RGB, only keeps a small alpha fringe.
  const p=Math.round(protect);
  if(p>0){const copy=alpha.slice();for(let pass=0;pass<p;pass++)for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(copy[i]===0&&(copy[i-1]||copy[i+1]||copy[i-w]||copy[i+w]))alpha[i]=70}}
  return {alpha,bg};
}
function cropBounds(alpha,w,h){let minX=w,minY=h,maxX=-1,maxY=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(alpha[y*w+x]>18){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y}}if(maxX<0)return{x:0,y:0,w,h};return{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1}}
function makeMaskCanvas(src,alpha){const c=document.createElement('canvas');c.width=src.width;c.height=src.height;const cctx=c.getContext('2d');const im=src.getContext('2d').getImageData(0,0,src.width,src.height);for(let i=0;i<alpha.length;i++)im.data[i*4+3]=alpha[i];cctx.putImageData(im,0,0);return c}
function drawShadow(ctx,maskCanvas,x,y,w,h,strength,blur,dy,scale){if(strength<=0)return;const sh=document.createElement('canvas');sh.width=maskCanvas.width;sh.height=maskCanvas.height;const s=sh.getContext('2d');s.drawImage(maskCanvas,0,0);s.globalCompositeOperation='source-in';s.fillStyle=`rgba(0,0,0,${strength/100})`;s.fillRect(0,0,sh.width,sh.height);ctx.save();ctx.filter=`blur(${blur}px)`;ctx.drawImage(sh,x-(w*(scale-100)/200),y+dy,w*(scale/100),h*(scale/100));ctx.restore()}
function outputSize(img,mode){if(mode!=='original'){const n=Number(mode);return[n,n]}const s=Math.max(1000,1000/Math.min(img.width,img.height));return[Math.round(img.width*s),Math.round(img.height*s)]}
function resizeCanvas(src,maxSide=1600){const scale=Math.min(1,maxSide/Math.max(src.width,src.height));if(scale===1)return src;const c=document.createElement('canvas');c.width=Math.max(1,Math.round(src.width*scale));c.height=Math.max(1,Math.round(src.height*scale));const x=c.getContext('2d');x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(src,0,0,c.width,c.height);return c}

async function processOne(file){
  const img=await loadImage(file);file._img=img;
  const raw=document.createElement('canvas');raw.width=img.naturalWidth;raw.height=img.naturalHeight;raw.getContext('2d').drawImage(img,0,0);
  const work=resizeCanvas(raw,1600);
  const maskInfo=buildMask(work,$('mode').value,Number($('bgTolerance').value),Number($('edgeBarrier').value),Number($('edgeProtect').value));
  const b=cropBounds(maskInfo.alpha,work.width,work.height);
  const maskCanvas=makeMaskCanvas(work,maskInfo.alpha);
  const [ow,oh]=outputSize(img,$('size').value),ratio=Number($('canvasRatio').value)/100;
  const out=document.createElement('canvas');out.width=ow;out.height=oh;const ctx=out.getContext('2d');ctx.fillStyle=$('background').value;ctx.fillRect(0,0,ow,oh);
  const maxW=ow*ratio,maxH=oh*ratio,scale=Math.min(maxW/b.w,maxH/b.h),dw=b.w*scale,dh=b.h*scale,dx=(ow-dw)/2,dy=(oh-dh)/2;
  const productLayer=document.createElement('canvas');productLayer.width=b.w;productLayer.height=b.h;productLayer.getContext('2d').drawImage(maskCanvas,b.x,b.y,b.w,b.h,0,0,b.w,b.h);
  if($('addShadow').checked)drawShadow(ctx,productLayer,dx,dy,dw,dh,Number($('shadowStrength').value),Number($('shadowBlur').value),Number($('shadowY').value),Number($('shadowScale').value));
  ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';if(Number($('feather').value)>0)ctx.filter=`blur(${Number($('feather').value)/2}px)`;ctx.drawImage(productLayer,dx,dy,dw,dh);ctx.restore();
  const mime=$('format').value,quality=mime==='image/png'?undefined:.95,blob=await new Promise(resolve=>out.toBlob(resolve,mime,quality));
  return{file,blob,canvas:out,width:ow,height:oh,maskInfo};
}
function makeName(name){const base=name.replace(/\.[^.]+$/,'');const ext=$('format').value==='image/png'?'png':$('format').value==='image/webp'?'webp':'jpg';return`${base}_白底棚拍_V3.${ext}`}
function downloadBlob(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
function makeResultItem(r){const item=document.createElement('article');item.className='result-item';const compare=document.createElement('div');compare.className='compare';const before=document.createElement('div');before.className='panel';const after=document.createElement('div');after.className='panel';before.innerHTML="<div class='panel-title'>原圖</div>";after.innerHTML="<div class='panel-title'>V3 商品保真＋智慧去背</div>";const bc=document.createElement('canvas'),ac=document.createElement('canvas');bc.width=r.file._img.naturalWidth;bc.height=r.file._img.naturalHeight;bc.getContext('2d').drawImage(r.file._img,0,0);ac.width=r.canvas.width;ac.height=r.canvas.height;ac.getContext('2d').drawImage(r.canvas,0,0);before.appendChild(bc);after.appendChild(ac);compare.append(before,after);item.appendChild(compare);const meta=document.createElement('div');meta.className='meta';meta.textContent=`${r.file.name}｜輸出 ${r.width} × ${r.height} px｜${(r.blob.size/1024/1024).toFixed(2)} MB`;item.appendChild(meta);const btn=document.createElement('button');btn.className='secondary download-one';btn.textContent='下載此圖片';btn.onclick=()=>downloadBlob(r.blob,makeName(r.file.name));item.appendChild(btn);return item}

processBtn.addEventListener('click',async()=>{if(!files.length)return;processBtn.disabled=true;downloadAllBtn.disabled=true;results=[];resultList.innerHTML='';resultsSection.hidden=false;setStatus('正在智慧去背，優先保留商品本體。');let done=0;try{for(const f of files){const r=await processOne(f);results.push(r);done++;resultList.appendChild(makeResultItem(r));summary.textContent=`共 ${results.length} 張｜已完成 ${done}/${files.length} 張`}downloadAllBtn.disabled=false;setStatus('處理完成。請先檢查商品外框、Logo、文字與陰影，再下載。')}catch(err){console.error(err);setStatus('處理失敗：'+err.message)}finally{processBtn.disabled=false;updateUI()}});
downloadAllBtn.addEventListener('click',async()=>{if(!results.length||typeof JSZip==='undefined'){setStatus('ZIP 模組尚未載入，請稍後再試。');return}downloadAllBtn.disabled=true;setStatus('正在建立 ZIP，請稍候。');const zip=new JSZip();results.forEach(r=>zip.file(makeName(r.file.name),r.blob));const blob=await zip.generateAsync({type:'blob'});downloadBlob(blob,'商品白底棚拍_V3_全部.zip');downloadAllBtn.disabled=false;setStatus('ZIP 已開始下載。')});
updateUI();
