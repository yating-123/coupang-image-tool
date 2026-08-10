const $=id=>document.getElementById(id);
const fileInput=$("fileInput"),dropzone=$("dropzone"),fileStatus=$("fileStatus"),processBtn=$("processBtn"),zipBtn=$("zipBtn"),results=$("results"),clearBtn=$("clearBtn"),errorBox=$("error"),progressWrap=$("progressWrap"),progressBar=$("progressBar"),progressPct=$("progressPct"),progressText=$("progressText");
let files=[],outputs=[];
fileInput.addEventListener("change",()=>setFiles([...fileInput.files]));
["dragover","dragenter"].forEach(e=>dropzone.addEventListener(e,x=>{x.preventDefault();dropzone.style.borderColor="#4c7fe8"}));
["dragleave","drop"].forEach(e=>dropzone.addEventListener(e,x=>{x.preventDefault();dropzone.style.borderColor="#cbd0d8"}));
dropzone.addEventListener("drop",e=>setFiles([...e.dataTransfer.files]));
function setFiles(a){files=a.filter(f=>/^image\/(jpeg|png|webp)$/.test(f.type));fileStatus.textContent=files.length?`已選取 ${files.length} 張圖片`:"未選取可處理的圖片";fileStatus.classList.toggle("ok",!!files.length);processBtn.disabled=!files.length;errorBox.textContent=files.length<a.length?"部分檔案格式不支援，已略過。":""}
$("strength").addEventListener("input",e=>$("strengthValue").textContent=["","保守","標準","積極"][e.target.value]);
$("protect").addEventListener("input",e=>$("protectValue").textContent=e.target.value+" px");
clearBtn.onclick=()=>{outputs.forEach(o=>o.url&&URL.revokeObjectURL(o.url));outputs=[];results.innerHTML='<div class="empty">尚無處理結果</div>';zipBtn.disabled=true};

function loadImage(f){return new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(new Error("圖片讀取失敗"));im.src=URL.createObjectURL(f)})}
function dist(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])}
function lum(r,g,b){return .2126*r+.7152*g+.0722*b}
function borderStats(d,w,h){let vals=[],sum=[0,0,0],n=0,step=Math.max(1,Math.floor(Math.min(w,h)/100));for(let x=0;x<w;x+=step){for(const y of [0,h-1]){let i=(y*w+x)*4;sum[0]+=d[i];sum[1]+=d[i+1];sum[2]+=d[i+2];n++}}for(let y=0;y<h;y+=step){for(const x of [0,w-1]){let i=(y*w+x)*4;sum[0]+=d[i];sum[1]+=d[i+1];sum[2]+=d[i+2];n++}}return {rgb:sum.map(v=>v/n),L:lum(sum[0]/n,sum[1]/n,sum[2]/n)}}

function makeMask(src,strength,protectPx){
  const lim=1000,sc=Math.min(1,lim/Math.max(src.width,src.height)),w=Math.max(2,Math.round(src.width*sc)),h=Math.max(2,Math.round(src.height*sc));
  const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(src,0,0,w,h);const ctx=c.getContext("2d",{willReadFrequently:true}),im=ctx.getImageData(0,0,w,h),d=im.data,N=w*h;
  const bs=borderStats(d,w,h), base=[12,18,25][strength], edgeCut=[18,24,32][strength];
  const bg=new Uint8Array(N),qx=new Int32Array(N),qy=new Int32Array(N);let head=0,tail=0;
  function edgeAt(x,y){if(x<=0||y<=0||x>=w-1||y>=h-1)return 0;const k=(y*w+x)*4;const L=lum(d[k],d[k+1],d[k+2]);const Lx=lum(d[k+4],d[k+5],d[k+6]);const Ly=lum(d[k+w*4],d[k+w*4+1],d[k+w*4+2]);return Math.abs(L-Lx)+Math.abs(L-Ly)}
  function push(x,y){if(x<0||x>=w||y<0||y>=h)return;const k=y*w+x;if(bg[k])return;const i=k*4,p=[d[i],d[i+1],d[i+2]],db=dist(p,bs.rgb),dl=Math.abs(lum(...p)-bs.L);if(db>base*2.2||dl>base*2.5)return;bg[k]=1;qx[tail]=x;qy[tail++]=y}
  for(let x=0;x<w;x+=2){push(x,0);push(x,h-1)}for(let y=0;y<h;y+=2){push(0,y);push(w-1,y)}
  while(head<tail){const x=qx[head],y=qy[head++],k=y*w+x,i=k*4,cur=[d[i],d[i+1],d[i+2]];for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1],[x+1,y+1],[x-1,y-1],[x+1,y-1],[x-1,y+1]]){if(nx<0||nx>=w||ny<0||ny>=h)continue;const nk=ny*w+nx;if(bg[nk])continue;const ni=nk*4,np=[d[ni],d[ni+1],d[ni+2]],db=dist(np,bs.rgb),dl=Math.abs(lum(...np)-bs.L),e=edgeAt(nx,ny);
      // 關鍵修正：背景不能穿越明顯商品外框，也不能穿進明顯比背景更亮的白色盒面
      if(e>edgeCut)continue;
      if(db<=base*2.0 && dl<=base*2.0)push(nx,ny);
  }}
  const fg=new Uint8Array(N);for(let i=0;i<N;i++)fg[i]=bg[i]?0:1;
  // 輪廓保護：只擴張商品，不再向商品內部侵蝕
  const r=Math.max(1,Math.round(protectPx*sc));let cur=fg;
  for(let pass=0;pass<2;pass++){const out=cur.slice();for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++)if(!cur[y*w+x]){let hit=0;for(let yy=-r;yy<=r&&!hit;yy++)for(let xx=-r;xx<=r;xx++){const X=x+xx,Y=y+yy;if(X>=0&&X<w&&Y>=0&&Y<h&&cur[Y*w+X]){hit=1;break}}if(hit)out[y*w+x]=1}cur=out}
  return {fg:cur,w,h};
}

async function processOne(file){
  const im=await loadImage(file),maxSide=1800,scale=Math.min(1,maxSide/Math.max(im.naturalWidth,im.naturalHeight)),sw=Math.round(im.naturalWidth*scale),sh=Math.round(im.naturalHeight*scale);
  const src=document.createElement("canvas");src.width=sw;src.height=sh;src.getContext("2d").drawImage(im,0,0,sw,sh);
  const m=makeMask(src,+$("strength").value,+$("protect").value),mask=document.createElement("canvas");mask.width=sw;mask.height=sh;const mc=mask.getContext("2d"),mi=mc.createImageData(sw,sh);
  for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){const mx=Math.min(m.w-1,Math.floor(x*m.w/sw)),my=Math.min(m.h-1,Math.floor(y*m.h/sh)),a=m.fg[my*m.w+mx]?255:0,i=(y*sw+x)*4;mi.data[i]=255;mi.data[i+1]=255;mi.data[i+2]=255;mi.data[i+3]=a}mc.putImageData(mi,0,0);
  let minX=sw,minY=sh,maxX=0,maxY=0,found=false;for(let y=0;y<sh;y+=2)for(let x=0;x<sw;x+=2)if(mi.data[(y*sw+x)*4+3]>0){found=true;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)}
  if(!found)throw new Error("無法辨識商品輪廓");
  const pad=.025;minX=Math.max(0,Math.floor(minX-(maxX-minX)*pad));maxX=Math.min(sw-1,Math.ceil(maxX+(maxX-minX)*pad));minY=Math.max(0,Math.floor(minY-(maxY-minY)*pad));maxY=Math.min(sh-1,Math.ceil(maxY+(maxY-minY)*pad));
  const cw=maxX-minX+1,ch=maxY-minY+1,S=+$("size").value,out=document.createElement("canvas");out.width=S;out.height=S;const c=out.getContext("2d");c.fillStyle="#fff";c.fillRect(0,0,S,S);
  const fit=Math.min(S*.84/cw,S*.84/ch),dw=cw*fit,dh=ch*fit,dx=(S-dw)/2,dy=(S-dh)/2;
  if($("shadow").checked){c.save();c.globalAlpha=.12;c.filter="blur(15px)";c.fillStyle="#000";c.beginPath();c.ellipse(S/2,dy+dh*.97,dw*.25,Math.max(7,dh*.018),0,0,Math.PI*2);c.fill();c.restore()}
  const tmp=document.createElement("canvas");tmp.width=cw;tmp.height=ch;const tc=tmp.getContext("2d");tc.drawImage(src,minX,minY,cw,ch,0,0,cw,ch);
  const md=document.createElement("canvas");md.width=cw;md.height=ch;const tmc=md.getContext("2d");tmc.drawImage(mask,minX,minY,cw,ch,0,0,cw,ch);const a=tmc.getImageData(0,0,cw,ch).data,p=tc.getImageData(0,0,cw,ch);for(let i=0;i<a.length;i+=4)p.data[i+3]=a[i+3];tc.putImageData(p,0,0);c.drawImage(tmp,dx,dy,dw,dh);
  const type=$("format").value,blob=await new Promise((res,rej)=>out.toBlob(b=>b?res(b):rej(new Error("輸出失敗")),type,type==="image/png"?undefined:.95)),ext=type==="image/png"?"png":type==="image/webp"?"webp":"jpg",name=file.name.replace(/\.[^.]+$/,"")+"_白底棚拍V8."+ext;
  return {name,blob,url:URL.createObjectURL(blob),w:S,h:S}
}
processBtn.onclick=async()=>{outputs=[];results.innerHTML="";progressWrap.classList.remove("hidden");processBtn.disabled=true;for(let i=0;i<files.length;i++){progressText.textContent=`正在處理 ${i+1}/${files.length}`;try{const o=await processOne(files[i]);outputs.push(o);render(o)}catch(e){render({name:files[i].name,status:"處理失敗："+e.message,error:true})}const p=Math.round((i+1)/files.length*100);progressBar.style.width=p+"%";progressPct.textContent=p+"%";await new Promise(r=>setTimeout(r,20))}progressText.textContent="完成";processBtn.disabled=false;zipBtn.disabled=!outputs.length}
function render(o){const d=document.createElement("div");d.className="result";if(o.error)d.innerHTML=`<div class="result-name">${esc(o.name)}</div><div class="error">${esc(o.status)}</div>`;else d.innerHTML=`<div class="preview-wrap"><img src="${o.url}"></div><div class="result-name">${esc(o.name)}</div><div class="result-meta">輸出 ${o.w} × ${o.h} px · ${(o.blob.size/1024).toFixed(0)} KB</div><span class="status">商品保真處理完成</span><br><a class="download" href="${o.url}" download="${esc(o.name)}">下載</a>`;results.appendChild(d)}
function esc(s){return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
zipBtn.onclick=async()=>{if(!outputs.length)return;const z=await makeZip(outputs),u=URL.createObjectURL(z),a=document.createElement("a");a.href=u;a.download="商品白底棚拍V8_全部圖片.zip";a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
async function makeZip(items){const e=new TextEncoder(),parts=[],cent=[];let off=0;for(const it of items){const n=e.encode(it.name),d=new Uint8Array(await it.blob.arrayBuffer()),crc=crc32(d),l=new Uint8Array(30+n.length+d.length),v=new DataView(l.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint32(18,d.length,true);v.setUint32(22,d.length,true);v.setUint16(26,n.length,true);l.set(n,30);l.set(d,30+n.length);parts.push(l);const c=new Uint8Array(46+n.length),q=new DataView(c.buffer);q.setUint32(0,0x02014b50,true);q.setUint16(4,20,true);q.setUint16(6,20,true);q.setUint32(16,crc,true);q.setUint32(20,d.length,true);q.setUint32(24,d.length,true);q.setUint16(28,n.length,true);q.setUint32(42,off,true);c.set(n,46);cent.push(c);off+=l.length}const cs=cent.reduce((a,b)=>a+b.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,items.length,true);v.setUint16(10,items.length,true);v.setUint32(12,cs,true);v.setUint32(16,off,true);return new Blob([...parts,...cent,end],{type:"application/zip"})}
function crc32(b){let t=crc32.t;if(!t){t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}crc32.t=t}let c=0xffffffff;for(const x of b)c=t[(c^x)&255]^(c>>>8);return(c^0xffffffff)>>>0}
