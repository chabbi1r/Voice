let mediaRecorder, chunks = [], stream, timer, seconds = 0, isPaused = false;
let db, saveDirectoryHandle = null;

const recBtn = document.getElementById('recBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const timerEl = document.getElementById('timer');
const wave = document.getElementById('wave');
const list = document.getElementById('list');
const empty = document.getElementById('empty');
const chooseFolder = document.getElementById('chooseFolder');
const folderName = document.getElementById('folderName');

// IndexedDB setup
const openDB = () => new Promise((res,rej)=>{
  const r = indexedDB.open('voicePWA',1);
  r.onupgradeneeded = e => e.target.result.createObjectStore('recs',{keyPath:'id'});
  r.onsuccess = e => {db=e.target.result; res()};
  r.onerror = rej;
});
openDB().then(loadList);

function fmt(s){const m=Math.floor(s/60).toString().padStart(2,'0');const sec=(s%60).toString().padStart(2,'0');return `${m}:${sec}`}

function startTimer(){seconds=0;timer=setInterval(()=>{if(!isPaused){seconds++;timerEl.textContent=fmt(seconds)}},1000)}
function stopTimer(){clearInterval(timer);timerEl.textContent='00:00'}

recBtn.onclick = async ()=>{
  if(!mediaRecorder || mediaRecorder.state==='inactive'){
    stream = await navigator.mediaDevices.getUserMedia({audio:true});
    mediaRecorder = new MediaRecorder(stream,{mimeType:'audio/webm;codecs=opus'});
    chunks=[];
    mediaRecorder.ondataavailable = e=>chunks.push(e.data);
    mediaRecorder.onstop = saveRecording;
    mediaRecorder.start();
    recBtn.textContent='جار التسجيل...'; recBtn.classList.add('recording');
    pauseBtn.disabled=false; stopBtn.disabled=false; wave.classList.add('active');
    startTimer();
  }
};

pauseBtn.onclick = ()=>{
  if(!mediaRecorder) return;
  if(mediaRecorder.state==='recording'){mediaRecorder.pause();isPaused=true;pauseBtn.textContent='استئناف';}
  else{mediaRecorder.resume();isPaused=false;pauseBtn.textContent='إيقاف مؤقت';}
};

stopBtn.onclick = ()=>{
  if(mediaRecorder && mediaRecorder.state!=='inactive'){mediaRecorder.stop();stream.getTracks().forEach(t=>t.stop());}
  recBtn.textContent='بدء التسجيل';recBtn.classList.remove('recording');
  pauseBtn.disabled=true;stopBtn.disabled=true;pauseBtn.textContent='إيقاف مؤقت';
  wave.classList.remove('active');stopTimer();
};

async function saveRecording(){
  const blob = new Blob(chunks,{type:'audio/webm'});
  const id = Date.now();
  const name = `تسجيل-${new Date().toLocaleString('ar-MA').replace(/[/,:]/g,'-')}.webm`;
  
  // save to IndexedDB
  const tx = db.transaction('recs','readwrite');
  tx.objectStore('recs').put({id,name,blob,date:new Date()});
  await tx.complete;
  
  // try save to chosen folder
  if(saveDirectoryHandle){
    try{
      const fileHandle = await saveDirectoryHandle.getFileHandle(name,{create:true});
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
    }catch(e){console.log('folder save failed',e)}
  }
  
  loadList();
  // auto download if no folder
  if(!saveDirectoryHandle) downloadBlob(blob,name);
}

function downloadBlob(blob,name){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

chooseFolder.onclick = async ()=>{
  if('showDirectoryPicker' in window){
    try{
      saveDirectoryHandle = await window.showDirectoryPicker({mode:'readwrite'});
      folderName.textContent = saveDirectoryHandle.name;
      localStorage.setItem('folderName',saveDirectoryHandle.name);
    }catch(e){}
  }else{
    alert('متصفحك لا يدعم اختيار المجلد، سيتم التحميل في التنزيلات');
  }
};

async function loadList(){
  const tx = db.transaction('recs','readonly');
  const all = await tx.objectStore('recs').getAll();
  list.innerHTML='';
  if(all.length===0){empty.style.display='block';return}
  empty.style.display='none';
  all.reverse().forEach(rec=>{
    const div=document.createElement('div');div.className='item';
    const audio=document.createElement('audio');audio.controls=true;audio.src=URL.createObjectURL(rec.blob);
    const meta=document.createElement('div');meta.className='meta';meta.textContent=rec.name.slice(0,12);
    const saveBtn=document.createElement('button');saveBtn.textContent='حفظ';
    saveBtn.onclick=()=>downloadBlob(rec.blob,rec.name);
    const del=document.createElement('button');del.textContent='حذف';del.style.background='#5b2333';
    del.onclick=async()=>{const tx=db.transaction('recs','readwrite');tx.objectStore('recs').delete(rec.id);await tx.complete;loadList()};
    div.append(audio,meta,saveBtn,del);list.appendChild(div);
  });
}

// restore folder name
if(localStorage.getItem('folderName')) folderName.textContent = localStorage.getItem('folderName');
