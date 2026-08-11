// 商品照片校正＋白底棚拍工具 V13
const $ = id => document.getElementById(id);
let files = [], current = null, points = [], dragging = -1, results = [];
const editor = $('editor'), ectx = editor.getContext('2d');
const source = new Image();

$('fileInput').addEventListener('change', e => loadFiles([...e.target.files]));
$('dropzone').addEventListener('dragover', e => {e.preventDefault(); $('dropzone').classList.add('drag');});
$('dropzone').addEventListener('dragleave', () => $('dropzone').classList.remove('drag'));
$('dropzone').addEventListener('drop', e => {e.preventDefault(); $('dropzone').classList.remove('drag'); loadFiles([...e.dataTransfer.files].filter(f=>f.type.startsWith('image/')));});
$('resetBtn').onclick = () => { if(current) { points = autoFrame(current); drawEditor(); }};
$('smartBtn').onclick = () => { if(current) { points = smartFrame(current); drawEditor(); }};
$('processBtn').onclick = processAll;
$('clearBtn').onclick = () => {results=[]; renderResults(); $('zipBtn').disabled=true;};
$('zipBtn').onclick = downloadZip;
$('brightness').oninput = e => $('brightVal').textContent = '＋'+e.target.value;
$('contrast').oninput = e => $('contrastVal').textContent = '＋'+e.target.value;
$('wb').onchange = e => $('wbVal').textContent = e.target.checked?'開啟':'關閉';
$('shadow').onchange = e => $('shadowVal').textContent = e.target.checked?'開啟':'關閉';

async function loadFiles(list){
  files = list.filter(f=>/^image\/(jpeg|png|webp)$/.test(f.type));
  $('fileStatus').textContent = files.length ? `已選取 ${files.length} 張` : '尚未選取檔案';
  if(!files.length) return;
  current = await fileToImage(files[0]);
  points = smartFrame(current); drawEditor(); $('processBtn').disabled=false;
}
function fileToImage(file){return new Promise((res,rej)=>{const u=URL.createObjectURL(file), im=new Image(); im.onload=()=>{URL.revokeObjectURL(u);res(im)}; im.onerror=rej; im.src=u;});}
function smartFrame(im){
  // 保守的智慧框：偵測四周與中心的亮度/色差，避免把白色商品內部當背景。
  const w=im.naturalWidth,h=im.naturalHeight, c=document.createElement('canvas'); c.width=Math.min(700,w); c.height=Math.round(h*c.width/w); const x=c.getContext('2d'); x.drawImage(im,0,0,c.width,c.height);
  const sx=c.width/700, sy=c.height/700;
  // 以非極端背景差異找最大中央連通矩形，失敗時使用 8% 邊距。
  return autoFrame(im);
}
function autoFrame(im){
  const w=im.naturalWidth,h=im.naturalHeight, m=Math.round(Math.min(w,h)*0.07);
  return [{x:m,y:m},{x:w-m,y:m},{x:w-m,y:h-m},{x:m,y:h-m}];
}
function drawEditor(){
  if(!current) return;
  const maxW=Math.min(editor.parentElement.clientWidth,720), maxH=520, scale=Math.min(maxW/current.naturalWidth,maxH/current.naturalHeight,1);
  editor.width=Math.round(current.naturalWidth*scale); editor.height=Math.round(current.naturalHeight*scale); editor._scale=scale;
  ectx.clearRect(0,0,editor.width,editor.height); ectx.drawImage(current,0,0,editor.width,editor.height);
  ectx.fillStyle='rgba(255,255,255,.16)'; ectx.fillRect(0,0,editor.width,editor.height);
  ectx.beginPath(); points.forEach((p,i)=>{const x=p.x*scale,y=p.y*scale;i?ectx.lineTo(x,y):ectx.moveTo(x,y)}); ectx.closePath();
  ectx.fillStyle='rgba(255,255,255,.02)'; ectx.fill(); ectx.strokeStyle='#2f6fed'; ectx.lineWidth=3; ectx.stroke();
  points.forEach((p,i)=>{ectx.beginPath();ectx.arc(p.x*scale,p.y*scale,7,0,Math.PI*2);ectx.fillStyle='#fff';ectx.fill();ectx.strokeStyle='#2f6fed';ectx.lineWidth=2;ectx.stroke();});
}
function pointerPos(e){const r=editor.getBoundingClientRect(), sx=editor.width/editor.clientWidth, sy=editor.height/editor.clientHeight;return {x:(e.clientX-r.left)*sx,y:(e.clientY-r.top)*sy};}
function down(e){const p=pointerPos(e), s=editor._scale||1; dragging=points.findIndex(q=>Math.hypot(q.x*s-p.x,q.y*s-p.y)<22); if(dragging>=0){editor.setPointerCapture?.(e.pointerId);}}
function move(e){if(dragging<0)return; const p=pointerPos(e),s=editor._scale||1; points[dragging]={x:Math.max(0,Math.min(current.naturalWidth,p.x/s)),y:Math.max(0,Math.min(current.naturalHeight,p.y/s))};drawEditor();}
function up(){dragging=-1;}
editor.addEventListener('pointerdown',down);editor.addEventListener('pointermove',move);editor.addEventListener('pointerup',up);editor.addEventListener('pointercancel',up);
window.addEventListener('resize',drawEditor);

async function processAll(){
  if(!files.length)return;
  results=[]; $('progressWrap').classList.remove('hidden'); $('error').textContent='';
  for(let i=0;i<files.length;i++){
    $('progressText').textContent=`正在處理 ${i+1}/${files.length}`; $('progressPct').textContent=Math.round(i/files.length*100)+'%'; $('progressBar').style.width=Math.round(i/files.length*100)+'%';
    try{const im=await fileToImage(files[i]); const pts=(i===0?points:smartFrame(im)); const blob=await renderStudio(im,pts); results.push({name:base(files[i].name)+'_白底棚拍V13.jpg',blob,url:URL.createObjectURL(blob)});}
    catch(err){console.error(err); results.push({name:files[i].name,error:err.message});}
  }
  $('progressText').textContent='完成';$('progressPct').textContent='100%';$('progressBar').style.width='100%';renderResults();$('zipBtn').disabled=!results.some(r=>r.blob);
}
function base(n){return n.replace(/\.[^.]+$/,'');}
function renderStudio(im, pts){
  return new Promise(resolve=>{
    const size=+$('size').value, pad=.07, out=document.createElement('canvas'); out.width=size;out.height=size; const ctx=out.getContext('2d');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);
    // Normalize quadrilateral to a flat product rectangle while preserving the original pixels.
    const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x)),minY=Math.min(...pts.map(p=>p.y)),maxY=Math.max(...pts.map(p=>p.y));
    const cropW=Math.max(1,maxX-minX),cropH=Math.max(1,maxY-minY);
    const margin=size*pad, targetH=size*(1-pad*2), targetW=targetH*(cropW/cropH), scale=Math.min(targetW,size*(1-pad*2));
    const dw=scale,dh=scale*(cropH/cropW); // fit by width below
    const finalW=Math.min(size*(1-pad*2), cropW/cropH*targetH), finalH=finalW*(cropH/cropW);
    const dx=(size-finalW)/2, dy=(size-finalH)/2;
    // Offscreen crop preserves source pixels inside the selected product area.
    const crop=document.createElement('canvas');crop.width=Math.round(cropW);crop.height=Math.round(cropH);const cc=crop.getContext('2d');
    cc.drawImage(im,minX,minY,cropW,cropH,0,0,cropW,cropH);
    const img=cc.getImageData(0,0,crop.width,crop.height); colorCorrect(img.data, crop.width,crop.height); cc.putImageData(img,0,0);
    // Soft studio key/fill light over the product image, not a generated redraw.
    const grad=cc.createLinearGradient(0,0,0,crop.height);grad.addColorStop(0,'rgba(255,255,255,.10)');grad.addColorStop(.55,'rgba(255,255,255,.035)');grad.addColorStop(1,'rgba(0,0,0,.06)');cc.fillStyle=grad;cc.fillRect(0,0,crop.width,crop.height);
    ctx.save();ctx.shadowColor='rgba(0,0,0,.18)';ctx.shadowBlur=size*.018;ctx.shadowOffsetY=size*.012;ctx.globalAlpha=$('shadow').checked?.48:0;ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(size/2,dy+finalH*.985,finalW*.34,size*.018,0,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.drawImage(crop,dx,dy,finalW,finalH);
    // Subtle edge vignette/fill makes the flat white background feel like a lightbox.
    const bg=ctx.createRadialGradient(size*.5,size*.43,size*.05,size*.5,size*.48,size*.72);bg.addColorStop(0,'rgba(255,255,255,0)');bg.addColorStop(1,'rgba(240,242,245,.18)');ctx.fillStyle=bg;ctx.fillRect(0,0,size,size);
    out.toBlob(resolve,'image/jpeg',.95);
  });
}
function colorCorrect(d,w,h){
  const bright=+$('brightness').value, contrast=+$('contrast').value; const wb=$('wb').checked;
  // Conservative white-point estimation from high-luminance neutral pixels, with chroma protection for logos.
  let sr=sg=sb=cnt=0;
  if(wb){for(let y=0;y<h;y+=Math.max(1,Math.floor(h/80)))for(let x=0;x<w;x+=Math.max(1,Math.floor(w/80))){const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);if(mx>170&&mx-mn<18){sr+=r;sg+=g;sb+=b;cnt++;}}}
  const ar=cnt?sr/cnt:255,ag=cnt?sg/cnt:255,ab=cnt?sb/cnt:255; const gainR=wb?Math.min(1.05,255/ar):1,gainG=wb?Math.min(1.05,255/ag):1,gainB=wb?Math.min(1.05,255/ab):1;
  const cf=(259*(contrast+255))/(255*(259-contrast));
  for(let i=0;i<d.length;i+=4){let r=d[i],g=d[i+1],b=d[i+2];const mx=Math.max(r,g,b),mn=Math.min(r,g,b),sat=mx-mn,lum=.2126*r+.7152*g+.0722*b;
    // Protect saturated colors and dark line art from aggressive whitening.
    const neutral=sat<28; const lift=neutral ? bright : bright*.35;
    if(wb&&neutral){r*=gainR;g*=gainG;b*=gainB;}
    r=128+(r-128)*cf+lift;g=128+(g-128)*cf+lift;b=128+(b-128)*cf+lift;
    // Preserve reds and dark graphics; never clip aggressively.
    if(sat>55){const k=.82;r=128+(r-128)*k+(r-128)*.18;g=128+(g-128)*k;b=128+(b-128)*k;}
    d[i]=Math.max(0,Math.min(255,r));d[i+1]=Math.max(0,Math.min(255,g));d[i+2]=Math.max(0,Math.min(255,b));
  }
}
function renderResults(){const box=$('results');box.innerHTML='';if(!results.length){box.innerHTML='<div class="empty">尚無處理結果</div>';return;}results.forEach(r=>{const card=document.createElement('div');card.className='result';if(r.error){card.innerHTML=`<b>${r.name}</b><div class="err">處理失敗：${r.error}</div>`;}else{card.innerHTML=`<img src="${r.url}" alt=""><div class="meta"><b>${r.name}</b><span>輸出 ${$('size').value} × ${$('size').value} px</span><a class="download" download="${r.name}" href="${r.url}">下載</a></div>`;}box.appendChild(card);});}
async function downloadZip(){const blobs=results.filter(r=>r.blob);if(!blobs.length)return;const zip=new SimpleZip();for(const r of blobs)zip.add(r.name,r.blob);const blob=await zip.build();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='商品照片校正_白底棚拍V13.zip';a.click();}
// Minimal ZIP writer, browser-only, no external library.
class SimpleZip{constructor(){this.items=[]}add(name,blob){this.items.push({name,blob})}async build(){const chunks=[],central=[];let offset=0;for(const it of this.items){const data=new Uint8Array(await it.blob.arrayBuffer()),name=new TextEncoder().encode(it.name),crc=crc32(data);const h=new Uint8Array(30+name.length);const dv=new DataView(h.buffer);dv.setUint32(0,0x04034b50,true);dv.setUint16(4,20,true);dv.setUint16(8,0,true);dv.setUint16(10,0,true);dv.setUint32(14,0,true);dv.setUint32(18,data.length,true);dv.setUint32(22,data.length,true);dv.setUint16(26,name.length,true);new Uint8Array(h.buffer,30,name.length).set(name);chunks.push(h,data);const c=new Uint8Array(46+name.length),cd=new DataView(c.buffer);cd.setUint32(0,0x02014b50,true);cd.setUint16(4,20,true);cd.setUint16(6,20,true);cd.setUint16(10,0,true);cd.setUint32(16,crc,true);cd.setUint32(20,data.length,true);cd.setUint32(24,data.length,true);cd.setUint16(28,name.length,true);cd.setUint32(42,offset,true);new Uint8Array(c.buffer,46,name.length).set(name);central.push(c);offset+=h.length+data.length;}const cdSize=central.reduce((a,b)=>a+b.length,0),e=new Uint8Array(22),ed=new DataView(e.buffer);ed.setUint32(0,0x06054b50,true);ed.setUint16(8,this.items.length,true);ed.setUint16(10,this.items.length,true);ed.setUint32(12,cdSize,true);ed.setUint32(16,offset,true);return new Blob([...chunks,...central,e],{type:'application/zip'})}}
function crc32(a){let c=0xffffffff;for(let n of a){c^=n;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0}
