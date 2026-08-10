const $=id=>document.getElementById(id);
const fileInput=$("fileInput"),pickBtn=$("pickBtn"),fileStatus=$("fileStatus");
const processBtn=$("processBtn"),zipBtn=$("zipBtn"),resultsEl=$("results"),statusEl=$("status");
let filesState=[],outputs=[],JSZipPromise=null;

pickBtn.addEventListener("click",()=>fileInput.click());
fileInput.addEventListener("change",()=>{
  filesState=[...fileInput.files];
  fileStatus.textContent=filesState.length?`已選擇 ${filesState.length} 張圖片`:"尚未選取檔案";
  processBtn.disabled=!filesState.length;
});
$("edge").addEventListener("input",e=>{
  $("edgeOut").textContent=["","低","中","高"][+e.target.value];
});
$("margin").addEventListener("input",e=>$("marginOut").textContent=e.target.value+" px");

function loadImage(file){return new Promise((res,rej)=>{
  const img=new Image(),u=URL.createObjectURL(file);
  img.onload=()=>{URL.revokeObjectURL(u);res(img)};img.onerror=()=>{URL.revokeObjectURL(u);rej(new Error("圖片讀取失敗"))};img.src=u;
})}
function rgb(d,i){return[d[i],d[i+1],d[i+2]]}
function dist(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])}
function median(a,k){let v=a.map(x=>x[k]).sort((x,y)=>x-y);return v[Math.floor(v.length/2)]}
function medianRGB(a){return[median(a,0),median(a,1),median(a,2)]}

/*
 V5:
 - 先找「與四周背景相連」的區域，而不是刪除整張圖中相似顏色。
 - 再找背景/商品的轉換帶，建立安全邊界。
 - 商品核心區域永遠保留原像素。
 - 背景只在商品輪廓外側變成純白。
*/
function makeMask(ctx,w,h,level,protect){
  const im=ctx.getImageData(0,0,w,h),d=im.data,n=w*h;
  const step=Math.max(1,Math.floor(Math.min(w,h)/90)), samples=[];
  for(let x=0;x<w;x+=step){samples.push(rgb(d,x*4));samples.push(rgb(d,((h-1)*w+x)*4))}
  for(let y=0;y<h;y+=step){samples.push(rgb(d,(y*w)*4));samples.push(rgb(d,(y*w+w-1)*4))}
  const ref=medianRGB(samples);
  const threshold=level===1?16:level===3?34:25;
  const bg=new Uint8Array(n),seen=new Uint8Array(n),q=new Int32Array(n*0.15+1000);
  let head=0,tail=0;
  const queue=[];
  const push=i=>{if(!seen[i]){seen[i]=1;queue.push(i)}};
  for(let x=0;x<w;x++){push(x);push((h-1)*w+x)}
  for(let y=0;y<h;y++){push(y*w);push(y*w+w-1)}
  const dirs=[1,-1,w,-w];
  while(head<queue.length){
    const i=queue[head++],x=i%w;
    if(dist(rgb(d,i*4),ref)<=threshold){
      bg[i]=1;
      for(const dd of dirs){
        const ni=i+dd;if(ni<0||ni>=n)continue;
        const nx=ni%w;if((dd===1||dd===-1)&&Math.abs(nx-x)!==1)continue;
        if(!seen[ni])push(ni);
      }
    }
  }
  // Transition protection: keep a wider ring around detected object.
  const keep=new Uint8Array(n), r=protect;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;if(!bg[i])continue;
    let near=false;
    outer:for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
      if(Math.abs(dx)+Math.abs(dy)>r)continue;
      const nx=x+dx,ny=y+dy;
      if(nx>=0&&nx<w&&ny>=0&&ny<h&&!bg[ny*w+nx]){near=true;break outer}
    }
    if(near)keep[i]=1;
  }
  return {d,bg,keep,w,h};
}

function findObjectBounds(mask){
  let minX=mask.w,minY=mask.h,maxX=-1,maxY=-1;
  for(let y=0;y<mask.h;y++)for(let x=0;x<mask.w;x++){
    const i=y*mask.w+x;
    if(!mask.bg[i]||mask.keep[i]){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y)}
  }
  if(maxX<0)return{x:0,y:0,w:mask.w,h:mask.h};
  // Trim only obvious outer margin; keep a small safety border.
  const pad=Math.max(4,Math.round(Math.min(mask.w,mask.h)*.006));
  minX=Math.max(0,minX-pad);minY=Math.max(0,minY-pad);maxX=Math.min(mask.w-1,maxX+pad);maxY=Math.min(mask.h-1,maxY+pad);
  return{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};
}

function renderWhite(img){
  const target=$("size").value;
  const src=document.createElement("canvas");
  src.width=img.naturalWidth;src.height=img.naturalHeight;
  const sc=src.getContext("2d",{willReadFrequently:true});sc.drawImage(img,0,0);
  const level=+$("edge").value, protect=+$("margin").value;
  const mask=makeMask(sc,src.width,src.height,level,protect);
  const b=findObjectBounds(mask);

  const outSize=target==="original"?Math.max(b.w,b.h):+target;
  const canvas=document.createElement("canvas");canvas.width=outSize;canvas.height=outSize;
  const c=canvas.getContext("2d");
  c.fillStyle="#fff";c.fillRect(0,0,outSize,outSize);

  const pad=Math.round(outSize*.10);
  const fit=Math.min((outSize-pad*2)/b.w,(outSize-pad*2)/b.h);
  const dw=Math.max(1,Math.round(b.w*fit)),dh=Math.max(1,Math.round(b.h*fit));
  const dx=Math.round((outSize-dw)/2),dy=Math.round((outSize-dh)/2);

  // Build object layer. Background-connected pixels become white; object and transition ring retain source.
  const objectCanvas=document.createElement("canvas");objectCanvas.width=src.width;objectCanvas.height=src.height;
  const oc=objectCanvas.getContext("2d");
  oc.fillStyle="#fff";oc.fillRect(0,0,src.width,src.height);
  const od=oc.createImageData(src.width,src.height);
  for(let i=0;i<mask.w*mask.h;i++){
    const j=i*4;
    if(!mask.bg[i]||mask.keep[i]){
      od.data[j]=mask.d[j];od.data[j+1]=mask.d[j+1];od.data[j+2]=mask.d[j+2];od.data[j+3]=255;
    }else{
      od.data[j]=255;od.data[j+1]=255;od.data[j+2]=255;od.data[j+3]=255;
    }
  }
  oc.putImageData(od,0,0);

  // Soft contact shadow goes behind the object.
  if($("shadow").checked){
    c.save();
    const sx=dx+dw*.5, sy=dy+dh-2;
    const g=c.createRadialGradient(sx,sy,2,sx,sy,Math.max(dw*.42,25));
    g.addColorStop(0,"rgba(0,0,0,.13)");g.addColorStop(.45,"rgba(0,0,0,.045)");g.addColorStop(1,"rgba(0,0,0,0)");
    c.fillStyle=g;c.fillRect(dx+dw*.04,Math.max(0,dy+dh-28),dw*.92,45);c.restore();
  }
  c.drawImage(objectCanvas,b.x,b.y,b.w,b.h,dx,dy,dw,dh);
  return {canvas,w:outSize,h:outSize};
}

async function blobOut(canvas){
  const f=$("format").value,mime=f==="png"?"image/png":f==="webp"?"image/webp":"image/jpeg";
  const quality=f==="png"?undefined:.95;
  return new Promise((res,rej)=>canvas.toBlob(b=>b?res(b):rej(new Error("輸出失敗")),mime,quality));
}
function bytes(n){return n<1048576?(n/1024).toFixed(0)+" KB":(n/1048576).toFixed(2)+" MB"}
function esc(s){return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}

async function processOne(file){
  const img=await loadImage(file),r=renderWhite(img),blob=await blobOut(r.canvas);
  const ext=$("format").value,base=file.name.replace(/\.[^.]+$/,"");
  return {name:`${base}_白底棚拍V5.${ext}`,blob,url:URL.createObjectURL(blob),w:r.w,h:r.h};
}
function addResult(r){
  const div=document.createElement("div");div.className="result";
  div.innerHTML=`<img src="${r.url}" alt=""><div class="resultTitle">${esc(r.name)}</div><div class="meta">輸出 ${r.w} × ${r.h} px｜${bytes(r.blob.size)}</div><a class="download" href="${r.url}" download="${encodeURIComponent(r.name)}">下載</a>`;
  resultsEl.appendChild(div);
}
processBtn.addEventListener("click",async()=>{
  if(!filesState.length)return;
  processBtn.disabled=true;zipBtn.disabled=true;outputs=[];resultsEl.innerHTML="";
  try{
    for(let i=0;i<filesState.length;i++){statusEl.textContent=`正在處理 ${i+1} / ${filesState.length}`;outputs.push(await processOne(filesState[i]));addResult(outputs.at(-1))}
    zipBtn.disabled=false;statusEl.textContent=`完成，共 ${outputs.length} 張`;
  }catch(e){statusEl.textContent="處理失敗："+e.message}
  finally{processBtn.disabled=false}
});
zipBtn.addEventListener("click",async()=>{
  if(!outputs.length)return;zipBtn.disabled=true;statusEl.textContent="正在建立 ZIP";
  try{
    if(!JSZipPromise)JSZipPromise=import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm");
    const {default:JSZip}=await JSZipPromise,zip=new JSZip();
    outputs.forEach(o=>zip.file(o.name,o.blob));
    const b=await zip.generateAsync({type:"blob"}),a=document.createElement("a");
    a.href=URL.createObjectURL(b);a.download="商品白底棚拍V5_全部圖片.zip";a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),2500);statusEl.textContent="ZIP 已準備下載";
  }catch(e){statusEl.textContent="ZIP 建立失敗："+e.message}
  finally{zipBtn.disabled=false}
});
$("clearBtn").addEventListener("click",()=>{
  filesState=[];outputs=[];fileInput.value="";resultsEl.innerHTML="";
  fileStatus.textContent="尚未選取檔案";statusEl.textContent="";processBtn.disabled=true;zipBtn.disabled=true;
});
