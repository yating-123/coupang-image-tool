const $=id=>document.getElementById(id);

const fileInput=$("fileInput"),
      dropzone=$("dropzone"),
      checkBtn=$("checkBtn"),
      clearBtn=$("clearBtn");

const resultsSection=$("resultsSection"),
      resultList=$("resultList"),
      summary=$("summary"),
      downloadAllBtn=$("downloadAllBtn");

let files=[], results=[];

function formatBytes(b){
  return b<1024*1024
    ? `${(b/1024).toFixed(0)} KB`
    : `${(b/1024/1024).toFixed(2)} MB`;
}

function extForMime(m){
  return m==="image/png"?".png":m==="image/webp"?".webp":".jpg";
}

function mimeFromFile(file){
  return file.type||"image/jpeg";
}

function outputMime(file){
  const f=$("format").value;
  return f==="original"?mimeFromFile(file):f;
}

function safeBase(name){
  return name.replace(/\.[^.]+$/,"");
}

function uniqueName(name,used){
  if(!used.has(name)){
    used.add(name);
    return name;
  }

  const dot=name.lastIndexOf("."),
        base=dot>0?name.slice(0,dot):name,
        ext=dot>0?name.slice(dot):"";

  let i=2,
      n=`${base} (${i})${ext}`;

  while(used.has(n)){
    i++;
    n=`${base} (${i})${ext}`;
  }

  used.add(n);
  return n;
}

function getImageInfo(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file),
          img=new Image();

    img.onload=()=>{
      URL.revokeObjectURL(url);
      resolve({
        width:img.naturalWidth,
        height:img.naturalHeight
      });
    };

    img.onerror=()=>{
      URL.revokeObjectURL(url);
      reject(new Error("無法讀取圖片"));
    };

    img.src=url;
  });
}

function targetSize(w,h,min,max){
  const short=Math.min(w,h),
        long=Math.max(w,h);

  let scale=1,
      reason="";

  if(short<min){
    scale=min/short;
    reason="放大";
  }

  if(long*scale>max){
    scale=max/long;
    reason=reason==="放大"?"需人工處理":"縮小";
  }

  if(short*scale<min-0.5){
    return {manual:true};
  }

  return {
    manual:false,
    w:Math.max(1,Math.round(w*scale)),
    h:Math.max(1,Math.round(h*scale)),
    changed:scale!==1,
    reason
  };
}

async function makeBlob(file,w,h){
  const mime=outputMime(file),
        quality=Math.max(
          1,
          Math.min(100,Number($("quality").value)||95)
        )/100;

  const url=URL.createObjectURL(file),
        img=new Image();

  await new Promise((res,rej)=>{
    img.onload=res;
    img.onerror=rej;
    img.src=url;
  });

  const canvas=document.createElement("canvas");
  canvas.width=w;
  canvas.height=h;

  const ctx=canvas.getContext("2d");

  if(mime==="image/jpeg"){
    ctx.fillStyle="#fff";
    ctx.fillRect(0,0,w,h);
  }

  ctx.drawImage(img,0,0,w,h);
  URL.revokeObjectURL(url);

  return await new Promise((res,rej)=>{
    canvas.toBlob(
      b=>b?res(b):rej(new Error("轉檔失敗")),
      mime,
      mime==="image/png"?undefined:quality
    );
  });
}

function escapeHtml(s){
  return s.replace(
    /[&<>"']/g,
    c=>({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;",
      "'":"&#39;"
    }[c])
  );
}

function render(){
  resultList.innerHTML="";

  results.forEach((r,i)=>{
    const item=document.createElement("div");
    item.className="result-item";

    item.innerHTML=`
      <img class="thumb" src="${r.preview}" alt="">
      <div>
        <div class="name">${escapeHtml(r.outputName)}</div>
        <div class="meta">
          原始：${r.w} × ${r.h} px　｜　${formatBytes(r.file.size)}
        </div>

        ${
          r.manual
            ? `<div class="status manual">需人工處理</div>`
            : r.changed
              ? `<div class="status adjust">已自動調整：${r.tw} × ${r.th} px</div>`
              : `<div class="status ok">符合規範，可直接使用</div>`
        }

        ${
          r.error
            ? `<div class="meta">${escapeHtml(r.error)}</div>`
            : ""
        }
      </div>

      <button
        class="download-one ${r.manual||!r.blob?"secondary":"primary"}"
        data-i="${i}"
        ${r.manual||!r.blob?"disabled":""}
      >下載</button>
    `;

    resultList.appendChild(item);
  });

  const ok=results.filter(
          r=>!r.manual&&!r.error&&!r.changed
        ).length,
        adj=results.filter(
          r=>!r.manual&&!r.error&&r.changed
        ).length,
        man=results.filter(
          r=>r.manual||r.error
        ).length;

  summary.textContent=
    `共 ${results.length} 張｜符合 ${ok}｜可自動調整 ${adj}｜需人工處理 ${man}`;

  downloadAllBtn.disabled=!results.some(r=>r.blob);
}

async function runCheck(){
  const min=Number($("minSize").value),
        max=Number($("maxSize").value),
        maxMB=Number($("maxMB").value);

  if(!min||!max||min>max){
    alert("請確認最小與最大尺寸設定。");
    return;
  }

  results=[];
  resultsSection.hidden=false;
  checkBtn.disabled=true;
  downloadAllBtn.disabled=true;

  for(const file of files){
    const r={
      file,
      preview:URL.createObjectURL(file),
      outputName:file.name,
      w:0,
      h:0,
      changed:false,
      manual:false,
      blob:null,
      error:""
    };

    try{
      const info=await getImageInfo(file);
      r.w=info.width;
      r.h=info.height;

      const t=targetSize(
        info.width,
        info.height,
        min,
        max
      );

      if(t.manual){
        r.manual=true;
        r.error="等比例調整後仍無法同時符合最小與最大單邊限制。";
      }
      else if(file.size>maxMB*1024*1024 && !t.changed){
        r.manual=true;
        r.error=`原檔案超過 ${maxMB} MB，請壓縮或另存。`;
      }
      else if(t.changed || $("format").value!=="original"){
        r.changed=t.changed;
        r.tw=t.w;
        r.th=t.h;

        r.blob=await makeBlob(
          file,
          t.w,
          t.h
        );

        const ext=extForMime(outputMime(file));
        r.outputName=safeBase(file.name)+ext;
        r.preview=URL.createObjectURL(r.blob);
      }
      else if(file.size>maxMB*1024*1024){
        r.manual=true;
        r.error=`原檔案超過 ${maxMB} MB，請壓縮或另存。`;
      }
    }
    catch(e){
      r.manual=true;
      r.error="圖片讀取或轉換失敗。";
    }

    results.push(r);
    render();
  }

  checkBtn.disabled=false;
}

fileInput.addEventListener("change",e=>{
  files=[...e.target.files];
  checkBtn.disabled=!files.length;
  clearBtn.disabled=!files.length;
  resultsSection.hidden=true;
});

dropzone.addEventListener("dragover",e=>{
  e.preventDefault();
  dropzone.classList.add("drag");
});

dropzone.addEventListener("dragleave",()=>{
  dropzone.classList.remove("drag");
});

dropzone.addEventListener("drop",e=>{
  e.preventDefault();
  dropzone.classList.remove("drag");

  files=[...e.dataTransfer.files]
    .filter(f=>f.type.startsWith("image/"));

  fileInput.value="";
  checkBtn.disabled=!files.length;
  clearBtn.disabled=!files.length;
  resultsSection.hidden=true;
});

checkBtn.addEventListener("click",runCheck);

clearBtn.addEventListener("click",()=>{
  results.forEach(r=>{
    if(r.preview)URL.revokeObjectURL(r.preview);
  });

  files=[];
  results=[];
  fileInput.value="";
  resultList.innerHTML="";
  resultsSection.hidden=true;
  checkBtn.disabled=true;
  clearBtn.disabled=true;
});

resultList.addEventListener("click",e=>{
  const b=e.target.closest(".download-one");
  if(!b)return;

  const r=results[Number(b.dataset.i)];
  if(!r.blob)return;

  const a=document.createElement("a");
  a.href=URL.createObjectURL(r.blob);
  a.download=r.outputName;

  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(()=>{
    URL.revokeObjectURL(a.href);
  },1000);
});

downloadAllBtn.addEventListener("click",async()=>{
  const list=results.filter(r=>r.blob);
  if(!list.length)return;

  if(typeof JSZip==="undefined"){
    alert("ZIP 元件載入失敗，請重新整理頁面後再試。");
    return;
  }

  downloadAllBtn.disabled=true;
  downloadAllBtn.textContent="正在打包…";

  try{
    const zip=new JSZip(),
          used=new Set();

    for(const r of list){
      zip.file(
        uniqueName(r.outputName,used),
        r.blob
      );
    }

    const blob=await zip.generateAsync({
      type:"blob",
      compression:"DEFLATE",
      compressionOptions:{level:6}
    });

    const url=URL.createObjectURL(blob),
          a=document.createElement("a");

    a.href=url;
    a.download="商品圖片_調整完成.zip";
    a.rel="noopener";

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(()=>{
      URL.revokeObjectURL(url);
    },5000);
  }
  catch(e){
    alert("ZIP 打包失敗，請稍後再試。");
  }
  finally{
    downloadAllBtn.disabled=false;
    downloadAllBtn.textContent="下載全部（ZIP）";
  }
});
