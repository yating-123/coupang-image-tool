const $=id=>document.getElementById(id);
const fileInput=$("fileInput"),dropzone=$("dropzone"),processBtn=$("processBtn"),clearBtn=$("clearBtn");
const resultsSection=$("resultsSection"),resultList=$("resultList"),downloadAllBtn=$("downloadAllBtn"),summary=$("summary"),statusEl=$("status"),fileSummary=$("fileSummary");
let files=[],results=[];

const controls=[
 ["tolerance","toleranceOut",v=>v],
 ["edgeProtect","edgeProtectOut",v=>v+" px"],
 ["feather","featherOut",v=>v+" px"],
 ["canvasRatio","canvasRatioOut",v=>v+"%"],
 ["shadowStrength","shadowStrengthOut",v=>v+"%"],
 ["shadowBlur","shadowBlurOut",v=>v+" px"],
 ["shadowY","shadowYOut",v=>v+" px"],
 ["shadowScale","shadowScaleOut",v=>v+"%"]
];
controls.forEach(([a,b,fmt])=>$(a).addEventListener("input",e=>$(b).value=fmt(e.target.value)));

function setStatus(t){statusEl.textContent=t||""}
function updateUI(){
  processBtn.disabled=!files.length;
  clearBtn.disabled=!files.length&&!results.length;
  fileSummary.textContent=files.length?`已選擇 ${files.length} 張圖片`:"尚未選取檔案";
}
function addFiles(list){
  const incoming=[...list].filter(f=>/^image\/(jpeg|png|webp)$/.test(f.type));
  files=[...files,...incoming];
  updateUI();
}
fileInput.addEventListener("change",e=>addFiles(e.target.files));
["dragenter","dragover"].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.add("drag")}));
["dragleave","drop"].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.remove("drag")}));
dropzone.addEventListener("drop",e=>addFiles(e.dataTransfer.files));

$("clearBtn").addEventListener("click",()=>{
  files=[];results=[];resultList.innerHTML="";resultsSection.hidden=true;downloadAllBtn.disabled=true;fileInput.value="";setStatus("");updateUI();
});

function loadImage(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("圖片讀取失敗"))};
    img.src=url;
  });
}

/* 
  商品保真去背：
  從四周邊界開始，只移除與背景顏色相近且「連通到畫面邊緣」的像素。
  商品內部白色區域如果被商品輪廓包住，不會被當成背景。
  這比重新生成商品更適合保留 Logo、文字與原始色彩。
*/
function makeMask(srcCanvas,tolerance,protect){
  const w=srcCanvas.width,h=srcCanvas.height,ctx=srcCanvas.getContext("2d");
  const d=ctx.getImageData(0,0,w,h),data=d.data;
  const visited=new Uint8Array(w*h);
  const alpha=new Uint8Array(w*h);
  const qx=new Int32Array(w*h),qy=new Int32Array(w*h);
  let head=0,tail=0;

  function idx(x,y){return y*w+x}
  function push(x,y){
    const i=idx(x,y);
    if(visited[i])return;
    visited[i]=1;qx[tail]=x;qy[tail]=y;tail++;
  }
  for(let x=0;x<w;x++){push(x,0);if(h>1)push(x,h-1)}
  for(let y=1;y<h-1;y++){push(0,y);if(w>1)push(w-1,y)}

  // Estimate background from corners/edges.
  const samples=[];
  [[0,0],[w-1,0],[0,h-1],[w-1,h-1]].forEach(([x,y])=>{
    const i=(y*w+x)*4;samples.push([data[i],data[i+1],data[i+2]]);
  });
  const bg=samples.reduce((a,s)=>[a[0]+s[0],a[1]+s[1],a[2]+s[2]],[0,0,0]).map(v=>v/4);
  const tol=tolerance*tolerance*3;

  function similar(i){
    const dr=data[i]-bg[0],dg=data[i+1]-bg[1],db=data[i+2]-bg[2];
    const dist=dr*dr+dg*dg+db*db;
    const a=data[i+3];
    return a<8 || dist<=tol;
  }

  while(head<tail){
    const x=qx[head],y=qy[head++];
    const i=idx(x,y),di=i*4;
    if(!similar(di))continue;
    alpha[i]=0;
    if(x>0&&!visited[i-1])push(x-1,y);
    if(x<w-1&&!visited[i+1])push(x+1,y);
    if(y>0&&!visited[i-w])push(x,y-1);
    if(y<h-1&&!visited[i+w])push(x,y+1);
  }

  // Everything not reached is treated as product.
  for(let i=0;i<w*h;i++){
    if(alpha[i]===0 && !visited[i]) alpha[i]=255;
    else if(visited[i] && alpha[i]!==0) alpha[i]=255;
  }

  // Protect a narrow border around retained pixels.
  if(protect>0){
    const p=Math.min(8,Math.round(protect));
    for(let pass=0;pass<p;pass++){
      const copy=alpha.slice();
      for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
        const i=idx(x,y);
        if(copy[i]===255)continue;
        if(copy[i-1]||copy[i+1]||copy[i-w]||copy[i+w]) alpha[i]=90;
      }
    }
  }

  // Convert alpha back into source image data without touching RGB values.
  for(let i=0;i<w*h;i++)data[i*4+3]=alpha[i];
  ctx.putImageData(d,0,0);
  return {canvas:srcCanvas,alpha};
}

function cropBounds(canvas){
  const w=canvas.width,h=canvas.height,ctx=canvas.getContext("2d"),d=ctx.getImageData(0,0,w,h).data;
  let minX=w,minY=h,maxX=-1,maxY=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    if(d[(y*w+x)*4+3]>10){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y}
  }
  if(maxX<0)return {x:0,y:0,w,h};
  return {x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};
}

function drawShadow(ctx,maskCanvas,x,y,w,h,strength,blur,dy,scale){
  if(strength<=0)return;
  const shadow=document.createElement("canvas");
  shadow.width=maskCanvas.width;shadow.height=maskCanvas.height;
  const sctx=shadow.getContext("2d");
  sctx.drawImage(maskCanvas,0,0);
  sctx.globalCompositeOperation="source-in";
  sctx.fillStyle=`rgba(0,0,0,${strength/100})`;
  sctx.fillRect(0,0,shadow.width,shadow.height);
  ctx.save();
  ctx.filter=`blur(${blur}px)`;
  ctx.globalAlpha=1;
  ctx.drawImage(shadow,x-(w*(scale-100)/200),y+dy,w*(scale/100),h*(scale/100));
  ctx.restore();
}

function outputSize(img,mode){
  if(mode!=="original")return [Number(mode),Number(mode)];
  const s=Math.max(1000,Math.min(4000,1000/Math.min(img.width,img.height)));
  return [Math.round(img.width*s),Math.round(img.height*s)];
}

async function processOne(file){
  const img=await loadImage(file);
  const src=document.createElement("canvas");src.width=img.naturalWidth;src.height=img.naturalHeight;
  src.getContext("2d").drawImage(img,0,0);
  const tol=Number($("tolerance").value),protect=Number($("edgeProtect").value);
  const feather=Number($("feather").value);
  const {canvas:masked}=makeMask(src,tol,protect);
  const b=cropBounds(masked);

  const ratio=Number($("canvasRatio").value)/100;
  const [ow,oh]=outputSize(img,$("size").value);
  const bg=$("background").value;
  const out=document.createElement("canvas");out.width=ow;out.height=oh;
  const ctx=out.getContext("2d");
  ctx.fillStyle=bg;ctx.fillRect(0,0,ow,oh);

  const maxW=ow*ratio,maxH=oh*ratio;
  const scale=Math.min(maxW/b.w,maxH/b.h);
  const dw=b.w*scale,dh=b.h*scale;
  const dx=(ow-dw)/2,dy=(oh-dh)/2;

  const productLayer=document.createElement("canvas");
  productLayer.width=b.w;productLayer.height=b.h;
  productLayer.getContext("2d").drawImage(masked,b.x,b.y,b.w,b.h,0,0,b.w,b.h);

  if($("addShadow").checked){
    drawShadow(ctx,productLayer,dx,dy,dw,dh,
      Number($("shadowStrength").value),
      Number($("shadowBlur").value),
      Number($("shadowY").value),
      Number($("shadowScale").value));
  }

  ctx.save();
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality="high";
  ctx.globalAlpha=1;
  if(feather>0)ctx.filter=`blur(${feather/2}px)`;
  ctx.drawImage(productLayer,dx,dy,dw,dh);
  ctx.restore();

  const mime=$("format").value;
  const quality=mime==="image/png"?undefined:.95;
  const blob=await new Promise(resolve=>out.toBlob(resolve,mime,quality));
  return {file,blob,canvas:out,width:ow,height:oh};
}

function makeResultItem(r,i){
  const item=document.createElement("article");item.className="result-item";
  const compare=document.createElement("div");compare.className="compare";
  const before=document.createElement("div");before.className="panel";
  const after=document.createElement("div");after.className="panel";
  before.innerHTML="<div class='panel-title'>原圖</div>";
  after.innerHTML="<div class='panel-title'>商品保真白底棚拍</div>";
  const bc=document.createElement("canvas"),ac=document.createElement("canvas");
  bc.width=r.file._img.naturalWidth;bc.height=r.file._img.naturalHeight;
  bc.getContext("2d").drawImage(r.file._img,0,0);
  ac.width=r.canvas.width;ac.height=r.canvas.height;ac.getContext("2d").drawImage(r.canvas,0,0);
  before.appendChild(bc);after.appendChild(ac);compare.append(before,after);
  item.appendChild(compare);
  const meta=document.createElement("div");meta.className="meta";
  meta.textContent=`${r.file.name}｜輸出 ${r.width} × ${r.height} px｜${(r.blob.size/1024/1024).toFixed(2)} MB`;
  item.appendChild(meta);
  const btn=document.createElement("button");btn.className="secondary download-one";btn.textContent="下載此圖片";
  btn.onclick=()=>downloadBlob(r.blob,makeName(r.file.name));
  item.appendChild(btn);
  return item;
}

function makeName(name){
  const base=name.replace(/\.[^.]+$/,"");
  const ext=$("format").value==="image/png"?"png":$("format").value==="image/webp"?"webp":"jpg";
  return `${base}_白底棚拍_V2.${ext}`;
}
function downloadBlob(blob,name){
  const a=document.createElement("a"),url=URL.createObjectURL(blob);
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}

processBtn.addEventListener("click",async()=>{
  if(!files.length)return;
  processBtn.disabled=true;downloadAllBtn.disabled=true;results=[];resultList.innerHTML="";
  resultsSection.hidden=false;setStatus("正在處理，商品像素會盡量保持原樣。");
  let done=0;
  try{
    for(const f of files){
      const img=await loadImage(f);
      f._img=img;
      const r=await processOne(f);
      results.push(r);done++;
      resultList.appendChild(makeResultItem(r,done));
      summary.textContent=`共 ${results.length} 張｜已完成 ${done}/${files.length} 張`;
    }
    downloadAllBtn.disabled=false;
    setStatus("處理完成，請先檢查原圖與結果對照，再下載。");
  }catch(err){
    console.error(err);setStatus("處理失敗："+err.message);
  }finally{processBtn.disabled=false;updateUI()}
});

downloadAllBtn.addEventListener("click",async()=>{
  if(!results.length||typeof JSZip==="undefined"){setStatus("ZIP 模組尚未載入，請稍後再試。");return}
  downloadAllBtn.disabled=true;setStatus("正在建立 ZIP，請稍候。");
  const zip=new JSZip();
  results.forEach(r=>zip.file(makeName(r.file.name),r.blob));
  const blob=await zip.generateAsync({type:"blob"});
  downloadBlob(blob,"商品白底棚拍_V2_全部.zip");
  downloadAllBtn.disabled=false;setStatus("ZIP 已開始下載。");
});

updateUI();
