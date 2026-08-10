let removeBackgroundFn = null;
let preloadFn = null;
let zipLib = null;
let aiReady = false;
let files = [];
let outputs = [];

const $ = id => document.getElementById(id);
const fileInput = $("fileInput"), dropzone = $("dropzone"), processBtn = $("processBtn");
const downloadAllBtn = $("downloadAllBtn"), clearBtn = $("clearBtn"), results = $("results");
const statusEl = $("status"), resultSummary = $("resultSummary");
const aiStatus = $("aiStatus"), aiStatusTitle = $("aiStatusTitle"), aiStatusText = $("aiStatusText");
const modelProgressBar = $("modelProgressBar"), modelProgressText = $("modelProgressText"), modelProgressPercent = $("modelProgressPercent");
const diagnosticText = $("diagnosticText");

function setModelProgress(p, text) {
  p = Math.max(0, Math.min(100, Math.round(p || 0)));
  modelProgressBar.style.width = p + "%";
  modelProgressPercent.textContent = p + "%";
  modelProgressText.textContent = text || "載入中";
}
function setStatus(t) { statusEl.textContent = t || ""; }
function setAIState(state, title, text) {
  aiStatus.className = "ai-status " + state;
  aiStatusTitle.textContent = title;
  aiStatusText.textContent = text;
}
function updateRanges() {
  $("scaleValue").textContent = $("scaleInput").value + "%";
  $("shadowValue").textContent = $("shadowInput").value + "%";
  $("blurValue").textContent = $("blurInput").value + " px";
  $("offsetValue").textContent = $("offsetInput").value + " px";
}
["scaleInput","shadowInput","blurInput","offsetInput"].forEach(id => $(id).addEventListener("input", updateRanges));
updateRanges();

function addFiles(list) {
  const accepted = [...list].filter(f => /^image\/(jpeg|png|webp)$/i.test(f.type));
  if (!accepted.length) { setStatus("請選擇 JPG、PNG 或 WebP 圖片。"); return; }
  files = [...files, ...accepted];
  resultSummary.textContent = "已選擇 " + files.length + " 張圖片";
  processBtn.disabled = !aiReady;
  if (aiReady) processBtn.textContent = "開始製作白底棚拍圖";
  setStatus("已加入 " + accepted.length + " 張圖片。");
}
fileInput.addEventListener("change", e => addFiles(e.target.files));
dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("drag"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag"));
dropzone.addEventListener("drop", e => { e.preventDefault(); dropzone.classList.remove("drag"); addFiles(e.dataTransfer.files); });

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("圖片讀取失敗")); };
    img.src = url;
  });
}
function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("輸出圖片失敗")), type, quality));
}
function fitSize(w, h, minSide) {
  const s = minSide / Math.min(w, h);
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

async function makeStudioImage(bgBlob) {
  const img = await loadImage(bgBlob);
  const target = Number($("sizeInput").value);
  const { w: outW, h: outH } = fitSize(img.naturalWidth, img.naturalHeight, target);
  const canvas = document.createElement("canvas");
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = $("backgroundInput").value;
  ctx.fillRect(0, 0, outW, outH);

  const ratio = Math.min((outW * Number($("scaleInput").value) / 100) / img.naturalWidth,
                         (outH * Number($("scaleInput").value) / 100) / img.naturalHeight);
  const dw = Math.max(1, Math.round(img.naturalWidth * ratio));
  const dh = Math.max(1, Math.round(img.naturalHeight * ratio));
  const dx = Math.round((outW - dw) / 2);
  const dy = Math.round((outH - dh) / 2);

  if ($("shadowEnabled").checked && Number($("shadowInput").value) > 0) {
    const shadow = document.createElement("canvas"); shadow.width = outW; shadow.height = outH;
    const sctx = shadow.getContext("2d");
    sctx.filter = `blur(${Number($("blurInput").value)}px)`;
    sctx.globalAlpha = Number($("shadowInput").value) / 100;
    sctx.drawImage(img, dx, dy + Number($("offsetInput").value), dw, dh);
    const data = sctx.getImageData(0, 0, outW, outH), d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = Math.round(a * 0.55); }
    }
    sctx.putImageData(data, 0, 0);
    ctx.drawImage(shadow, 0, 0);
  }
  ctx.drawImage(img, dx, dy, dw, dh);

  const f = $("formatInput").value;
  const mime = f === "png" ? "image/png" : f === "webp" ? "image/webp" : "image/jpeg";
  const blob = await canvasBlob(canvas, mime, f === "png" ? undefined : 0.95);
  return { blob, w: outW, h: outH };
}
function safeBase(n) { return n.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "_"); }
function downloadBlob(blob, name) {
  const a = document.createElement("a"), url = URL.createObjectURL(blob);
  a.href = url; a.download = name; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function renderResults() {
  results.innerHTML = "";
  outputs.forEach(o => {
    const card = document.createElement("article"); card.className = "result";
    const pv = document.createElement("div"); pv.className = "preview";
    const im = document.createElement("img"); im.src = o.url; im.alt = o.name; pv.appendChild(im);
    const info = document.createElement("div"); info.className = "result-info";
    info.innerHTML = `<div class="result-name"></div><div class="result-meta"></div><span class="badge">白底棚拍完成</span>`;
    info.querySelector(".result-name").textContent = o.name;
    info.querySelector(".result-meta").textContent = `${o.w} × ${o.h} px · ${Math.round(o.blob.size / 1024)} KB`;
    const b = document.createElement("button"); b.textContent = "下載"; b.onclick = () => downloadBlob(o.blob, o.name); info.appendChild(b);
    card.append(pv, info); results.appendChild(card);
  });
  downloadAllBtn.disabled = !outputs.length || !zipLib;
  resultSummary.textContent = outputs.length ? `共 ${outputs.length} 張 · 已完成 ${outputs.length} 張` : (files.length ? `已選擇 ${files.length} 張圖片` : "尚未選擇圖片");
}
clearBtn.onclick = () => {
  files = [];
  outputs.forEach(o => URL.revokeObjectURL(o.url));
  outputs = [];
  fileInput.value = "";
  results.innerHTML = "";
  processBtn.disabled = !aiReady;
  downloadAllBtn.disabled = true;
  resultSummary.textContent = "尚未選擇圖片";
  setStatus("");
};
downloadAllBtn.onclick = async () => {
  if (!outputs.length || !zipLib) return;
  try {
    setStatus("正在建立 ZIP，請稍候。");
    const zip = new zipLib();
    outputs.forEach(o => zip.file(o.name, o.blob));
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    downloadBlob(blob, "商品白底棚拍_" + new Date().toISOString().slice(0, 10) + ".zip");
    setStatus("ZIP 已建立並開始下載。");
  } catch (e) {
    console.error(e); setStatus("ZIP 建立失敗：" + (e.message || "未知錯誤"));
  }
};

function progressFromImgly(key, current, total) {
  if (!total) return;
  const p = Math.max(0, Math.min(100, Math.round(current / total * 100)));
  setModelProgress(p, "下載 " + String(key || "AI 模型").split("/").pop());
}

async function initAI() {
  const ua = navigator.userAgent || "";
  const secure = window.isSecureContext;
  diagnosticText.textContent = `瀏覽器：${/iPhone|iPad|iPod/i.test(ua) ? "iOS / iPadOS" : "桌面或其他裝置"}｜HTTPS：${secure ? "是" : "否"}｜SharedArrayBuffer：${typeof SharedArrayBuffer !== "undefined" ? "可用" : "不可用（仍可嘗試）"}`;
  setAIState("loading", "正在載入 AI 去背模組", "正在使用 ES Module 載入方式，請稍候。第一次使用會下載 AI 模型與 WASM 資源。");
  setModelProgress(3, "載入 AI 程式");
  try {
    // Dynamic import avoids relying on a global window function. The package's documented browser API is an ES module.
    const mod = await import("https://esm.sh/@imgly/background-removal@1.7.0?bundle");
    removeBackgroundFn = mod.default || mod.removeBackground || mod.imglyRemoveBackground;
    preloadFn = mod.preload || null;
    if (typeof removeBackgroundFn !== "function") throw new Error("AI 去背函式未成功載入");
    setModelProgress(8, "AI 程式已載入");

    if (typeof preloadFn === "function") {
      setAIState("loading", "正在下載 AI 模型", "第一次使用需要下載模型與 WASM 資源。請保持此頁開啟，不要關閉瀏覽器。 ");
      await preloadFn({ progress: progressFromImgly, debug: false });
    }

    setModelProgress(100, "AI 模組已就緒");
    setAIState("ready", "AI 去背模組已就緒", "可以開始上傳商品照片。後續使用會優先使用瀏覽器快取。");
    aiReady = true;
    processBtn.disabled = files.length === 0;
    processBtn.textContent = "開始製作白底棚拍圖";
    setStatus("AI 模組已就緒。 ");
  } catch (e) {
    console.error("V1.2 AI init error:", e);
    setModelProgress(0, "載入失敗");
    setAIState("error", "AI 去背模組載入失敗", "無法完成 AI 模組或模型下載。請確認使用 HTTPS、重新整理頁面，並優先使用 Safari / Chrome 最新版與穩定 Wi-Fi。");
    diagnosticText.textContent += `｜錯誤：${e?.message || e}`;
    processBtn.disabled = true;
    processBtn.textContent = "AI 模組未就緒";
    setStatus("AI 模組尚未就緒，因此暫時無法開始處理。");
  }
}

async function loadZip() {
  try {
    const mod = await import("https://esm.sh/jszip@3.10.1?bundle");
    zipLib = mod.default || mod.JSZip;
    if (outputs.length) renderResults();
  } catch (e) {
    console.warn("JSZip 載入失敗，單張下載仍可使用。", e);
  }
}

async function removeBg(blob) {
  if (!removeBackgroundFn) throw new Error("AI 去背模組尚未載入");
  return await removeBackgroundFn(blob, {
    progress: (key, current, total) => {
      if (total) setStatus(`AI 去背處理中：${Math.round(current / total * 100)}%`);
    }
  });
}

processBtn.onclick = async () => {
  if (!files.length || !aiReady) return;
  processBtn.disabled = true; downloadAllBtn.disabled = true;
  outputs.forEach(o => URL.revokeObjectURL(o.url)); outputs = []; renderResults();
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setStatus(`第 ${i + 1}/${files.length} 張：AI 去背中`);
      const cutout = await removeBg(file);
      setStatus(`第 ${i + 1}/${files.length} 張：製作白底棚拍`);
      const r = await makeStudioImage(cutout);
      const f = $("formatInput").value, ext = f === "png" ? "png" : f === "webp" ? "webp" : "jpg";
      const name = safeBase(file.name) + "_棚拍." + ext;
      outputs.push({ blob: r.blob, url: URL.createObjectURL(r.blob), name, w: r.w, h: r.h });
      renderResults();
    }
    setStatus("全部處理完成，可以單張下載或下載全部 ZIP。");
  } catch (e) {
    console.error(e);
    setStatus("處理失敗：" + (e.message || "未知錯誤"));
  } finally {
    processBtn.disabled = !aiReady || !files.length;
    if (aiReady) processBtn.textContent = "開始製作白底棚拍圖";
    renderResults();
  }
};

window.addEventListener("DOMContentLoaded", () => { loadZip(); initAI(); });
