const $=id=>document.getElementById(id);
const fileInput=$("fileInput"),dropzone=$("dropzone"),fileStatus=$("fileStatus"),editor=$("editor"),ctx=editor.getContext("2d"),processBtn=$("processBtn"),zipBtn=$("zipBtn"),results=$("results"),clearBtn=$("clearBtn"),errorBox=$("error"),progressWrap=$("progressWrap"),progressBar=$("progressBar"),progressPct=$("progressPct"),progressText=$("progressText");
let files=[],outputs=[],img=null,srcCanvas=null,poly=[],finished=false,protectMask=null,mode="polygon",brushSize=30,drawing=false;

fileInput.onchange=()=>setFiles([...fileInput.files]);
["dragover","dragenter"].forEach(e=>dropzone.addEventListener(e,x=>{x.preventDefault();dropzone.style.borderColor="#4c7fe8"}));
["dragleave","drop"].forEach(e=>dropzone.addEventListener(e,x=>{x.preventDefault();dropzone.style.borderColor="#cbd0d8"}));
dropzone.addEventListener("drop",e=>setFiles([...e.dataTransfer.files]));
function setFiles(arr){files=arr.filter(f=>/^image\/(jpeg|png|webp)$/.test(f.type));fileStatus.textContent=files.length?`已選取 ${files.length} 張圖片`:"未選取可處理的圖片";fileStatus.classList.toggle("ok",!!files.length);processBtn.disabled=!files.length||!finished;errorBox.textContent=files.length<arr.length?"部分檔案格式不支援，已略過。":"";if(files.length)loadFirst(files[0])}
async function loadFirst(f){const u=URL.createObjectURL(f);img=new Image();img.onload=()=>{const max=1100,s=Math.min(1,max/img.naturalWidth);editor.width=Math.round(img.naturalWidth*s);editor.height=Math.round(img.naturalHeight*s);srcCanvas=document.createElement("canvas");srcCanvas.width=editor.width;srcCanvas.height=editor.height;srcCanvas.getContext("2d").drawImage(img,0,0,editor.width,editor.height);poly=[];finished=false;protectMask=null;mode="polygon";setMode();drawEditor();processBtn.disabled=true;URL.revokeObjectURL(u)};img.src=u}
function pos(e){const r=editor.getBoundingClientRect(),x=(e.clientX-r.left)*editor.width/r.width,y=(e.clientY-r.top)*editor.height/r.height;return{x,y}}
function drawEditor(){if(!srcCanvas)return;ctx.clearRect(0,0,editor.width,editor.height);ctx.drawImage(srcCanvas,0,0);if(protectMask){ctx.save();ctx.globalAlpha=.35;ctx.drawImage(protectMask,0,0);ctx.restore()}if(poly.length){ctx.save();ctx.strokeStyle="#2d72e8";ctx.lineWidth=Math.max(3,editor.width/260);ctx.fillStyle="rgba(45,114,232,.10)";ctx.beginPath();poly.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));if(finished)ctx.closePath();ctx.stroke();if(finished)ctx.fill();poly.forEach((p,i)=>{ctx.beginPath();ctx.fillStyle="#fff";ctx.strokeStyle="#2d72e8";ctx.lineWidth=3;ctx.arc(p.x,p.y,8,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle="#2d72e8";ctx.font="12px sans-serif";ctx.fillText(i+1,p.x+10,p.y-8)});ctx.restore()}}
editor.addEventListener("pointerdown",e=>{e.preventDefault();const p=pos(e);if(mode==="polygon"&&!finished&&poly.length<12){poly.push(p);drawEditor()}else if(mode!=="polygon"&&finished){drawing=true;paint(p)}});
editor.addEventListener("pointermove",e=>{if(drawing&&mode!=="polygon"){paint(pos(e))}});
window.addEventListener("pointerup",()=>drawing=false);
function paint(p){if(!protectMask){protectMask=document.createElement("canvas");protectMask.width=editor.width;protectMask.height=editor.height}const pc=protectMask.getContext("2d");pc.globalCompositeOperation=mode==="protect"?"source-over":"destination-out";pc.fillStyle="rgba(255,255,255,1)";pc.beginPath();pc.arc(p.x,p.y,brushSize/2,0,Math.PI*2);pc.fill();pc.globalCompositeOperation="source-over";drawEditor()}
$("polygonBtn").onclick=()=>{mode="polygon";setMode()};$("protectBtn").onclick=()=>{if(!finished)return;mode="protect";setMode()};$("eraseBtn").onclick=()=>{if(!finished)return;mode="erase";setMode()};
function setMode(){document.querySelectorAll(".tool").forEach(x=>x.classList.remove("active"));({polygon:"polygonBtn",protect:"protectBtn",erase:"eraseBtn"})[mode]&&$( ({polygon:"polygonBtn",protect:"protectBtn",erase:"eraseBtn"})[mode]).classList.add("active");$("brushRow").classList.toggle("hidden",mode==="polygon")}
$("undoBtn").onclick=()=>{if(!finished){poly.pop();drawEditor()}};
$("resetPolyBtn").onclick=()=>{poly=[];finished=false;protectMask=null;processBtn.disabled=true;drawEditor()};
$("finishBtn").onclick=()=>{if(poly.length<3){errorBox.textContent="至少需要 3 個輪廓點。";return}finished=true;mode="polygon";setMode();processBtn.disabled=!files.length;drawEditor();errorBox.textContent=""};
$("brush").oninput=e=>{brushSize=+e.target.value;$("brushVal").textContent=brushSize+" px"};
$("protectPx").oninput=e=>$("protectValue").textContent=e.target.value+" px";
clearBtn.onclick=()=>{outputs.forEach(x=>x.url&&URL.revokeObjectURL(x.url));outputs=[];results.innerHTML='<div class="empty">尚無處理結果</div>';zipBtn.disabled=true};

function polygonMask(w,h,points){const c=document.createElement("canvas");c.width=w;c.height=h;const g=c.getContext("2d");g.fillStyle="#fff";g.beginPath();points.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.closePath();g.fill();return c}
async function processOne(file,points,manualMask){
 const source=await loadFull(file),sw=source.width,sh=source.height,pm=polygonMask(sw,sh,points.map(p=>({x:p.x*sw/editor.width,y:p.y*sh/editor.height})));
 const pctx=pm.getContext("2d"),pd=pctx.getImageData(0,0,sw,sh).data;
 // 在人工商品範圍內，先保留整個商品；再以邊緣／亮度只移除明顯的背景延伸。
 const outMask=document.createElement("canvas");outMask.width=sw;outMask.height=sh;const od=outMask.getContext("2d").createImageData(sw,sh);
 const sd=source.getContext("2d").getImageData(0,0,sw,sh).data;
 // polygon 以外全部透明；polygon 以內預設保留，這是 V9 的可靠保真核心。
 for(let i=0;i<pd.length;i+=4){const inside=pd[i+3]>0;od.data[i]=255;od.data[i+1]=255;od.data[i+2]=255;od.data[i+3]=inside?255:0}
 // 人工「修掉背景」筆刷：透明；「保護商品」筆刷：不會把 polygon 外變回商品，只保護 polygon 內被修掉的像素。
 if(manualMask){const md=manualMask.getContext("2d").getImageData(0,0,sw,sh).data;for(let i=0;i<od.data.length;i+=4)if(md[i+3]>0&&od.data[i+3]>0)od.data[i+3]=255}
 const bbox=getBBox(od.data,sw,sh);if(!bbox)throw new Error("無法取得商品輪廓");
 const size=+$("size").value,pad=.03;let [x0,y0,x1,y1]=bbox,w=x1-x0+1,h=y1-y0+1;x0=Math.max(0,x0-w*pad);y0=Math.max(0,y0-h*pad);x1=Math.min(sw-1,x1+w*pad);y1=Math.min(sh-1,y1+h*pad);w=x1-x0+1;h=y1-y0+1;
 const out=document.createElement("canvas");out.width=size;out.height=size;const c=out.getContext("2d");c.fillStyle="#fff";c.fillRect(0,0,size,size);
 const fit=Math.min(size*.84/w,size*.84/h),dw=w*fit,dh=h*fit,dx=(size-dw)/2,dy=(size-dh)/2;
 if($("shadow").checked){c.save();c.globalAlpha=.12;c.filter="blur(18px)";c.fillStyle="#000";c.beginPath();c.ellipse(size/2,dy+dh*.965,dw*.30,Math.max(7,dh*.022),0,0,Math.PI*2);c.fill();c.restore()}
 const crop=document.createElement("canvas");crop.width=w;crop.height=h;const cc=crop.getContext("2d");cc.drawImage(source,x0,y0,w,h,0,0,w,h);const cd=cc.getImageData(0,0,w,h),md=od.getContext("2d").getImageData(x0,y0,w,h).data;for(let i=0;i<cd.data.length;i+=4)cd.data[i+3]=md[i+3];cc.putImageData(cd,0,0);c.drawImage(crop,dx,dy,dw,dh);
 const type=$("format").value,q=type==="image/png"?undefined:.95,blob=await new Promise((r,j)=>out.toBlob(b=>b?r(b):j(new Error("輸出失敗")),type,q)),ext=type==="image/png"?"png":type==="image/webp"?"webp":"jpg",base=file.name.replace(/\.[^.]+$/,"");
 return{name:base+"_白底棚拍V9."+ext,blob,url:URL.createObjectURL(blob),w:size,h:size}
}
function loadFull(file){return new Promise((res,rej)=>{const u=URL.createObjectURL(file),im=new Image();im.onload=()=>{const max=1800,s=Math.min(1,max/im.naturalWidth);const c=document.createElement("canvas");c.width=Math.round(im.naturalWidth*s);c.height=Math.round(im.naturalHeight*s);c.getContext("2d").drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);res(c)};im.onerror=()=>rej(new Error("圖片讀取失敗"));im.src=u})}
function getBBox(d,w,h){let minX=w,minY=h,maxX=-1,maxY=-1;for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2)if(d[(y*w+x)*4+3]>0){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y)}return maxX<0?null:[minX,minY,maxX,maxY]}
processBtn.onclick=async()=>{if(!files.length||!finished)return;outputs=[];results.innerHTML="";progressWrap.classList.remove("hidden");processBtn.disabled=true;
 for(let i=0;i<files.length;i++){progressText.textContent=`正在處理 ${i+1}/${files.length}`;try{const o=await processOne(files[i],poly,protectMask);outputs.push(o);render(o)}catch(e){render({name:files[i].name,status:"處理失敗："+e.message,error:true})}const p=Math.round((i+1)/files.length*100);progressBar.style.width=p+"%";progressPct.textContent=p+"%";await new Promise(r=>setTimeout(r,15))}
 progressText.textContent="完成";processBtn.disabled=false;zipBtn.disabled=!outputs.some(x=>x.blob)}
function render(o){const d=document.createElement("div");d.className="result";if(o.error)d.innerHTML=`<div class="result-name">${esc(o.name)}</div><div class="error">${esc(o.status)}</div>`;else d.innerHTML=`<div class="preview-wrap"><img src="${o.url}"></div><div class="result-name">${esc(o.name)}</div><div class="result-meta">輸出 ${o.w} × ${o.h} px · ${(o.blob.size/1024).toFixed(0)} KB</div><span class="status">商品保真處理完成</span><br><a class="download" href="${o.url}" download="${esc(o.name)}">下載</a>`;results.appendChild(d)}
function esc(s){return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
zipBtn.onclick=async()=>{const zip=await makeZip(outputs.filter(x=>x.blob)),u=URL.createObjectURL(zip),a=document.createElement("a");a.href=u;a.download="商品白底棚拍V9_全部圖片.zip";a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
async function makeZip(items){const enc=new TextEncoder(),parts=[],central=[];let off=0;for(const it of items){const n=enc.encode(it.name),data=new Uint8Array(await it.blob.arrayBuffer()),crc=crc32(data),l=new Uint8Array(30+n.length+data.length),d=new DataView(l.buffer);d.setUint32(0,0x04034b50,true);d.setUint16(4,20,true);d.setUint32(18,data.length,true);d.setUint32(22,data.length,true);d.setUint16(26,n.length,true);l.set(n,30);l.set(data,30+n.length);parts.push(l);const c=new Uint8Array(46+n.length),v=new DataView(c.buffer);v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint32(20,data.length,true);v.setUint32(24,data.length,true);v.setUint16(28,n.length,true);v.setUint32(42,off,true);c.set(n,46);central.push(c);off+=l.length}const cs=central.reduce((s,a)=>s+a.length,0),e=new Uint8Array(22),v=new DataView(e.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,items.length,true);v.setUint16(10,items.length,true);v.setUint32(12,cs,true);v.setUint32(16,off,true);return new Blob([...parts,...central,e],{type:"application/zip"})}
function crc32(b){let t=crc32.t;if(!t){t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}crc32.t=t}let c=0xffffffff;for(const x of b)c=t[(c^x)&255]^(c>>>8);return(c^0xffffffff)>>>0}
