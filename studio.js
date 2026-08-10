const $=id=>document.getElementById(id);
const fileInput=$("fileInput"),dropzone=$("dropzone"),fileStatus=$("fileStatus"),processBtn=$("processBtn"),zipBtn=$("zipBtn"),results=$("results"),clearBtn=$("clearBtn"),errorBox=$("error"),progressWrap=$("progressWrap"),progressBar=$("progressBar"),progressPct=$("progressPct"),progressText=$("progressText");
let files=[],outputs=[];

fileInput.addEventListener("change",()=>setFiles([...fileInput.files]));
["dragover","dragenter"].forEach(e=>dropzone.addEventListener(e,x=>{x.preventDefault();dropzone.style.borderColor="#4c7fe8"}));
["dragleave","drop"].forEach(e=>dropzone.addEventListener(e,x=>{x.preventDefault();dropzone.style.borderColor="#cbd0d8"}));
dropzone.addEventListener("drop",e=>setFiles([...e.dataTransfer.files]));
function setFiles(arr){files=arr.filter(f=>/^image\/(jpeg|png|webp)$/.test(f.type));fileStatus.textContent=files.length?`已選取 ${files.length} 張圖片`:"未選取可處理的圖片";fileStatus.classList.toggle("ok",!!files.length);processBtn.disabled=!files.length;errorBox.textContent=files.length<arr.length?"部分檔案格式不支援，已略過。":""}
$("tolerance").addEventListener("input",e=>{$("tolValue").textContent=["","保守","標準","積極"][e.target.value]});
$("protect").addEventListener("input",e=>$("protectValue").textContent=e.target.value+" px");
clearBtn.onclick=()=>{outputs.forEach(x=>x.url&&URL.revokeObjectURL(x.url));outputs=[];results.innerHTML='<div class="empty">尚無處理結果</div>';zipBtn.disabled=true};

processBtn.onclick=async()=>{if(!files.length)return;outputs=[];results.innerHTML="";progressWrap.classList.remove("hidden");errorBox.textContent="";processBtn.disabled=true;
for(let i=0;i<files.length;i++){progressText.textContent=`正在處理 ${i+1}/${files.length}`;try{const out=await processOne(files[i]);outputs.push(out);render(out)}catch(e){render({name:files[i].name,status:"處理失敗："+e.message,error:true})}const p=Math.round((i+1)/files.length*100);progressBar.style.width=p+"%";progressPct.textContent=p+"%";await new Promise(r=>setTimeout(r,20))}
processBtn.disabled=false;zipBtn.disabled=!outputs.some(x=>x.blob);progressText.textContent="完成";};

function loadImage(file){return new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(new Error("圖片讀取失敗"));im.src=URL.createObjectURL(file)})}
function rgbDist(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])}
function luminance(r,g,b){return .2126*r+.7152*g+.0722*b}
function sampleBorder(data,w,h){let s=[0,0,0],n=0;const step=Math.max(1,Math.floor(Math.min(w,h)/120));for(let x=0;x<w;x+=step){for(const y of [0,h-1]){const i=(y*w+x)*4;s[0]+=data[i];s[1]+=data[i+1];s[2]+=data[i+2];n++}}for(let y=0;y<h;y+=step){for(const x of [0,w-1]){const i=(y*w+x)*4;s[0]+=data[i];s[1]+=data[i+1];s[2]+=data[i+2];n++}}return s.map(v=>v/n)}

function buildMask(src, mode, protectPx){
  const max=900,scale=Math.min(1,max/Math.max(src.width,src.height)),w=Math.max(2,Math.round(src.width*scale)),h=Math.max(2,Math.round(src.height*scale));
  const small=document.createElement("canvas");small.width=w;small.height=h;small.getContext("2d").drawImage(src,0,0,w,h);
  const ctx=small.getContext("2d",{willReadFrequently:true}),d=ctx.getImageData(0,0,w,h).data;
  const bg=sampleBorder(d,w,h), base=[18,30,44][mode], N=w*h, bgm=new Uint8Array(N), qx=new Int32Array(N), qy=new Int32Array(N);let head=0,tail=0;
  const seeds=[];
  for(let x=0;x<w;x+=2){seeds.push([x,0]);seeds.push([x,h-1])}
  for(let y=0;y<h;y+=2){seeds.push([0,y]);seeds.push([w-1,y])}
  const push=(x,y)=>{if(x<0||x>=w||y<0||y>=h)return;const k=y*w+x;if(bgm[k])return;const i=k*4,p=[d[i],d[i+1],d[i+2]],db=rgbDist(p,bg);if(db>base*1.7)return;bgm[k]=1;qx[tail]=x;qy[tail++]=y};
  for(const s of seeds)push(s[0],s[1]);
  while(head<tail){const x=qx[head],y=qy[head++],k=y*w+x,i=k*4,cur=[d[i],d[i+1],d[i+2]];for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){if(nx<0||nx>=w||ny<0||ny>=h)continue;const nk=ny*w+nx;if(bgm[nk])continue;const ni=nk*4,np=[d[ni],d[ni+1],d[ni+2]],dc=rgbDist(np,cur),db=rgbDist(np,bg);if(dc<=base&&db<=base*1.9)push(nx,ny)}}
  // 背景遮罩轉成商品遮罩
  let fg=new Uint8Array(N);for(let i=0;i<N;i++)fg[i]=bgm[i]?0:1;
  // 小幅膨脹，專門保護白色盒子的抗鋸齒邊緣
  const r=Math.max(1,Math.round(protectPx*scale));
  for(let pass=0;pass<2;pass++){const out=fg.slice();for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++)if(!fg[y*w+x]){let hit=0;for(let yy=-r;yy<=r&&!hit;yy++)for(let xx=-r;xx<=r;xx++){const X=x+xx,Y=y+yy;if(X>=0&&X<w&&Y>=0&&Y<h&&fg[Y*w+X]){hit=1;break}}if(hit)out[y*w+x]=1}fg=out}
  return {fg,w,h,scale};
}

async function processOne(file){
  const im=await loadImage(file), maxSide=1800, sc=Math.min(1,maxSide/Math.max(im.naturalWidth,im.naturalHeight)),sw=Math.max(2,Math.round(im.naturalWidth*sc)),sh=Math.max(2,Math.round(im.naturalHeight*sc));
  const src=document.createElement("canvas");src.width=sw;src.height=sh;src.getContext("2d").drawImage(im,0,0,sw,sh);
  const mask=buildMask(src,Number($("tolerance").value),Number($("protect").value));
  // 將低解析度 mask 放大到來源尺寸
  const maskCanvas=document.createElement("canvas");maskCanvas.width=sw;maskCanvas.height=sh;const mc=maskCanvas.getContext("2d"),md=mc.createImageData(sw,sh),arr=md.data;
  for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){const mx=Math.min(mask.w-1,Math.floor(x*mask.w/sw)),my=Math.min(mask.h-1,Math.floor(y*mask.h/sh)),on=mask.fg[my*mask.w+mx];const a=on?255:0;const i=(y*sw+x)*4;arr[i]=255;arr[i+1]=255;arr[i+2]=255;arr[i+3]=a}mc.putImageData(md,0,0);
  // 取得商品遮罩的實際 bounding box
  let minX=sw,minY=sh,maxX=0,maxY=0,found=false;for(let y=0;y<sh;y+=2)for(let x=0;x<sw;x+=2)if(arr[(y*sw+x)*4+3]>0){found=true;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)}
  if(!found)throw new Error("無法辨識商品輪廓，請換一張背景較單純的照片");
  const pad=.025;minX=Math.max(0,Math.floor(minX-(maxX-minX)*pad));maxX=Math.min(sw-1,Math.ceil(maxX+(maxX-minX)*pad));minY=Math.max(0,Math.floor(minY-(maxY-minY)*pad));maxY=Math.min(sh-1,Math.ceil(maxY+(maxY-minY)*pad));
  const cropW=maxX-minX+1,cropH=maxY-minY+1,outSize=Number($("size").value),out=document.createElement("canvas");out.width=outSize;out.height=outSize;const c=out.getContext("2d");c.fillStyle="#fff";c.fillRect(0,0,outSize,outSize);
  const fit=Math.min(outSize*.84/cropW,outSize*.84/cropH),dw=cropW*fit,dh=cropH*fit,dx=(outSize-dw)/2,dy=(outSize-dh)/2;
  if($("shadow").checked){c.save();c.globalAlpha=.14;c.filter="blur(18px)";c.fillStyle="#000";c.beginPath();c.ellipse(outSize/2,dy+dh*.955,dw*.28,Math.max(8,dh*.022),0,0,Math.PI*2);c.fill();c.restore()}
  // 商品像素與 mask 一起縮放，完全不改商品內部色彩
  const temp=document.createElement("canvas");temp.width=cropW;temp.height=cropH;const tc=temp.getContext("2d");tc.clearRect(0,0,cropW,cropH);tc.drawImage(src,minX,minY,cropW,cropH,0,0,cropW,cropH);
  const tm=document.createElement("canvas");tm.width=cropW;tm.height=cropH;const tmc=tm.getContext("2d");tmc.drawImage(maskCanvas,minX,minY,cropW,cropH,0,0,cropW,cropH);const td=tmc.getImageData(0,0,cropW,cropH),ta=td.data;const sd=tc.getImageData(0,0,cropW,cropH);for(let i=0;i<ta.length;i+=4)sd.data[i+3]=ta[i+3];tc.putImageData(sd,0,0);
  c.drawImage(temp,dx,dy,dw,dh);
  const type=$("format").value,quality=type==="image/png"?undefined:.95,blob=await new Promise((res,rej)=>out.toBlob(b=>b?res(b):rej(new Error("輸出失敗")),type,quality)),ext=type==="image/png"?"png":type==="image/webp"?"webp":"jpg",base=file.name.replace(/\.[^.]+$/,"");
  return{name:base+"_白底棚拍V7."+ext,blob,url:URL.createObjectURL(blob),w:outSize,h:outSize};
}

function render(o){const div=document.createElement("div");div.className="result";if(o.error){div.innerHTML=`<div class="result-name">${esc(o.name)}</div><div class="error">${esc(o.status)}</div>`}else{div.innerHTML=`<div class="preview-wrap"><img src="${o.url}" alt=""></div><div class="result-name">${esc(o.name)}</div><div class="result-meta">輸出 ${o.w} × ${o.h} px · ${(o.blob.size/1024).toFixed(0)} KB</div><span class="status">商品保真處理完成</span><br><a class="download" href="${o.url}" download="${escAttr(o.name)}">下載</a>`}results.appendChild(div)}
function esc(s){return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function escAttr(s){return esc(s).replace(/`/g,"&#96;")}

zipBtn.onclick=async()=>{if(!outputs.length)return;const zip=await makeZip(outputs.filter(x=>x.blob));const url=URL.createObjectURL(zip),a=document.createElement("a");a.href=url;a.download="商品白底棚拍V7_全部圖片.zip";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function makeZip(items){const enc=new TextEncoder(),parts=[],central=[];let offset=0;for(const item of items){const name=enc.encode(item.name),data=new Uint8Array(await item.blob.arrayBuffer()),crc=crc32(data),local=new Uint8Array(30+name.length+data.length),dv=new DataView(local.buffer);dv.setUint32(0,0x04034b50,true);dv.setUint16(4,20,true);dv.setUint16(6,0,true);dv.setUint16(8,0,true);dv.setUint16(10,0,true);dv.setUint16(12,0,true);dv.setUint16(14,0,true);dv.setUint32(18,data.length,true);dv.setUint32(22,data.length,true);dv.setUint16(26,name.length,true);local.set(name,30);local.set(data,30+name.length);parts.push(local);const c=new Uint8Array(46+name.length),cd=new DataView(c.buffer);cd.setUint32(0,0x02014b50,true);cd.setUint16(4,20,true);cd.setUint16(6,20,true);cd.setUint16(8,0,true);cd.setUint16(10,0,true);cd.setUint16(12,0,true);cd.setUint16(14,0,true);cd.setUint32(16,crc,true);cd.setUint32(20,data.length,true);cd.setUint32(24,data.length,true);cd.setUint16(28,name.length,true);cd.setUint32(42,offset,true);c.set(name,46);central.push(c);offset+=local.length}const cs=central.reduce((s,a)=>s+a.length,0),end=new Uint8Array(22),ed=new DataView(end.buffer);ed.setUint32(0,0x06054b50,true);ed.setUint16(8,items.length,true);ed.setUint16(10,items.length,true);ed.setUint32(12,cs,true);ed.setUint32(16,offset,true);return new Blob([...parts,...central,end],{type:"application/zip"})}
function crc32(bytes){let t=crc32.t;if(!t){t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}crc32.t=t}let c=0xffffffff;for(const b of bytes)c=t[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0}
