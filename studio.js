let removeBackgroundFn = null;
const $ = id => document.getElementById(id);

const fileInput=$("fileInput"), dropzone=$("dropzone"), processBtn=$("processBtn");
const downloadAllBtn=$("downloadAllBtn"), clearBtn=$("clearBtn"), results=$("results");
const statusEl=$("status"), resultSummary=$("resultSummary");
const aiStatus=$("aiStatus"), aiStatusTitle=$("aiStatusTitle"), aiStatusText=$("aiStatusText");
const modelProgressBar=$("modelProgressBar"), modelProgressText=$("modelProgressText"), modelProgressPercent=$("modelProgressPercent");

let files=[],outputs=[],aiReady=false;

function setModelProgress(p,text){
  p=Math.max(0,Math.min(100,Math.round(p)));
  modelProgressBar.style.width=p+"%";
  modelProgressPercent.textContent=p+"%";
  modelProgressText.textContent=text;
}
function setStatus(t){statusEl.textContent=t}
function setAIState(state,title,text){
  aiStatus.className="ai-status "+state;
  aiStatusTitle.textContent=title;
  aiStatusText.textContent=text;
}
function updateRanges(){
  $("scaleValue").textContent=$("scaleInput").value+"%";
  $("shadowValue").textContent=$("shadowInput").value+"%";
  $("blurValue").textContent=$("blurInput").value+" px";
  $("offsetValue").textContent=$("offsetInput").value+" px";
}
["scaleInput","shadowInput","blurInput","offsetInput"].forEach(id=>$(id).addEventListener("input",updateRanges));
updateRanges();

function addFiles(list){
  const accepted=[...list].filter(f=>/^image\/(jpeg|png|webp)$/i.test(f.type));
  if(!accepted.length){setStatus("請選擇 JPG、PNG 或 WebP 圖片。");return}
  files=[...files,...accepted];
  resultSummary.textContent="已選擇 "+files.length+" 張圖片";
  processBtn.disabled=!aiReady;
  setStatus("已加入 "+accepted.length+" 張圖片。");
}
fileInput.addEventListener("change",e=>addFiles(e.target.files));
dropzone.addEventListener("dragover",e=>{e.preventDefault();dropzone.classList.add("drag")});
dropzone.addEventListener("dragleave",()=>dropzone.classList.remove("drag"));
dropzone.addEventListener("drop",e=>{e.preventDefault();dropzone.classList.remove("drag");addFiles(e.dataTransfer.files)});

function loadImage(blob){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(blob),img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("圖片讀取失敗"))};
    img.src=url;
  });
}
function canvasBlob(canvas,type,quality){
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("輸出圖片失敗")),type,quality));
}
function fitSize(w,h,minSide){
  const s=minSide/Math.min(w,h);
  return {w:Math.round(w*s),h:Math.round(h*s)};
}
async function makeStudioImage(bgBlob){
  const img=await loadImage(bgBlob),target=Number($("sizeInput").value);
  const {w:outW,h:outH}=fitSize(img.naturalWidth,img.naturalHeight,target);
  const canvas=document.createElement("canvas");canvas.width=outW;canvas.height=outH;
  const ctx=canvas.getContext("2d");
  ctx.fillStyle=$("backgroundInput").value;ctx.fillRect(0,0,outW,outH);

  const ratio=Math.min((outW*Number($("scaleInput").value)/100)/img.naturalWidth,
                      (outH*Number($("scaleInput").value)/100)/img.naturalHeight);
  const dw=Math.max(1,Math.round(img.naturalWidth*ratio)),dh=Math.max(1,Math.round(img.naturalHeight*ratio));
  const dx=Math.round((outW-dw)/2),dy=Math.round((outH-dh)/2);

  if($("shadowEnabled").checked && Number($("shadowInput").value)>0){
    const shadow=document.createElement("canvas");shadow.width=outW;shadow.height=outH;
    const sctx=shadow.getContext("2d");
    sctx.filter=`blur(${Number($("blurInput").value)}px)`;
    sctx.globalAlpha=Number($("shadowInput").value)/100;
    sctx.drawImage(img,dx,dy+Number($("offsetInput").value),dw,dh);
    const data=sctx.getImageData(0,0,outW,outH),d=data.data;
    for(let i=0;i<d.length;i+=4){
      const a=d[i+3];
      if(a){d[i]=0;d[i+1]=0;d[i+2]=0;d[i+3]=Math.round(a*.55)}
    }
    sctx.putImageData(data,0,0);ctx.drawImage(shadow,0,0);
  }
  ctx.drawImage(img,dx,dy,dw,dh);

  const f=$("formatInput").value,mime=f==="png"?"image/png":f==="webp"?"image/webp":"image/jpeg";
  const blob=await canvasBlob(canvas,mime,f==="png"?undefined:.95);
  return {blob,w:outW,h:outH};
}
function safeBase(n){return n.replace(/\.[^.]+$/,"").replace(/[\\/:*?"<>|]+/g,"_")}
function downloadBlob(blob,name){
  const a=document.createElement("a"),url=URL.createObjectURL(blob);
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function renderResults(){
  results.innerHTML="";
  outputs.forEach(o=>{
    const card=document.createElement("article");card.className="result";
    const pv=document.createElement("div");pv.className="preview";
    const im=document.createElement("img");im.src=o.url;im.alt=o.name;pv.appendChild(im);
    const info=document.createElement("div");info.className="result-info";
    info.innerHTML=`<div class="result-name">${o.name}</div><div class="result-meta">${o.w} × ${o.h} px · ${Math.round(o.blob.size/1024)} KB</div><span class="badge">白底棚拍完成</span>`;
    const b=document.createElement("button");b.textContent="下載";b.onclick=()=>downloadBlob(o.blob,o.name);info.appendChild(b);
    card.append(pv,info);results.appendChild(card);
  });
  downloadAllBtn.disabled=!outputs.length;
  resultSummary.textContent=outputs.length?`共 ${outputs.length} 張 · 已完成 ${outputs.length} 張`:"尚未選擇圖片";
}
clearBtn.onclick=()=>{
  files=[];outputs.forEach(o=>URL.revokeObjectURL(o.url));outputs=[];fileInput.value="";
  results.innerHTML="";processBtn.disabled=!aiReady;downloadAllBtn.disabled=true;resultSummary.textContent="尚未選擇圖片";setStatus("");
};
downloadAllBtn.onclick=async()=>{
  if(!outputs.length||!window.JSZip)return;
  setStatus("正在建立 ZIP，請稍候。");
  const zip=new JSZip();outputs.forEach(o=>zip.file(o.name,o.blob));
  const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}});
  downloadBlob(blob,"商品白底棚拍_"+new Date().toISOString().slice(0,10)+".zip");
  setStatus("ZIP 已建立並開始下載。");
};

async function initAI(){
  setAIState("loading","正在準備 AI 去背模組","正在確認瀏覽器端 AI 模組，請稍候。");
  setModelProgress(10,"確認 AI 模組");
  try{
    await new Promise(r=>setTimeout(r,250));
    const candidates=[
      window.imglyRemoveBackground,
      window.removeBackground,
      window.backgroundRemoval?.removeBackground,
      window.imgly?.removeBackground
    ];
    removeBackgroundFn=candidates.find(x=>typeof x==="function")||null;
    if(!removeBackgroundFn){
      throw new Error("AI 去背函式未成功載入");
    }
    setModelProgress(100,"AI 模組已就緒");
    setAIState("ready","AI 去背模組已就緒","可以開始上傳商品照片。第一次實際處理時仍可能需要下載模型資料。");
    aiReady=true;processBtn.disabled=files.length===0;
    setStatus("AI 模組已就緒。");
  }catch(e){
    console.error(e);
    setModelProgress(0,"載入失敗");
    setAIState("error","AI 去背模組載入失敗","目前瀏覽器無法載入 AI 模組。請先重新整理；若仍失敗，請改用新版瀏覽器或 Wi-Fi 再試。");
    processBtn.disabled=true;
    setStatus("AI 模組尚未就緒，因此暫時無法開始處理。");
  }
}

async function removeBg(blob){
  if(!removeBackgroundFn)throw new Error("AI 去背模組尚未載入");
  const options={
    progress:(key,current,total)=>{
      if(total){
        const p=Math.round(current/total*100);
        setStatus(`AI 去背處理中：${p}%`);
      }
    }
  };
  return await removeBackgroundFn(blob,options);
}

processBtn.onclick=async()=>{
  if(!files.length||!aiReady)return;
  processBtn.disabled=true;downloadAllBtn.disabled=true;
  outputs.forEach(o=>URL.revokeObjectURL(o.url));outputs=[];renderResults();
  try{
    for(let i=0;i<files.length;i++){
      const file=files[i];
      setStatus(`第 ${i+1}/${files.length} 張：AI 去背中`);
      const cutout=await removeBg(file);
      setStatus(`第 ${i+1}/${files.length} 張：製作白底棚拍`);
      const r=await makeStudioImage(cutout);
      const f=$("formatInput").value,ext=f==="png"?"png":f==="webp"?"webp":"jpg";
      const name=safeBase(file.name)+"_棚拍."+ext;
      outputs.push({blob:r.blob,url:URL.createObjectURL(r.blob),name,w:r.w,h:r.h});
      renderResults();
    }
    setStatus("全部處理完成，可以單張下載或下載全部 ZIP。");
  }catch(e){
    console.error(e);
    setStatus("處理失敗："+(e.message||"未知錯誤"));
  }finally{
    processBtn.disabled=!aiReady||!files.length;
  }
};

window.addEventListener("load",initAI);
