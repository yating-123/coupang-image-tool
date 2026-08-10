const fileInput = document.getElementById("fileInput");
const dropzone = document.getElementById("dropzone");
const processBtn = document.getElementById("processBtn");
const clearBtn = document.getElementById("clearBtn");
const minSideInput = document.getElementById("minSide");
const formatSelect = document.getElementById("format");
const qualityInput = document.getElementById("quality");
const resultsCard = document.getElementById("resultsCard");
const results = document.getElementById("results");
const downloadAllBtn = document.getElementById("downloadAllBtn");

let files = [];
let outputs = [];

fileInput.addEventListener("change", e => setFiles([...e.target.files]));

["dragenter","dragover"].forEach(evt => {
  dropzone.addEventListener(evt, e => {
    e.preventDefault();
    dropzone.style.borderColor = "#222";
  });
});
["dragleave","drop"].forEach(evt => {
  dropzone.addEventListener(evt, e => {
    e.preventDefault();
    dropzone.style.borderColor = "";
  });
});
dropzone.addEventListener("drop", e => {
  const imgs = [...e.dataTransfer.files].filter(f => f.type.startsWith("image/"));
  setFiles(imgs);
});

function setFiles(newFiles){
  files = newFiles;
  processBtn.disabled = files.length === 0;
  resultsCard.hidden = true;
  results.innerHTML = "";
  outputs = [];
}

clearBtn.addEventListener("click", () => {
  files = [];
  outputs = [];
  fileInput.value = "";
  results.innerHTML = "";
  resultsCard.hidden = true;
  processBtn.disabled = true;
});

processBtn.addEventListener("click", async () => {
  if (!files.length) return;
  processBtn.disabled = true;
  processBtn.textContent = "處理中...";

  results.innerHTML = "";
  outputs = [];
  resultsCard.hidden = false;

  for (const file of files) {
    try {
      const result = await upscaleImage(file);
      outputs.push(result);
      addResult(result);
    } catch (err) {
      addError(file.name, err.message || "無法處理圖片");
    }
  }

  processBtn.disabled = false;
  processBtn.textContent = "開始調整";
});

function loadImage(file){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("圖片讀取失敗"));
    };
    img.src = url;
  });
}

async function upscaleImage(file){
  const img = await loadImage(file);
  const originalW = img.naturalWidth;
  const originalH = img.naturalHeight;
  const minSide = Math.max(1, Number(minSideInput.value) || 1000);

  const shortSide = Math.min(originalW, originalH);
  const scale = shortSide < minSide ? minSide / shortSide : 1;

  // Prevent browser integer rounding from leaving the short side below the target.
  let width = Math.max(1, Math.round(originalW * scale));
  let height = Math.max(1, Math.round(originalH * scale));

  if (Math.min(width, height) < minSide) {
    const correction = minSide / Math.min(width, height);
    width = Math.round(width * correction);
    height = Math.round(height * correction);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: formatSelect.value !== "image/jpeg" });

  if (formatSelect.value === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }

  // High-quality browser resampling.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);

  const quality = Math.min(1, Math.max(.5, Number(qualityInput.value || 95) / 100));
  const blob = await new Promise(resolve => canvas.toBlob(resolve, formatSelect.value, quality));
  if (!blob) throw new Error("無法產生輸出圖片");

  const ext = formatSelect.value === "image/png" ? "png" :
              formatSelect.value === "image/webp" ? "webp" : "jpg";
  const base = file.name.replace(/\.[^/.]+$/, "");
  const outputName = `${base}_${width}x${height}.${ext}`;

  return {
    originalName: file.name,
    originalW, originalH,
    width, height,
    blob,
    url: URL.createObjectURL(blob),
    outputName
  };
}

function addResult(r){
  const row = document.createElement("div");
  row.className = "result";
  row.innerHTML = `
    <img class="thumb" src="${r.url}" alt="">
    <div class="meta">
      <div class="name">${escapeHtml(r.outputName)}</div>
      <div class="dims">
        原始：${r.originalW} × ${r.originalH} px<br>
        輸出：<strong>${r.width} × ${r.height} px</strong>
      </div>
    </div>
    <button class="small-btn">下載</button>
  `;
  row.querySelector("button").addEventListener("click", () => downloadBlob(r.blob, r.outputName));
  results.appendChild(row);
}

function addError(name, msg){
  const row = document.createElement("div");
  row.className = "result";
  row.innerHTML = `<div></div><div class="meta"><div class="name">${escapeHtml(name)}</div><div class="dims">處理失敗：${escapeHtml(msg)}</div></div>`;
  results.appendChild(row);
}

downloadAllBtn.addEventListener("click", async () => {
  if (!outputs.length) return;
  // Browser downloads each file separately; no server required.
  for (const r of outputs) {
    downloadBlob(r.blob, r.outputName);
    await new Promise(resolve => setTimeout(resolve, 180));
  }
});

function downloadBlob(blob, filename){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function escapeHtml(s){
  return s.replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
