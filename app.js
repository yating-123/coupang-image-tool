const fileInput = document.getElementById("fileInput");
const dropzone = document.getElementById("dropzone");
const checkBtn = document.getElementById("checkBtn");
const adjustBtn = document.getElementById("adjustBtn");
const clearBtn = document.getElementById("clearBtn");
const minSideInput = document.getElementById("minSide");
const maxSideInput = document.getElementById("maxSide");
const maxFileMBInput = document.getElementById("maxFileMB");
const formatSelect = document.getElementById("format");
const qualityInput = document.getElementById("quality");
const fileSummary = document.getElementById("fileSummary");
const resultsCard = document.getElementById("resultsCard");
const results = document.getElementById("results");
const resultSummary = document.getElementById("resultSummary");
const downloadAllBtn = document.getElementById("downloadAllBtn");
const ruleSize = document.getElementById("ruleSize");
const ruleFile = document.getElementById("ruleFile");

let files = [];
let analyses = [];
let outputs = [];

fileInput.addEventListener("change", e => setFiles([...e.target.files]));

["dragenter","dragover"].forEach(evt => {
  dropzone.addEventListener(evt, e => {
    e.preventDefault();
    dropzone.classList.add("active");
  });
});
["dragleave","drop"].forEach(evt => {
  dropzone.addEventListener(evt, e => {
    e.preventDefault();
    dropzone.classList.remove("active");
  });
});
dropzone.addEventListener("drop", e => {
  const imgs = [...e.dataTransfer.files].filter(f => f.type.startsWith("image/"));
  setFiles(imgs);
});

[minSideInput, maxSideInput, maxFileMBInput, formatSelect, qualityInput].forEach(el => {
  el.addEventListener("input", refreshRules);
  el.addEventListener("change", refreshRules);
});
refreshRules();

function getRules(){
  let minSide = Math.max(1, Number(minSideInput.value) || 1000);
  let maxSide = Math.max(1, Number(maxSideInput.value) || 10000);
  let maxFileMB = Math.max(1, Number(maxFileMBInput.value) || 50);
  if (maxSide < minSide) [minSide, maxSide] = [maxSide, minSide];
  return { minSide, maxSide, maxFileMB };
}

function refreshRules(){
  const {minSide,maxSide,maxFileMB} = getRules();
  ruleSize.textContent = `${minSide}～${maxSide} px`;
  ruleFile.textContent = `≤ ${maxFileMB} MB`;
  if (files.length) {
    analyzeAll(false);
  }
}

function setFiles(newFiles){
  files = newFiles;
  analyses = [];
  outputs.forEach(o => o.url && URL.revokeObjectURL(o.url));
  outputs = [];
  results.innerHTML = "";
  resultsCard.hidden = true;
  checkBtn.disabled = files.length === 0;
  adjustBtn.disabled = true;
  if (files.length) {
    fileSummary.hidden = false;
    fileSummary.textContent = `已選擇 ${files.length} 張圖片`;
    analyzeAll(false);
  } else {
    fileSummary.hidden = true;
  }
}

clearBtn.addEventListener("click", () => {
  files = [];
  analyses = [];
  outputs.forEach(o => o.url && URL.revokeObjectURL(o.url));
  outputs = [];
  fileInput.value = "";
  results.innerHTML = "";
  resultsCard.hidden = true;
  fileSummary.hidden = true;
  checkBtn.disabled = true;
  adjustBtn.disabled = true;
});

checkBtn.addEventListener("click", async () => {
  await analyzeAll(true);
});

adjustBtn.addEventListener("click", async () => {
  const {minSide,maxSide} = getRules();
  const candidates = analyses.filter(a => a.dimensionStatus === "needs-adjust" && a.canFit);
  if (!candidates.length) return;

  adjustBtn.disabled = true;
  adjustBtn.textContent = "調整中...";
  outputs = [];
  results.innerHTML = "";
  resultsCard.hidden = false;

  for (const a of candidates) {
    try {
      const result = await adjustImage(a.file, minSide, maxSide);
      outputs.push(result);
    } catch (err) {
      a.error = err.message || "無法處理圖片";
    }
  }

  renderResults();
  adjustBtn.disabled = false;
  adjustBtn.textContent = "自動調整合格圖片";
});

async function analyzeAll(showResults){
  if (!files.length) return;
  const {minSide,maxSide,maxFileMB} = getRules();
  analyses = [];

  for (const file of files) {
    try {
      const img = await loadImage(file);
      const w = img.naturalWidth, h = img.naturalHeight;
      const shortSide = Math.min(w,h), longSide = Math.max(w,h);
      const dimensionOK = shortSide >= minSide && longSide <= maxSide;
      const lowScale = minSide / shortSide;
      const highScale = maxSide / longSide;
      const canFit = lowScale <= highScale;
      let dimensionStatus = "ok";
      let dimensionMessage = "尺寸符合";
      if (!dimensionOK) {
        dimensionStatus = canFit ? "needs-adjust" : "impossible";
        dimensionMessage = canFit ? "尺寸需調整" : "等比例縮放無法同時符合上下限，需裁切";
      }
      const supported = ["image/jpeg","image/png","image/webp"].includes(file.type);
      const fileSizeOK = file.size <= maxFileMB * 1024 * 1024;
      analyses.push({
        file,w,h,shortSide,longSide,dimensionOK,dimensionStatus,dimensionMessage,
        canFit,supported,fileSizeOK,
        fileSizeText: formatBytes(file.size)
      });
      img.src = "";
    } catch (err) {
      analyses.push({file,error:err.message || "圖片讀取失敗",dimensionStatus:"error",supported:false,fileSizeOK:false});
    }
  }

  adjustBtn.disabled = !analyses.some(a =>
    a.dimensionStatus === "needs-adjust" && a.canFit && a.supported && a.fileSizeOK
  );

  if (showResults) {
    outputs = [];
    renderResults();
    resultsCard.hidden = false;
  }
}

function renderResults(){
  results.innerHTML = "";
  const total = analyses.length;
  const okCount = analyses.filter(a => a.dimensionOK && a.supported && a.fileSizeOK).length;
  const needCount = analyses.filter(a => a.dimensionStatus === "needs-adjust" && a.canFit && a.supported && a.fileSizeOK).length;
  const badCount = total - okCount - needCount;
  resultSummary.textContent = `共 ${total} 張｜符合 ${okCount}｜可自動調整 ${needCount}｜需人工處理 ${Math.max(0,badCount)}`;

  const outputMap = new Map(outputs.map(o => [o.originalName, o]));

  for (const a of analyses) {
    const out = outputMap.get(a.file.name);
    addAnalysisRow(a, out);
  }
}

function addAnalysisRow(a, out){
  const row = document.createElement("div");
  row.className = "result";

  let previewUrl = "";
  if (out) {
    previewUrl = out.url;
  } else {
    previewUrl = URL.createObjectURL(a.file);
  }

  const status = getStatus(a, out);
  const outputText = out
    ? `輸出：<strong>${out.width} × ${out.height} px</strong><br>檔案大小：${formatBytes(out.blob.size)}`
    : `原始：${a.w ? `${a.w} × ${a.h} px` : "讀取失敗"}<br>檔案大小：${a.fileSizeText || "-"}`;

  row.innerHTML = `
    <img class="thumb" src="${previewUrl}" alt="">
    <div class="meta">
      <div class="name">${escapeHtml(a.file.name)}</div>
      <div class="dims">${outputText}</div>
      <span class="status ${status.cls}">${status.text}</span>
    </div>
    <div class="row-actions"></div>
  `;

  const actions = row.querySelector(".row-actions");

  if (out) {
    const btn = document.createElement("button");
    btn.className = "small-btn";
    btn.textContent = "下載";
    btn.addEventListener("click", () => downloadBlob(out.blob, out.outputName));
    actions.appendChild(btn);
  } else if (a.dimensionOK && a.supported && a.fileSizeOK) {
    const label = document.createElement("span");
    label.className = "status ok";
    label.textContent = "可直接上傳";
    actions.appendChild(label);
  }

  results.appendChild(row);

  if (!out) {
    setTimeout(() => URL.revokeObjectURL(previewUrl), 5000);
  }
}

function getStatus(a,out){
  if (out) return {cls:"ok",text:"已自動調整"};
  if (a.error) return {cls:"bad",text:"無法讀取"};
  if (!a.supported) return {cls:"bad",text:"格式不支援"};
  if (!a.fileSizeOK) return {cls:"bad",text:"檔案過大"};
  if (a.dimensionStatus === "impossible") return {cls:"bad",text:"需裁切"};
  if (a.dimensionStatus === "needs-adjust") return {cls:"warn",text:"尺寸需調整"};
  return {cls:"ok",text:"符合規範"};
}

function loadImage(file){
  return new Promise((resolve,reject)=>{
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("圖片讀取失敗")); };
    img.src = url;
  });
}

async function adjustImage(file,minSide,maxSide){
  const img = await loadImage(file);
  const originalW = img.naturalWidth, originalH = img.naturalHeight;
  const shortSide = Math.min(originalW,originalH), longSide = Math.max(originalW,originalH);

  const lowScale = minSide / shortSide;
  const highScale = maxSide / longSide;
  if (lowScale > highScale) {
    throw new Error("此圖片無法只靠等比例縮放同時符合上下限");
  }

  let scale = 1;
  if (shortSide < minSide) scale = lowScale;
  if (longSide > maxSide) scale = Math.min(scale, highScale);

  let width = Math.max(1, Math.round(originalW * scale));
  let height = Math.max(1, Math.round(originalH * scale));

  if (Math.min(width,height) < minSide && longSide * (minSide / shortSide) <= maxSide) {
    const correction = minSide / Math.min(width,height);
    width = Math.round(width * correction);
    height = Math.round(height * correction);
  }

  if (Math.max(width,height) > maxSide) {
    const correction = maxSide / Math.max(width,height);
    width = Math.round(width * correction);
    height = Math.round(height * correction);
  }

  const format = formatSelect.value;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d", {alpha: format !== "image/jpeg"});
  if (format === "image/jpeg") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0,0,width,height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img,0,0,width,height);

  const q = Math.min(1,Math.max(.5,Number(qualityInput.value || 95)/100));
  const blob = await new Promise(resolve => canvas.toBlob(resolve,format,q));
  if (!blob) throw new Error("無法產生輸出圖片");

  const ext = format === "image/png" ? "png" : format === "image/webp" ? "webp" : "jpg";
  const base = file.name.replace(/\.[^/.]+$/,"");
  const outputName = `${base}_${width}x${height}.${ext}`;

  return {
    originalName:file.name,originalW,originalH,width,height,blob,
    url:URL.createObjectURL(blob),outputName
  };
}

downloadAllBtn.addEventListener("click", async()=>{
  if (outputs.length) {
    for (const o of outputs) {
      downloadBlob(o.blob,o.outputName);
      await new Promise(r=>setTimeout(r,180));
    }
    return;
  }

  // 如果全部都已符合規範，直接下載原檔案。
  const good = analyses.filter(a=>a.dimensionOK && a.supported && a.fileSizeOK);
  for (const a of good) {
    downloadBlob(a.file,a.file.name);
    await new Promise(r=>setTimeout(r,180));
  }
});

function downloadBlob(blob,filename){
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1200);
}

function formatBytes(bytes){
  if (!Number.isFinite(bytes)) return "-";
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(0)} KB`;
  return `${(bytes/1024/1024).toFixed(2)} MB`;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
