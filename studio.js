const $ = (id) => document.getElementById(id);

const fileInput = $("fileInput");
const dropzone = $("dropzone");
const processBtn = $("processBtn");
const downloadAllBtn = $("downloadAllBtn");
const clearBtn = $("clearBtn");
const results = $("results");
const statusEl = $("status");
const resultSummary = $("resultSummary");
const progressWrap = $("progressWrap");
const progressBar = $("progressBar");
const progressText = $("progressText");
const progressPercent = $("progressPercent");

let files = [];
let outputs = [];

function setProgress(percent, text){
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  progressBar.style.width = `${p}%`;
  progressPercent.textContent = `${p}%`;
  progressText.textContent = text;
}

function setStatus(text, type=""){
  statusEl.textContent = text;
  statusEl.className = `status ${type}`;
}

function updateRangeLabels(){
  $("scaleValue").textContent = `${$("scaleInput").value}%`;
  $("shadowValue").textContent = `${$("shadowInput").value}%`;
  $("blurValue").textContent = `${$("blurInput").value} px`;
  $("offsetValue").textContent = `${$("offsetInput").value} px`;
}
["scaleInput","shadowInput","blurInput","offsetInput"].forEach(id => $(id).addEventListener("input", updateRangeLabels));
updateRangeLabels();

function addFiles(list){
  const accepted = [...list].filter(f => /^image\/(jpeg|png|webp)$/i.test(f.type));
  if (!accepted.length) {
    setStatus("請選擇 JPG、PNG 或 WebP 圖片。");
    return;
  }
  files = [...files, ...accepted];
  processBtn.disabled = false;
  resultSummary.textContent = `已選擇 ${files.length} 張圖片`;
  setStatus(`已加入 ${accepted.length} 張圖片。`);
}

fileInput.addEventListener("change", e => addFiles(e.target.files));
dropzone.addEventListener("dragover", e => {e.preventDefault(); dropzone.classList.add("drag")});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag"));
dropzone.addEventListener("drop", e => {
  e.preventDefault();
  dropzone.classList.remove("drag");
  addFiles(e.dataTransfer.files);
});

clearBtn.addEventListener("click", () => {
  files = [];
  outputs.forEach(o => o.url && URL.revokeObjectURL(o.url));
  outputs = [];
  fileInput.value = "";
  results.innerHTML = "";
  processBtn.disabled = true;
  downloadAllBtn.disabled = true;
  resultSummary.textContent = "尚未選擇圖片";
  setStatus("");
});

function loadImage(blob){
  return new Promise((resolve,reject)=>{
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {URL.revokeObjectURL(url); resolve(img)};
    img.onerror = () => {URL.revokeObjectURL(url); reject(new Error("圖片讀取失敗"))};
    img.src = url;
  });
}

function blobFromCanvas(canvas, type, quality){
  return new Promise((resolve,reject)=>{
    canvas.toBlob(b => b ? resolve(b) : reject(new Error("輸出圖片失敗")), type, quality);
  });
}

function fitSize(w,h,minSide){
  const scale = minSide / Math.min(w,h);
  return {w: Math.round(w*scale), h: Math.round(h*scale)};
}

async function makeStudioImage(bgBlob){
  const img = await loadImage(bgBlob);
  const targetMin = Number($("sizeInput").value);
  const {w:outW,h:outH} = fitSize(img.naturalWidth, img.naturalHeight, targetMin);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = $("backgroundInput").value;
  ctx.fillRect(0,0,outW,outH);

  const ratio = Math.min((outW * Number($("scaleInput").value)/100) / img.naturalWidth,
                         (outH * Number($("scaleInput").value)/100) / img.naturalHeight);
  const dw = Math.max(1, Math.round(img.naturalWidth * ratio));
  const dh = Math.max(1, Math.round(img.naturalHeight * ratio));
  const dx = Math.round((outW-dw)/2);
  const dy = Math.round((outH-dh)/2);

  if ($("shadowEnabled").checked && Number($("shadowInput").value) > 0){
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = outW;
    shadowCanvas.height = outH;
    const sctx = shadowCanvas.getContext("2d");
    sctx.filter = `blur(${Number($("blurInput").value)}px)`;
    sctx.globalAlpha = Number($("shadowInput").value)/100;
    sctx.drawImage(img, dx, dy + Number($("offsetInput").value), dw, dh);
    const shadowData = sctx.getImageData(0,0,outW,outH);
    const d = shadowData.data;
    for(let i=0;i<d.length;i+=4){
      const a = d[i+3];
      if(a){
        d[i]=0; d[i+1]=0; d[i+2]=0;
        d[i+3]=Math.round(a*0.55);
      }
    }
    sctx.putImageData(shadowData,0,0);
    ctx.drawImage(shadowCanvas,0,0);
  }

  ctx.drawImage(img, dx, dy, dw, dh);

  const format = $("formatInput").value;
  const mime = format === "png" ? "image/png" : format === "webp" ? "image/webp" : "image/jpeg";
  const quality = format === "png" ? undefined : 0.95;
  const blob = await blobFromCanvas(canvas,mime,quality);
  return {blob,w:outW,h:outH};
}

async function removeBg(blob){
  if(typeof window.removeBackground !== "function"){
    throw new Error("AI 去背模組尚未載入，請重新整理頁面後再試一次。");
  }
  return await window.removeBackground(blob, {
    progress: (key, current, total) => {
      if(total) {
        const pct = Math.round((current/total)*100);
        setProgress(Math.min(25,pct/4), "正在載入 AI 去背模型");
      }
    }
  });
}

function safeBase(name){
  return name.replace(/\.[^.]+$/,"").replace(/[\\/:*?"<>|]+/g,"_");
}

function renderResults(){
  results.innerHTML = "";
  outputs.forEach((o,i)=>{
    const card = document.createElement("article");
    card.className = "result";
    const img = document.createElement("img");
    img.src = o.url;
    img.alt = o.name;
    const info = document.createElement("div");
    info.className = "result-info";
    info.innerHTML = `<div class="result-name">${o.name}</div>
      <div class="result-meta">${o.w} × ${o.h} px · ${Math.round(o.blob.size/1024)} KB</div>
      <span class="badge">白底棚拍完成</span>`;
    const btn = document.createElement("button");
    btn.textContent = "下載";
    btn.addEventListener("click",()=>downloadBlob(o.blob,o.name));
    info.appendChild(btn);
    card.appendChild(Object.assign(document.createElement("div"),{className:"preview"}));
    card.querySelector(".preview").appendChild(img);
    card.appendChild(info);
    results.appendChild(card);
  });
  resultSummary.textContent = `共 ${outputs.length} 張 · 已完成 ${outputs.length} 張`;
  downloadAllBtn.disabled = outputs.length === 0;
}

function downloadBlob(blob,name){
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}

downloadAllBtn.addEventListener("click",async()=>{
  if(!outputs.length || !window.JSZip) return;
  const zip = new JSZip();
  outputs.forEach(o=>zip.file(o.name,o.blob));
  setStatus("正在建立 ZIP，請稍候。");
  const blob = await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}});
  downloadBlob(blob,`商品白底棚拍_${new Date().toISOString().slice(0,10)}.zip`);
  setStatus("ZIP 已建立並開始下載。");
});

processBtn.addEventListener("click",async()=>{
  if(!files.length) return;
  processBtn.disabled = true;
  downloadAllBtn.disabled = true;
  outputs.forEach(o=>o.url && URL.revokeObjectURL(o.url));
  outputs = [];
  renderResults();
  progressWrap.classList.remove("hidden");

  try{
    for(let i=0;i<files.length;i++){
      const file = files[i];
      setProgress((i/files.length)*100, `處理第 ${i+1} / ${files.length} 張：AI 去背中`);
      const cutout = await removeBg(file);
      setProgress(((i+0.55)/files.length)*100, `第 ${i+1} / ${files.length} 張：白底棚拍製作中`);
      const result = await makeStudioImage(cutout);
      const ext = $("formatInput").value === "png" ? "png" : $("formatInput").value === "webp" ? "webp" : "jpg";
      const name = `${safeBase(file.name)}_棚拍.${ext}`;
      outputs.push({blob:result.blob,url:URL.createObjectURL(result.blob),name,w:result.w,h:result.h});
      renderResults();
      setProgress(((i+1)/files.length)*100, `完成 ${i+1} / ${files.length}`);
    }
    setStatus("全部處理完成，可以單張下載或下載全部 ZIP。");
  }catch(err){
    console.error(err);
    setStatus(`處理失敗：${err.message || "未知錯誤"}`);
  }finally{
    processBtn.disabled = files.length === 0;
    progressWrap.classList.add("hidden");
  }
});
