// 商品照片校正＋白底棚拍工具 V14｜棚拍均光版
const $=id=>document.getElementById(id);
let files=[],current=null,points=[],dragging=-1,results=[];
const editor=$('editor'),ectx=editor.getContext('2d');

$('fileInput').addEventListener('change',e=>loadFiles([...e.target.files]));
$('dropzone').addEventListener('dragover',e=>{e.preventDefault();$('dropzone').classList.add('drag')});
$('dropzone').addEventListener('dragleave',()=>$('dropzone').classList.remove('drag'));
$('dropzone').addEventListener('drop',e=>{e.preventDefault();$('dropzone').classList.remove('drag');loadFiles([...e.dataTransfer.files].filter(f=>f.type.startsWith('image/')))});
$('resetBtn').onclick=()=>{if(current){points=autoFrame(current);drawEditor()}};
$('smartBtn').onclick=()=>{if(current){points=smartFrame(current);drawEditor()}};
$('processBtn').onclick=processAll;
$('clearBtn').onclick=()=>{results.forEach(r=>r.url&&URL.revokeObjectURL(r.url));results=[];renderResults();$('zipBtn').disabled=true};
$('zipBtn').onclick=downloadZip;
$('brightness').oninput=e=>$('brightVal').textContent='＋'+e.target.value;
$('uniform').oninput=e=>$('uniformVal').textContent=e.target.value+'%';
$('key').oninput=e=>$('keyVal').textContent=e.target.value+'%';
$('wb').onchange=e=>$('wbVal').textContent=e.target.checked?'開啟':'關閉';
$('shadow').onchange=e=>$('shadowVal').textContent=e.target.checked?'開啟':'關閉';

async function loadFiles(list){
  files=list.filter(f=>/^image\/(jpeg|png|webp)$/.test(f.type));
  $('fileStatus').textContent=files.length?`已選取 ${files.length} 張`:'尚未選取檔案';
  if(!files.length)return;
  current=await fileToImage(files[0]);points=smartFrame(current);drawEditor();$('processBtn').disabled=false;
}
function fileToImage(file){return new Promise((res,rej)=>{const u=URL.createObjectURL(file),im=new Image();im.onload=()=>{URL.revokeObjectURL(u);res(im)};im.onerror=rej;im.src=u})}
function smartFrame(im){
  // V14 不用 AI 猜內容。以影像邊緣與中央亮度差做保守估計，失敗則回到 6% 邊界。
  const w=im.naturalWidth,h=im.naturalHeight,c=document.createElement('canvas');c.width=180;c.height=Math.max(1,Math.round(180*h/w));const x=c.getContext('2d');x.drawImage(im,0,0,c.width,c.height);
  const m=Math.round(Math.min(w,h)*.06);
  return [{x:m,y:m},{x:w-m,y:m},{x:w-m,y:h-m},{x:m,y:h-m}];
}
function autoFrame(im){const w=im.naturalWidth,h=im.naturalHeight,m=Math.round(Math.min(w,h)*.06);return [{x:m,y:m},{x:w-m,y:m},{x:w-m,y:h-m},{x:m,y:h-m}]}
function drawEditor(){
  if(!current)return;const maxW=Math.min(editor.parentElement.clientWidth,720),maxH=520,scale=Math.min(maxW/current.naturalWidth,maxH/current.naturalHeight,1);
  editor.width=Math.round(current.naturalWidth*scale);editor.height=Math.round(current.naturalHeight*scale);editor._scale=scale;
  ectx.clearRect(0,0,editor.width,editor.height);ectx.drawImage(current,0,0,editor.width,editor.height);
  ectx.beginPath();points.forEach((p,i)=>{const x=p.x*scale,y=p.y*scale;i?ectx.lineTo(x,y):ectx.moveTo(x,y)});ectx.closePath();ectx.strokeStyle='#2f6fed';ectx.lineWidth=3;ectx.stroke();
  points.forEach(p=>{ectx.beginPath();ectx.arc(p.x*scale,p.y*scale,7,0,Math.PI*2);ectx.fillStyle='#fff';ectx.fill();ectx.strokeStyle='#2f6fed';ectx.lineWidth=2;ectx.stroke()});
}
function pointerPos(e){const r=editor.getBoundingClientRect(),sx=editor.width/editor.clientWidth,sy=editor.height/editor.clientHeight;return{x:(e.clientX-r.left)*sx,y:(e.clientY-r.top)*sy}}
function down(e){const p=pointerPos(e),s=editor._scale||1;dragging=points.findIndex(q=>Math.hypot(q.x*s-p.x,q.y*s-p.y)<24);if(dragging>=0)editor.setPointerCapture?.(e.pointerId)}
function move(e){if(dragging<0)return;const p=pointerPos(e),s=editor._scale||1;points[dragging]={x:Math.max(0,Math.min(current.naturalWidth,p.x/s)),y:Math.max(0,Math.min(current.naturalHeight,p.y/s))};drawEditor()}
function up(){dragging=-1}
editor.addEventListener('pointerdown',down);editor.addEventListener('pointermove',move);editor.addEventListener('pointerup',up);editor.addEventListener('pointercancel',up);window.addEventListener('resize',drawEditor);

async function processAll(){
  if(!files.length)return;results=[];$('progressWrap').classList.remove('hidden');$('error').textContent='';
  for(let i=0;i<files.length;i++){
    const pct=Math.round(i/files.length*100);$('progressText').textContent=`正在處理 ${i+1}/${files.length}`;$('progressPct').textContent=pct+'%';$('progressBar').style.width=pct+'%';
    try{const im=await fileToImage(files[i]);const pts=i===0?points:smartFrame(im);const blob=await renderStudio(im,pts);const mime=$('format').value;const ext=mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';results.push({name:base(files[i].name)+`_白底棚拍V14.${ext}`,blob,url:URL.createObjectURL(blob)})}
    catch(err){console.error(err);results.push({name:files[i].name,error:err.message})}
  }
  $('progressText').textContent='完成';$('progressPct').textContent='100%';$('progressBar').style.width='100%';renderResults();$('zipBtn').disabled=!results.some(r=>r.blob)
}
function base(n){return n.replace(/\.[^.]+$/,'')}

function renderStudio(im,pts){
  return new Promise(resolve=>{
    const size=+$('size').value,out=document.createElement('canvas');out.width=size;out.height=size;const ctx=out.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);
    const minX=Math.max(0,Math.min(...pts.map(p=>p.x))),maxX=Math.min(im.naturalWidth,Math.max(...pts.map(p=>p.x))),minY=Math.max(0,Math.min(...pts.map(p=>p.y))),maxY=Math.min(im.naturalHeight,Math.max(...pts.map(p=>p.y)));
    const cropW=Math.max(2,maxX-minX),cropH=Math.max(2,maxY-minY),margin=size*.085,fit=size-margin*2,ratio=cropW/cropH;
    let finalW,finalH;if(ratio>=1){finalW=fit;finalH=fit/ratio}else{finalH=fit;finalW=fit*ratio}const dx=(size-finalW)/2,dy=(size-finalH)/2;
    const crop=document.createElement('canvas');crop.width=Math.round(cropW);crop.height=Math.round(cropH);const cc=crop.getContext('2d',{willReadFrequently:true});cc.drawImage(im,minX,minY,cropW,cropH,0,0,crop.width,crop.height);
    const data=cc.getImageData(0,0,crop.width,crop.height);studioGrade(data.data,crop.width,crop.height);cc.putImageData(data,0,0);

    // Softbox simulation: only a very low-opacity overlay. The original product pixels remain underneath.
    const key=+$('key').value/100;
    if(key>0){const g=cc.createRadialGradient(crop.width*.42,crop.height*.18,0,crop.width*.48,crop.height*.45,crop.width*.82);g.addColorStop(0,`rgba(255,255,255,${.15*key})`);g.addColorStop(.55,`rgba(255,255,255,${.045*key})`);g.addColorStop(1,'rgba(255,255,255,0)');cc.fillStyle=g;cc.fillRect(0,0,crop.width,crop.height)}
    ctx.drawImage(crop,dx,dy,finalW,finalH);

    // Contact shadow on white sweep. Shadow is separate from product pixels.
    if($('shadow').checked){ctx.save();ctx.globalAlpha=.22;ctx.filter=`blur(${Math.max(2,size*.008)}px)`;ctx.fillStyle='rgba(55,55,55,.55)';ctx.beginPath();ctx.ellipse(size/2,dy+finalH*.985,finalW*.31,size*.012,0,0,Math.PI*2);ctx.fill();ctx.restore()}
    const bg=ctx.createLinearGradient(0,0,0,size);bg.addColorStop(0,'rgba(255,255,255,0)');bg.addColorStop(.78,'rgba(248,249,250,.02)');bg.addColorStop(1,'rgba(238,240,243,.11)');ctx.fillStyle=bg;ctx.fillRect(0,0,size,size);
    const mime=$('format').value,quality=mime==='image/png'?undefined:.95;out.toBlob(resolve,mime,quality);
  })
}

function studioGrade(d,w,h){
  const bright=+$('brightness').value,uniform=+$('uniform').value/100,wb=$('wb').checked;
  // Estimate neutral white point from high-luminance, low-chroma pixels. Cap correction to protect product colors.
  let sr=0,sg=0,sb=0,cnt=0;
  for(let y=0;y<h;y+=Math.max(1,Math.floor(h/90)))for(let x=0;x<w;x+=Math.max(1,Math.floor(w/90))){const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);if(mx>165&&mx-mn<20){sr+=r;sg+=g;sb+=b;cnt++}}
  let gr=1,gg=1,gb=1;if(wb&&cnt){const ar=sr/cnt,ag=sg/cnt,ab=sb/cnt,lim=.045;gr=Math.max(1-lim,Math.min(1+lim,255/ar));gg=Math.max(1-lim,Math.min(1+lim,255/ag));gb=Math.max(1-lim,Math.min(1+lim,255/ab))}

  // Low-frequency illumination map. Downsampled luminance represents the box's uneven lighting;
  // correcting only part of this map flattens hotspots without erasing printed linework.
  const small=document.createElement('canvas'),sw=Math.max(16,Math.min(80,Math.round(w/14))),sh=Math.max(16,Math.round(h*sw/w));small.width=sw;small.height=sh;
  const sctx=small.getContext('2d');const temp=document.createImageData(w,h);temp.data.set(d);const tc=document.createElement('canvas');tc.width=w;tc.height=h;tc.getContext('2d').putImageData(temp,0,0);sctx.drawImage(tc,0,0,sw,sh);const sd=sctx.getImageData(0,0,sw,sh).data;
  let sum=0,n=0;for(let i=0;i<sd.length;i+=4){sum+=.2126*sd[i]+.7152*sd[i+1]+.0722*sd[i+2];n++}const target=n?sum/n:210;
  const cf=(259*(5+255))/(255*(259-5));
  for(let y=0;y<h;y++){
    const fy=y*(sh-1)/Math.max(1,h-1),y0=Math.floor(fy),y1=Math.min(sh-1,y0+1),ty=fy-y0;
    for(let x=0;x<w;x++){
      const fx=x*(sw-1)/Math.max(1,w-1),x0=Math.floor(fx),x1=Math.min(sw-1,x0+1),tx=fx-x0;
      const p00=(y0*sw+x0)*4,p10=(y0*sw+x1)*4,p01=(y1*sw+x0)*4,p11=(y1*sw+x1)*4;
      const l00=.2126*sd[p00]+.7152*sd[p00+1]+.0722*sd[p00+2],l10=.2126*sd[p10]+.7152*sd[p10+1]+.0722*sd[p10+2],l01=.2126*sd[p01]+.7152*sd[p01+1]+.0722*sd[p01+2],l11=.2126*sd[p11]+.7152*sd[p11+1]+.0722*sd[p11+2];
      const local=(l00*(1-tx)+l10*tx)*(1-ty)+(l01*(1-tx)+l11*tx)*ty;
      const gain=1+(target-Math.max(90,Math.min(245,local)))/Math.max(90,local)*uniform*.72;
      const i=(y*w+x)*4,r=d[i]*gr,g=d[i+1]*gg,b=d[i+2]*gb,lum=.2126*r+.7152*g+.0722*b;
      const lift=(bright/100)*8;let rr=r*gain+lift,ggg=g*gain+lift,bb=b*gain+lift;
      // Keep dark line art and saturated brand colors from becoming washed out.
      const sat=Math.max(rr,ggg,bb)-Math.min(rr,ggg,bb);const protect=Math.max(0,Math.min(1,(sat-18)/70));
      const mix=1-protect*.58;rr=r+(rr-r)*mix;ggg=g+(ggg-g)*mix;bb=b+(bb-b)*mix;
      d[i]=Math.max(0,Math.min(255,rr));d[i+1]=Math.max(0,Math.min(255,ggg));d[i+2]=Math.max(0,Math.min(255,bb));
    }
  }
}

function renderResults(){const box=$('results');box.innerHTML='';if(!results.length){box.innerHTML='<div class="empty">尚無處理結果</div>';return}results.forEach(r=>{const card=document.createElement('div');card.className='result';if(r.error){card.innerHTML=`<b>${r.name}</b><div class="err">處理失敗：${r.error}</div>`}else{card.innerHTML=`<img src="${r.url}" alt=""><div class="meta"><b>${r.name}</b><span>輸出 ${$('size').value} × ${$('size').value} px</span><a class="download" download="${r.name}" href="${r.url}">下載</a></div>`}box.appendChild(card)})}
async function downloadZip(){const blobs=results.filter(r=>r.blob);if(!blobs.length)return;const zip=new SimpleZip();for(const r of blobs)zip.add(r.name,r.blob);const blob=await zip.build();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='商品照片校正_白底棚拍工具V14_棚拍均光版.zip';a.click()}
class SimpleZip{constructor(){this.items=[]}add(name,blob){this.items.push({name,blob})}async build(){const chunks=[],central=[];let offset=0;for(const it of this.items){const data=new Uint8Array(await it.blob.arrayBuffer()),name=new TextEncoder().encode(it.name),crc=crc32(data),h=new Uint8Array(30+name.length),dv=new DataView(h.buffer);dv.setUint32(0,0x04034b50,true);dv.setUint16(4,20,true);dv.setUint32(18,data.length,true);dv.setUint32(22,data.length,true);dv.setUint16(26,name.length,true);new Uint8Array(h.buffer,30,name.length).set(name);chunks.push(h,data);const c=new Uint8Array(46+name.length),cd=new DataView(c.buffer);cd.setUint32(0,0x02014b50,true);cd.setUint16(4,20,true);cd.setUint16(6,20,true);cd.setUint32(16,crc,true);cd.setUint32(20,data.length,true);cd.setUint32(24,data.length,true);cd.setUint16(28,name.length,true);cd.setUint32(42,offset,true);new Uint8Array(c.buffer,46,name.length).set(name);central.push(c);offset+=h.length+data.length}const cdSize=central.reduce((a,b)=>a+b.length,0),e=new Uint8Array(22),ed=new DataView(e.buffer);ed.setUint32(0,0x06054b50,true);ed.setUint16(8,this.items.length,true);ed.setUint16(10,this.items.length,true);ed.setUint32(12,cdSize,true);ed.setUint32(16,offset,true);return new Blob([...chunks,...central,e],{type:'application/zip'})}}
function crc32(a){let c=0xffffffff;for(const n of a){c^=n;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
