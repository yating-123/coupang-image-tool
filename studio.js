const $=id=>document.getElementById(id);
const fileInput=$("fileInput"),dropzone=$("dropzone"),fileStatus=$("fileStatus"),processBtn=$("processBtn"),zipBtn=$("zipBtn"),results=$("results"),clearBtn=$("clearBtn"),errorBox=$("error"),progressWrap=$("progressWrap"),progressBar=$("progressBar"),progressPct=$("progressPct"),progressText=$("progressText");
let files=[], outputs=[];

fileInput.addEventListener("change",()=>setFiles([...fileInput.files]));
["dragover","dragenter"].forEach(e=>dropzone.addEventListener(e,x=>{x.preventDefault();dropzone.style.borderColor="#4c7fe8"}));
["dragleave","drop"].forEach(e=>dropzone.addEventListener(e,x=>{x.preventDefault();dropzone.style.borderColor="#cbd0d8"}));
dropzone.addEventListener("drop",e=>setFiles([...e.dataTransfer.files]));
function setFiles(arr){files=arr.filter(f=>/^image\/(jpeg|png|webp)$/.test(f.type)); fileStatus.textContent=files.length?`已選取 ${files.length} 張圖片`:"未選取可處理的圖片";fileStatus.classList.toggle("ok",!!files.length);processBtn.disabled=!files.length;errorBox.textContent=files.length< arr.length?"部分檔案格式不支援，已略過。":""}
$("conservative").addEventListener("input",e=>{$("conservativeValue").textContent=["","低","中","高"][e.target.value]});
$("margin").addEventListener("input",e=>$("marginValue").textContent=e.target.value+"%");
clearBtn.onclick=()=>{outputs=[];results.innerHTML='<div class="empty">尚無處理結果</div>';zipBtn.disabled=true};

processBtn.onclick=async()=>{if(!files.length)return;outputs=[];results.innerHTML="";progressWrap.classList.remove("hidden");errorBox.textContent="";processBtn.disabled=true;
for(let i=0;i<files.length;i++){progressText.textContent=`正在處理 ${i+1}/${files.length}`;try{const out=await processOne(files[i]);outputs.push(out);render(out)}catch(e){render({name:files[i].name,status:"處理失敗："+e.message,error:true})}let p=Math.round((i+1)/files.length*100);progressBar.style.width=p+"%";progressPct.textContent=p+"%";await new Promise(r=>setTimeout(r,30))}
processBtn.disabled=false;zipBtn.disabled=!outputs.some(x=>x.blob);progressText.textContent="完成";};

function loadImage(file){return new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(new Error("圖片讀取失敗"));im.src=URL.createObjectURL(file)})}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function dist(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])}
function avgBorder(data,w,h){const pts=[];const step=Math.max(1,Math.floor(Math.min(w,h)/180));for(let x=0;x<w;x+=step){pts.push(px(data,w,x,0));pts.push(px(data,w,x,h-1))}for(let y=0;y<h;y+=step){pts.push(px(data,w,0,y));pts.push(px(data,w,w-1,y))}pts.sort((a,b)=>lum(a)-lum(b));const pick=pts.slice(Math.floor(pts.length*.15),Math.ceil(pts.length*.85));return pick.reduce((s,p)=>s.map((v,i)=>v+p[i]/pick.length),[0,0,0])}
function px(d,w,x,y){const i=(y*w+x)*4;return[d[i],d[i+1],d[i+2]]}
function lum(p){return .2126*p[0]+.7152*p[1]+.0722*p[2]}

function detectBox(canvas, conservative){
const ctx=canvas.getContext("2d",{willReadFrequently:true}),w=canvas.width,h=canvas.height,data=ctx.getImageData(0,0,w,h).data,bg=avgBorder(data,w,h);
const gray=new Uint8Array(w*h);let sum=0,count=0;
const step=2, thresh=[0,30,38,48][conservative];
for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step){const p=px(data,w,x,y);const d=dist(p,bg);const ld=Math.abs(lum(p)-lum(bg));const fg=(d>thresh && (ld>10 || lum(p)>lum(bg)+6 || lum(p)<lum(bg)-18));if(fg){gray[y*w+x]=1;sum+=x;count++}}
if(!count) return {x:0,y:0,w,h};
let minX=w,maxX=0,minY=h,maxY=0;
const margin=8;
for(let y=margin;y<h-margin;y+=step){let row=0;for(let x=margin;x<w-margin;x+=step)if(gray[y*w+x])row++;if(row>w*.08){minY=Math.min(minY,y);maxY=Math.max(maxY,y)}}
for(let x=margin;x<w-margin;x+=step){let col=0;for(let y=margin;y<h-margin;y+=step)if(gray[y*w+x])col++;if(col>h*.08){minX=Math.min(minX,x);maxX=Math.max(maxX,x)}}
if(maxX<=minX||maxY<=minY){return {x:Math.round(w*.08),y:Math.round(h*.06),w:Math.round(w*.84),h:Math.round(h*.88)}}
const expand=conservative===3?.035:conservative===2?.025:.015;
minX=Math.floor(minX-(maxX-minX)*expand);maxX=Math.ceil(maxX+(maxX-minX)*expand);
minY=Math.floor(minY-(maxY-minY)*expand);maxY=Math.ceil(maxY+(maxY-minY)*expand);
return {x:clamp(minX,0,w-1),y:clamp(minY,0,h-1),w:clamp(maxX-minX,10,w),h:clamp(maxY-minY,10,h)};
}

async function processOne(file){
const im=await loadImage(file);const maxSide=1800,scale=Math.min(1,maxSide/Math.max(im.naturalWidth,im.naturalHeight));const sw=Math.max(1,Math.round(im.naturalWidth*scale)),sh=Math.max(1,Math.round(im.naturalHeight*scale));
const src=document.createElement("canvas");src.width=sw;src.height=sh;src.getContext("2d").drawImage(im,0,0,sw,sh);
const box=detectBox(src,Number($("conservative").value));const margin=Number($("margin").value)/100;
const safeX=Math.floor(box.x-box.w*margin),safeY=Math.floor(box.y-box.h*margin),safeW=Math.ceil(box.w*(1+2*margin)),safeH=Math.ceil(box.h*(1+2*margin));
const outSize=Number($("size").value),out=document.createElement("canvas");out.width=outSize;out.height=outSize;const c=out.getContext("2d");c.fillStyle="#fff";c.fillRect(0,0,outSize,outSize);
const fit=Math.min((outSize*0.88)/safeW,(outSize*0.88)/safeH);const dw=safeW*fit,dh=safeH*fit,dx=(outSize-dw)/2,dy=(outSize-dh)/2;
if($("shadow").checked){c.save();c.filter="blur(18px)";c.globalAlpha=.16;c.fillStyle="#000";c.beginPath();c.ellipse(outSize/2,dy+dh*.94,dw*.30,Math.max(8,dh*.025),0,0,Math.PI*2);c.fill();c.restore()}
c.drawImage(src,safeX,safeY,safeW,safeH,dx,dy,dw,dh);
const type=$("format").value,quality=type==="image/png"?undefined:.95;
const blob=await new Promise((res,rej)=>out.toBlob(b=>b?res(b):rej(new Error("輸出失敗")),type,quality));
const ext=type==="image/png"?"png":type==="image/webp"?"webp":"jpg";
const base=file.name.replace(/\.[^.]+$/,"");return{name:base+"_白底棚拍V6."+ext,blob,url:URL.createObjectURL(blob),w:outSize,h:outSize,box};
}

function render(o){const div=document.createElement("div");div.className="result";if(o.error){div.innerHTML=`<div class="result-name">${esc(o.name)}</div><div class="error">${esc(o.status)}</div>`}else{div.innerHTML=`<div class="preview-wrap"><img src="${o.url}" alt=""></div><div class="result-name">${esc(o.name)}</div><div class="result-meta">輸出 ${o.w} × ${o.h} px · ${(o.blob.size/1024).toFixed(0)} KB</div><span class="status">商品保真處理完成</span><br><a class="download" href="${o.url}" download="${escAttr(o.name)}">下載</a>`}results.appendChild(div)}
function esc(s){return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function escAttr(s){return esc(s).replace(/`/g,"&#96;")}

zipBtn.onclick=async()=>{if(!outputs.length)return;const zip=await makeZip(outputs.filter(x=>x.blob));const url=URL.createObjectURL(zip);const a=document.createElement("a");a.href=url;a.download="商品白底棚拍V6_全部圖片.zip";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function makeZip(items){
const enc=new TextEncoder(),parts=[],central=[];let offset=0;
for(const item of items){const name=enc.encode(item.name),data=new Uint8Array(await item.blob.arrayBuffer()),crc=crc32(data),local=new Uint8Array(30+name.length+data.length),dv=new DataView(local.buffer);dv.setUint32(0,0x04034b50,true);dv.setUint16(4,20,true);dv.setUint16(6,0,true);dv.setUint16(8,0,true);dv.setUint16(10,0,true);dv.setUint16(12,0,true);dv.setUint32(14,crc,true);dv.setUint32(18,data.length,true);dv.setUint32(22,data.length,true);dv.setUint16(26,name.length,true);dv.setUint16(28,0,true);local.set(name,30);local.set(data,30+name.length);parts.push(local);
const c=new Uint8Array(46+name.length);const cd=new DataView(c.buffer);cd.setUint32(0,0x02014b50,true);cd.setUint16(4,20,true);cd.setUint16(6,20,true);cd.setUint16(8,0,true);cd.setUint16(10,0,true);cd.setUint16(12,0,true);cd.setUint16(14,0,true);cd.setUint32(16,crc,true);cd.setUint32(20,data.length,true);cd.setUint32(24,data.length,true);cd.setUint16(28,name.length,true);cd.setUint16(30,0,true);cd.setUint16(32,0,true);cd.setUint16(34,0,true);cd.setUint16(36,0,true);cd.setUint32(38,0,true);cd.setUint32(42,offset,true);c.set(name,46);central.push(c);offset+=local.length}
const cenSize=central.reduce((s,a)=>s+a.length,0),end=new Uint8Array(22),ed=new DataView(end.buffer);ed.setUint32(0,0x06054b50,true);ed.setUint16(8,items.length,true);ed.setUint16(10,items.length,true);ed.setUint32(12,cenSize,true);ed.setUint32(16,offset,true);return new Blob([...parts,...central,end],{type:"application/zip"})}
function crc32(bytes){let table=crc32.table;if(!table){table=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0}crc32.table=table}let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0}
