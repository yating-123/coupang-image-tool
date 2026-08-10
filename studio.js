const $ = id => document.getElementById(id);
const fileInput=$("fileInput"), pickBtn=$("pickBtn"), fileStatus=$("fileStatus");
const processBtn=$("processBtn"), zipBtn=$("zipBtn"), resultsEl=$("results"), statusEl=$("status");
const filesState=[];

let JSZipReady=null;

function fmtBytes(n){if(n<1024)return n+" B";if(n<1048576)return (n/1024).toFixed(0)+" KB";return (n/1048576).toFixed(2)+" MB"}

pickBtn.addEventListener("click",()=>fileInput.click());
fileInput.addEventListener("change",()=>{
  filesState.length=0;
  [...fileInput.files].forEach(f=>filesState.push(f));
  updateFileStatus();
});
function updateFileStatus(){
  if(!filesState.length){
    fileStatus.textContent="尚未選取檔案";
    processBtn.disabled=true;
    return;
  }
  fileStatus.textContent=`已選擇 ${filesState.length} 張圖片`;
  processBtn.disabled=false;
}

["bgThreshold","protect","shadow"].forEach(id=>{
  $(id).addEventListener("input",()=>{
    $(id+"Out").textContent=id==="protect"?$(id).value+" px":$(id).value+(id==="shadow"?"%":"");
  });
});

function loadImage(file){
  return new Promise((resolve,reject)=>{
    const img=new Image(), url=URL.createObjectURL(file);
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("圖片讀取失敗"))};
    img.src=url;
  });
}

/*
  V4 核心：
  1. 不用 AI 重繪。
  2. 從四周邊界做背景 flood-fill。
  3. 背景顏色以四角/邊緣採樣建立，避免把商品內部白色區域直接判成背景。
  4. 以邊緣保護帶保留商品外框與細線。
*/
function removeConnectedBackground(ctx,w,h,threshold,protectPx){
  const src=ctx.getImageData(0,0,w,h), d=src.data;
  const n=w*h, bg=new Uint8Array(n), seen=new Uint8Array(n);
  const samples=[];
  const step=Math.max(1,Math.floor(Math.min(w,h)/80));
  for(let x=0;x<w;x+=step){samples.push(getRGB(d,(0*w+x)*4));samples.push(getRGB(d,((h-1)*w+x)*4))}
  for(let y=0;y<h;y+=step){samples.push(getRGB(d,(y*w)*4));samples.push(getRGB(d,(y*w+w-1)*4))}
  const ref=medianRGB(samples);
  const q=new Int32Array(n); let head=0,tail=0;
  const push=(idx)=>{if(!seen[idx]){seen[idx]=1;q[tail++]=idx}};
  for(let x=0;x<w;x++){push(x);push((h-1)*w+x)}
  for(let y=0;y<h;y++){push(y*w);push(y*w+w-1)}
  const dirs=[1,-1,w,-w];
  while(head<tail){
    const idx=q[head++], x=idx%w,y=(idx/w)|0;
    const c=getRGB(d,idx*4);
    if(colorDist(c,ref)<=threshold){
      bg[idx]=1;
      for(const dd of dirs){
        const ni=idx+dd;
        if(ni<0||ni>=n)continue;
        const nx=ni%w;
        if((dd===1||dd===-1)&&Math.abs(nx-x)!==1)continue;
        if(!seen[ni])push(ni);
      }
    }
  }

  // Edge protection: any pixel near a transition between background and non-background is protected.
  const protect=Math.max(1,protectPx|0);
  const protectedMask=new Uint8Array(n);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;
    if(!bg[i])continue;
    let near=false;
    for(let dy=-protect;dy<=protect&&!near;dy++)for(let dx=-protect;dx<=protect;dx++){
      if(Math.abs(dx)+Math.abs(dy)>protect)continue;
      const nx=x+dx,ny=y+dy;
      if(nx<0||nx>=w||ny<0||ny>=h)continue;
      if(!bg[ny*w+nx]){near=true;break}
    }
    if(near)protectedMask[i]=1;
  }

  const out=ctx.createImageData(w,h);
  const od=out.data;
  for(let i=0;i<n;i++){
    const si=i*4;
    od[si]=255;od[si+1]=255;od[si+2]=255;
    // Only connected border background becomes white.
    // Protected transition pixels retain their original color.
    if(!bg[i] || protectedMask[i]){
      od[si]=d[si];od[si+1]=d[si+1];od[si+2]=d[si+2];od[si+3]=d[si+3];
    }else{
      od[si+3]=255;
    }
  }
  ctx.putImageData(out,0,0);
}

function getRGB(d,i){return [d[i],d[i+1],d[i+2]]}
function medianRGB(arr){
  const a=[...arr]; const m=k=>{const v=a.map(x=>x[k]).sort((p,q)=>p-q);return v[Math.floor(v.length/2)]};
  return [m(0),m(1),m(2)];
}
function colorDist(a,b){return Math.sqrt((a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2)}

function makeCanvas(img){
  const sizeSel=$("size").value;
  const maxSide=sizeSel==="original"?Math.max(img.naturalWidth,img.naturalHeight):+sizeSel;
  const scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
  const iw=Math.max(1,Math.round(img.naturalWidth*scale)), ih=Math.max(1,Math.round(img.naturalHeight*scale));
  const s=Math.max(iw,ih);
  const canvas=document.createElement("canvas");canvas.width=s;canvas.height=s;
  const c=canvas.getContext("2d",{willReadFrequently:true});
  c.fillStyle="#fff";c.fillRect(0,0,s,s);
  const x=(s-iw)/2,y=(s-ih)/2;
  c.drawImage(img,x,y,iw,ih);
  return {canvas,c,x,y,iw,ih,s};
}

function addContactShadow(canvas,boxX,boxY,boxW,boxH,opacity){
  if(!opacity)return;
  const c=canvas.getContext("2d");
  const cx=boxX+boxW/2, cy=boxY+boxH-2;
  const g=c.createRadialGradient(cx,cy,2,cx,cy,Math.max(boxW*.42,20));
  g.addColorStop(0,`rgba(0,0,0,${Math.min(.20,opacity/100*1.6)})`);
  g.addColorStop(.45,`rgba(0,0,0,${Math.min(.07,opacity/100*.55)})`);
  g.addColorStop(1,"rgba(0,0,0,0)");
  c.save();c.fillStyle=g;c.fillRect(cx-Math.max(boxW*.48,30),cy-18,Math.max(boxW*.96,60),45);c.restore();
}

async function processOne(file,index){
  const img=await loadImage(file);
  const {canvas,c,x,y,iw,ih,s}=makeCanvas(img);
  const threshold=+$("bgThreshold").value;
  const protect=+$("protect").value;
  removeConnectedBackground(c,s,s,threshold,protect);
  if($("addShadow").checked)addContactShadow(canvas,x,y,iw,ih,+$("shadow").value);
  const format=$("format").value;
  const mime=format==="png"?"image/png":format==="webp"?"image/webp":"image/jpeg";
  const quality=format==="png"?undefined:(format==="webp"?0.95:0.95);
  const blob=await new Promise(r=>canvas.toBlob(r,mime,quality));
  const ext=format==="png"?"png":format;
  const base=file.name.replace(/\.[^.]+$/,"");
  const outName=`${base}_白底棚拍V4.${ext}`;
  return {file,blob,outName,url:URL.createObjectURL(blob),w:s,h:s};
}

processBtn.addEventListener("click",async()=>{
  if(!filesState.length)return;
  processBtn.disabled=true;zipBtn.disabled=true;resultsEl.innerHTML="";statusEl.textContent="製作中，請稍候";
  const outputs=[];
  try{
    for(let i=0;i<filesState.length;i++){
      statusEl.textContent=`正在處理 ${i+1} / ${filesState.length}`;
      const r=await processOne(filesState[i],i);outputs.push(r);
      renderResult(r);
    }
    window.__outputs=outputs;
    zipBtn.disabled=!outputs.length;
    statusEl.textContent=`完成，共 ${outputs.length} 張`;
  }catch(e){
    statusEl.textContent="處理失敗："+e.message;
  }finally{processBtn.disabled=false}
});

function renderResult(r){
  const div=document.createElement("div");div.className="result";
  div.innerHTML=`<img src="${r.url}" alt=""><div class="resultTitle">${escapeHtml(r.outName)}</div><div class="meta">輸出 ${r.w} × ${r.h} px｜${fmtBytes(r.blob.size)}</div><a class="download" href="${r.url}" download="${encodeURIComponent(r.outName)}">下載</a>`;
  resultsEl.appendChild(div);
}
function escapeHtml(s){return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}

zipBtn.addEventListener("click",async()=>{
  const outputs=window.__outputs||[];if(!outputs.length)return;
  zipBtn.disabled=true;statusEl.textContent="正在建立 ZIP";
  try{
    if(!JSZipReady)JSZipReady=import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm");
    const {default:JSZip}=await JSZipReady;
    const zip=new JSZip();
    outputs.forEach(o=>zip.file(o.outName,o.blob));
    const blob=await zip.generateAsync({type:"blob"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="商品白底棚拍V4_全部圖片.zip";a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),2000);
    statusEl.textContent="ZIP 已準備下載";
  }catch(e){statusEl.textContent="ZIP 建立失敗："+e.message}
  finally{zipBtn.disabled=false}
});

$("clearBtn").addEventListener("click",()=>{
  filesState.length=0;fileInput.value="";resultsEl.innerHTML="";window.__outputs=[];
  fileStatus.textContent="尚未選取檔案";statusEl.textContent="";processBtn.disabled=true;zipBtn.disabled=true;
});
