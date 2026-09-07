'use strict';

/* =========================================================
   タイピング ホームランチャレンジ v27
   - ゲーム進行
   - ローマ字入力
   - 単語設定
   - タイム
   - 球場/見た目設定
   を機能ごとに分けて管理する安定版
   ========================================================= */

const $ = id => document.getElementById(id);
const $$ = selector => [...document.querySelectorAll(selector)];

/* ---------- 定数 ---------- */
const TOTAL_PITCHES = 10;
const BALL_RELEASE_Y_OFFSET = -10;
const WORD_STORAGE_KEY = 'typingBaseballCustomWordsV1';
const BG_STORAGE_KEY = 'typingBaseballBackgroundV2';
const APPEARANCE_STORAGE_KEY = 'typingBaseballAppearanceV2';
const STADIUM_DB_NAME = 'typingBaseballStadiumDB';
const STADIUM_STORE = 'stadiums';
const KAKUSHIN_STORE = 'kakushinImages';
const MAX_WORDS = 100;

const PITCHER_FRAMES = Array.from(
  {length:10},
  (_,i) => `pitcher_frames/frame_${String(i+1).padStart(2,'0')}.png`
);

const DEFAULT_WORDS = [
  ['ねこ','neko'],['いぬ','inu'],['すし','sushi'],['くるま','kuruma'],
  ['さくら','sakura'],['でんしゃ','densha'],['やきゅう','yakyuu'],
  ['りんご','ringo'],['うさぎ','usagi'],['ひこうき','hikouki'],
  ['きょうりゅう','kyouryuu'],['しょうぼうしゃ','shoubousha']
];

const BUILTIN_STADIUMS = [
  {id:'escon', name:'エスコンフィールド', url:'stadium_escon.png', builtin:true},
  {id:'dodgers', name:'ドジャースタジアム', url:'stadium_dodgers.jpg', builtin:true}
];

const DEFAULT_APPEARANCE = {
  bgX:50,
  bgY:50,
  bgScale:100,
  pitcherX:50,
  pitcherY:0,
  pitcherScale:100,
  ballReleaseY:-10,
  keyboardX:50,
  keyboardY:0,
  keyboardScale:100,
  wordX:50,
  wordY:0,
  wordScale:100
};

/* ---------- 状態 ---------- */
const state = {
  active:false,
  challenge:false,
  paused:false,
  target:'',
  acceptedTargets:[],
  typedBuffer:'',
  jp:'',
  misses:0,
  hrs:0,
  pitchIndex:0,
  duration:10,
  startAt:0,
  raf:null,
  animTimers:[],
  nextTimer:null,
  selectedDuration:null,
  pausedElapsed:0,
  pauseBallState:null,
  lastWordKey:null,
  selectedStadiumId:'escon',
  selectedCustomFile:null
};

let words = loadWords();
let stadiumLibrary = [...BUILTIN_STADIUMS];
let appearanceStore = loadAppearanceStore();
let customKakushinImages = [];
let selectedKakushinFile = null;

/* ---------- 音 ---------- */
const sfx = {
  hit:new Audio('hit.mp3'),
  homerun:new Audio('homerun.mp3'),
  strike:new Audio('strike.mp3')
};
Object.values(sfx).forEach(audio => { audio.preload = 'auto'; });

function playSfx(name){
  const audio = sfx[name];
  if(!audio) return;
  try{
    audio.pause();
    audio.currentTime = 0;
    audio.play().catch(()=>{});
  }catch(_e){}
}

function beep(freq=440,dur=.08,type='sine',gain=.04){
  try{
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = window._typingGameAudioContext || (window._typingGameAudioContext = new AudioContextClass());
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.value = gain;
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start();
    amp.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+dur);
    osc.stop(ctx.currentTime+dur);
  }catch(_e){}
}

/* =========================================================
   単語データ
   ========================================================= */
function loadWords(){
  try{
    const saved = JSON.parse(localStorage.getItem(WORD_STORAGE_KEY));
    if(Array.isArray(saved)){
      const valid = saved.filter(w => Array.isArray(w) && String(w[0]||'').trim() && String(w[1]||'').trim());
      if(valid.length) return valid.slice(0,MAX_WORDS);
    }
  }catch(_e){}
  return DEFAULT_WORDS.map(w => [...w]);
}

function saveWords(){
  try{ localStorage.setItem(WORD_STORAGE_KEY,JSON.stringify(words)); }
  catch(_e){}
}

function makeWordRow(label='',kana=''){
  const row = document.createElement('div');
  row.className = 'wordRow';

  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.className = 'wordLabelInput';
  labelInput.placeholder = '表示する文字';
  labelInput.value = label;

  const kanaInput = document.createElement('input');
  kanaInput.type = 'text';
  kanaInput.className = 'wordKanaInput';
  kanaInput.placeholder = 'ふりがな';
  kanaInput.value = kana;

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'wordDeleteBtn';
  del.textContent = '×';
  del.title = '削除';

  del.addEventListener('click',()=>{
    row.remove();
    if(!$('wordRows').children.length) addWordRow();
    updateWordCount();
  });
  labelInput.addEventListener('paste',e=>handleMultiLinePaste(e,'label',row));
  kanaInput.addEventListener('paste',e=>handleMultiLinePaste(e,'kana',row));
  labelInput.addEventListener('input',updateWordCount);
  kanaInput.addEventListener('input',updateWordCount);

  row.append(labelInput,kanaInput,del);
  return row;
}

function addWordRow(label='',kana='',focus=false){
  const container = $('wordRows');
  if(!container || container.children.length >= MAX_WORDS) return null;
  const row = makeWordRow(label,kana);
  container.appendChild(row);
  updateWordCount();
  if(focus) row.querySelector('.wordLabelInput')?.focus();
  return row;
}

function handleMultiLinePaste(e,type,currentRow){
  const text = e.clipboardData?.getData('text');
  if(!text || !/[\r\n]/.test(text)) return;

  e.preventDefault();
  const lines = text.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
  const rows = [...$('wordRows').children];
  const startIndex = rows.indexOf(currentRow);

  lines.forEach((line,i)=>{
    if(startIndex+i >= MAX_WORDS) return;
    let row = $('wordRows').children[startIndex+i];
    if(!row) row = addWordRow();
    if(!row) return;

    const comma = line.indexOf(',');
    if(comma >= 0){
      row.querySelector('.wordLabelInput').value = line.slice(0,comma).trim();
      row.querySelector('.wordKanaInput').value = line.slice(comma+1).trim();
    }else{
      const input = type==='label'
        ? row.querySelector('.wordLabelInput')
        : row.querySelector('.wordKanaInput');
      input.value = line;
    }
  });
  updateWordCount();
}

function fillWordRows(list){
  const container = $('wordRows');
  container.innerHTML = '';
  list.slice(0,MAX_WORDS).forEach(([label,kana])=>addWordRow(label,kana));
  if(!container.children.length) addWordRow();
  updateWordCount();
}

function collectWordRows(){
  return [...$('wordRows').children]
    .map(row=>[
      row.querySelector('.wordLabelInput').value.trim(),
      row.querySelector('.wordKanaInput').value.trim()
    ])
    .filter(([label,kana])=>label && kana)
    .slice(0,MAX_WORDS);
}

function updateWordCount(){
  if($('wordCount')) $('wordCount').textContent = collectWordRows().length;
}

function openWordModal(){
  if(state.active) return;
  fillWordRows(words);
  showModal('wordModal');
}

function saveCustomWords(){
  const parsed = collectWordRows();
  if(!parsed.length){
    alert('「表示する文字」と「ふりがな」を1つ以上登録してください。');
    return;
  }
  words = parsed;
  saveWords();
  hideModal('wordModal');
  $('jp').textContent = `単語を${words.length}語保存しました`;
  $('roman').textContent = 'スペースキーでゲームスタート';
}

function resetWords(){
  words = DEFAULT_WORDS.map(w=>[...w]);
  try{ localStorage.removeItem(WORD_STORAGE_KEY); }catch(_e){}
  fillWordRows(words);
}

/* =========================================================
   ローマ字入力
   ========================================================= */
const ROMAJI_MAP = {
  'あ':['a'],'い':['i'],'う':['u'],'え':['e'],'お':['o'],
  'か':['ka'],'き':['ki'],'く':['ku'],'け':['ke'],'こ':['ko'],
  'さ':['sa'],'し':['shi','si'],'す':['su'],'せ':['se'],'そ':['so'],
  'た':['ta'],'ち':['chi','ti'],'つ':['tsu','tu'],'て':['te'],'と':['to'],
  'な':['na'],'に':['ni'],'ぬ':['nu'],'ね':['ne'],'の':['no'],
  'は':['ha'],'ひ':['hi'],'ふ':['fu','hu'],'へ':['he'],'ほ':['ho'],
  'ま':['ma'],'み':['mi'],'む':['mu'],'め':['me'],'も':['mo'],
  'や':['ya'],'ゆ':['yu'],'よ':['yo'],
  'ら':['ra'],'り':['ri'],'る':['ru'],'れ':['re'],'ろ':['ro'],
  'わ':['wa'],'を':['wo'],'ん':['n','nn'],'ー':['-'],
  'が':['ga'],'ぎ':['gi'],'ぐ':['gu'],'げ':['ge'],'ご':['go'],
  'ざ':['za'],'じ':['ji','zi'],'ず':['zu'],'ぜ':['ze'],'ぞ':['zo'],
  'だ':['da'],'ぢ':['ji','di'],'づ':['zu','du'],'で':['de'],'ど':['do'],
  'ば':['ba'],'び':['bi'],'ぶ':['bu'],'べ':['be'],'ぼ':['bo'],
  'ぱ':['pa'],'ぴ':['pi'],'ぷ':['pu'],'ぺ':['pe'],'ぽ':['po'],
  'きゃ':['kya'],'きゅ':['kyu'],'きょ':['kyo'],
  'しゃ':['sha','sya'],'しゅ':['shu','syu'],'しょ':['sho','syo'],
  'ちゃ':['cha','tya'],'ちゅ':['chu','tyu'],'ちょ':['cho','tyo'],
  'にゃ':['nya'],'にゅ':['nyu'],'にょ':['nyo'],
  'ひゃ':['hya'],'ひゅ':['hyu'],'ひょ':['hyo'],
  'みゃ':['mya'],'みゅ':['myu'],'みょ':['myo'],
  'りゃ':['rya'],'りゅ':['ryu'],'りょ':['ryo'],
  'ぎゃ':['gya'],'ぎゅ':['gyu'],'ぎょ':['gyo'],
  'じゃ':['ja','jya','zya'],'じゅ':['ju','jyu','zyu'],'じょ':['jo','jyo','zyo'],
  'びゃ':['bya'],'びゅ':['byu'],'びょ':['byo'],
  'ぴゃ':['pya'],'ぴゅ':['pyu'],'ぴょ':['pyo'],
  'でぃ':['dhi','dxi'],'てぃ':['thi','txi'],
  'ふぁ':['fa'],'ふぃ':['fi'],'ふぇ':['fe'],'ふぉ':['fo'],
  'ぁ':['xa','la'],'ぃ':['xi','li'],'ぅ':['xu','lu'],'ぇ':['xe','le'],'ぉ':['xo','lo'],
  'ゃ':['xya','lya'],'ゅ':['xyu','lyu'],'ょ':['xyo','lyo'],'っ':['xtu','ltu']
};

const ROMAJI_SWAPS = [
  ['shi','si'],['si','shi'],
  ['sha','sya'],['sya','sha'],['shu','syu'],['syu','shu'],['sho','syo'],['syo','sho'],
  ['chi','ti'],['ti','chi'],['cha','tya'],['tya','cha'],['chu','tyu'],['tyu','chu'],['cho','tyo'],['tyo','cho'],
  ['tsu','tu'],['tu','tsu'],['fu','hu'],['hu','fu'],['ji','zi'],['zi','ji'],
  ['dhi','dxi'],['dxi','dhi']
];

function katakanaToHiragana(text){
  return text.replace(/[\u30a1-\u30f6]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0x60));
}

function combineVariants(parts,limit=512){
  let result = [''];
  for(const choices of parts){
    const next = [];
    for(const base of result){
      for(const choice of choices){
        next.push(base+choice);
        if(next.length >= limit) break;
      }
      if(next.length >= limit) break;
    }
    result = next;
  }
  return [...new Set(result)];
}

function romanTextVariants(text){
  let pool = [text.toLowerCase()];
  for(let round=0; round<3; round++){
    const additions = [];
    for(const value of pool){
      for(const [from,to] of ROMAJI_SWAPS){
        if(value.includes(from)) additions.push(value.replaceAll(from,to));
      }
    }
    pool = [...new Set([...pool,...additions])].slice(0,512);
  }

  const expanded = new Set(pool);
  for(const value of pool){
    if(value.includes('nn')) expanded.add(value.replaceAll('nn','n'));
    expanded.add(value.replace(/n(?=[^aiueoyn]|$)/g,'nn'));
  }
  return [...expanded].slice(0,512);
}

function kanaToRomajiVariants(source){
  const normalized = katakanaToHiragana(String(source||'').trim().toLowerCase());
  if(/^[a-z-]+$/.test(normalized)) return romanTextVariants(normalized);

  const parts = [];
  for(let i=0;i<normalized.length;){
    if(normalized[i] === 'っ'){
      const two = normalized.slice(i+1,i+3);
      const one = normalized[i+1];
      const nextChoices = ROMAJI_MAP[two] || ROMAJI_MAP[one];
      const consonants = nextChoices
        ? [...new Set(nextChoices.map(v=>v[0]).filter(c=>/[a-z]/.test(c)))]
        : [];
      parts.push(consonants.length ? consonants : ROMAJI_MAP['っ']);
      i += 1;
      continue;
    }

    const two = normalized.slice(i,i+2);
    if(ROMAJI_MAP[two]){
      parts.push(ROMAJI_MAP[two]);
      i += 2;
      continue;
    }

    const one = normalized[i];
    parts.push(ROMAJI_MAP[one] || [one]);
    i += 1;
  }

  const variants = combineVariants(parts);
  const expanded = new Set(variants);
  for(const value of variants){
    if(value.includes('dhi')) expanded.add(value.replaceAll('dhi','dxi'));
    if(value.includes('dxi')) expanded.add(value.replaceAll('dxi','dhi'));
  }
  return [...expanded].slice(0,512);
}

function prepareTypingTargets(source){
  state.acceptedTargets = kanaToRomajiVariants(source);
  if(!state.acceptedTargets.length) state.acceptedTargets = [String(source||'').toLowerCase()];
  state.target = state.acceptedTargets[0];
  state.typedBuffer = '';
}

function matchingTargets(buffer){
  return state.acceptedTargets.filter(value=>value.startsWith(buffer));
}

function renderWord(){
  const matches = matchingTargets(state.typedBuffer);
  const displayTarget = matches[0] || state.target;
  state.target = displayTarget;

  $('roman').innerHTML = [...displayTarget].map((char,index)=>{
    if(index < state.typedBuffer.length) return `<span class="done">${char}</span>`;
    if(index === state.typedBuffer.length) return `<span class="current">${char}</span>`;
    return char;
  }).join('');
  $('jp').textContent = state.jp;
  updateKeyboardGuide();
}

/* =========================================================
   キーボードガイド
   ========================================================= */
function updateKeyboardGuide(){
  $$('.key').forEach(key=>key.classList.remove('next'));
  if(!state.active){
    $('nextKeyLabel').textContent = '-';
    return;
  }

  const nextKeys = [...new Set(
    matchingTargets(state.typedBuffer)
      .map(value=>value[state.typedBuffer.length])
      .filter(Boolean)
  )];

  $('nextKeyLabel').textContent = nextKeys.length
    ? nextKeys.map(k=>k.toUpperCase()).join(' / ')
    : '-';

  nextKeys.forEach(key=>document.querySelector(`.key[data-key="${key}"]`)?.classList.add('next'));
}

/* =========================================================
   球場 / 見た目
   ========================================================= */
function loadAppearanceStore(){
  try{return JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY)) || {};}
  catch(_e){return {};}
}

function saveAppearanceStore(){
  try{localStorage.setItem(APPEARANCE_STORAGE_KEY,JSON.stringify(appearanceStore));}
  catch(_e){}
}

function appearanceFor(id){
  return {...DEFAULT_APPEARANCE,...(appearanceStore[id]||{})};
}

function openStadiumDB(){
  return new Promise((resolve,reject)=>{
    const request = indexedDB.open(STADIUM_DB_NAME,2);
    request.onupgradeneeded = ()=>{
      const db = request.result;
      if(!db.objectStoreNames.contains(STADIUM_STORE)) db.createObjectStore(STADIUM_STORE,{keyPath:'id'});
      if(!db.objectStoreNames.contains(KAKUSHIN_STORE)) db.createObjectStore(KAKUSHIN_STORE,{keyPath:'id'});
    };
    request.onsuccess = ()=>resolve(request.result);
    request.onerror = ()=>reject(request.error);
  });
}

async function stadiumDbGetAll(){
  try{
    const db = await openStadiumDB();
    return await new Promise((resolve,reject)=>{
      const req = db.transaction(STADIUM_STORE,'readonly').objectStore(STADIUM_STORE).getAll();
      req.onsuccess = ()=>resolve(req.result||[]);
      req.onerror = ()=>reject(req.error);
    });
  }catch(_e){return [];}
}

async function stadiumDbPut(record){
  const db = await openStadiumDB();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(STADIUM_STORE,'readwrite');
    tx.objectStore(STADIUM_STORE).put(record);
    tx.oncomplete = resolve;
    tx.onerror = ()=>reject(tx.error);
  });
}

async function stadiumDbDelete(id){
  const db = await openStadiumDB();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(STADIUM_STORE,'readwrite');
    tx.objectStore(STADIUM_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = ()=>reject(tx.error);
  });
}


async function getCustomKakushinImages(){
  try{
    const db=await openStadiumDB();
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(KAKUSHIN_STORE,'readonly');
      const req=tx.objectStore(KAKUSHIN_STORE).getAll();
      req.onsuccess=()=>resolve(req.result||[]);
      req.onerror=()=>reject(req.error);
    });
  }catch(_e){return []}
}
async function saveCustomKakushinImage(record){
  const db=await openStadiumDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(KAKUSHIN_STORE,'readwrite');
    tx.objectStore(KAKUSHIN_STORE).put(record);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}
async function deleteCustomKakushinImage(id){
  const db=await openStadiumDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(KAKUSHIN_STORE,'readwrite');
    tx.objectStore(KAKUSHIN_STORE).delete(id);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}
function renderKakushinImageList(){
  const box=$('kakushinImageList');
  if(!box)return;
  box.innerHTML='';
customKakushinImages.forEach(item=>{
    const row=document.createElement('div');
    row.className='kakushinImageItem';
    const info=document.createElement('div');
    info.className='kakushinImageInfo';
    const img=document.createElement('img');
    img.className='kakushinThumb'; img.src=item.url; img.alt='';
    const name=document.createElement('span');
    name.className='kakushinImageName'; name.textContent=item.name||'追加画像';
    info.append(img,name);
    const del=document.createElement('button');
    del.type='button'; del.className='kakushinDeleteBtn'; del.textContent='削除';
    del.addEventListener('click',async()=>{
      if(!confirm(`「${item.name||'追加画像'}」を削除しますか？`))return;
      await deleteCustomKakushinImage(item.id);
      if(item.url?.startsWith('blob:'))URL.revokeObjectURL(item.url);
      customKakushinImages=customKakushinImages.filter(x=>x.id!==item.id);
      renderKakushinImageList();
    });
    row.append(info,del);
    box.appendChild(row);
  });
}
async function addKakushinImage(){
  const file = selectedKakushinFile;
  if(!file){
    alert('画像を選んでください。');
    return;
  }

  try{
    const id = `kakushin_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    const record = {id,name:file.name,blob:file};

    await saveCustomKakushinImage(record);

    customKakushinImages.push({
      ...record,
      url:URL.createObjectURL(file)
    });

    selectedKakushinFile = null;
    $('kakushinFileInput').value = '';
    $('kakushinFileName').textContent = '画像未選択';
    renderKakushinImageList();
  }catch(err){
    console.error('確信ホームラン画像の保存に失敗:',err);
    alert('画像を保存できませんでした。ページを再読み込みして、もう一度試してください。');
  }
}

async function initKakushinImages(){
  try{
    const saved = await getCustomKakushinImages();
    customKakushinImages = saved.map(item=>({
      ...item,
      url:URL.createObjectURL(item.blob)
    }));
  }catch(err){
    console.error('確信ホームラン画像の読み込みに失敗:',err);
    customKakushinImages = [];
  }
  renderKakushinImageList();
}

function pickKakushinImageUrl(){
  if(!customKakushinImages.length) return null;
  const choices = customKakushinImages.map(x=>x.url);
  return choices[Math.floor(Math.random()*choices.length)];
}

function rebuildStadiumSelectors(){
  [$('backgroundSelect'),$('appearanceBgSelect')].filter(Boolean).forEach(select=>{
    select.innerHTML = '';
    stadiumLibrary.forEach(stadium=>{
      const option = document.createElement('option');
      option.value = stadium.id;
      option.textContent = stadium.name;
      select.appendChild(option);
    });
    select.value = state.selectedStadiumId;
  });
}


function currentBallReleaseYOffset(){
  const a = appearanceFor(state.selectedStadiumId);
  const v = Number(a.ballReleaseY);
  return Number.isFinite(v) ? v : -10;
}

function updateBallReleasePreview(){
  const preview = $('ballReleasePreview');
  if(!preview) return;
  const appearance = appearanceFor(state.selectedStadiumId);
  preview.style.left = `${appearance.pitcherX}%`;
  preview.style.top = `calc(8% + ${currentBallReleaseYOffset()}px)`;
}

function applyAppearance(){
  const stadium = stadiumLibrary.find(s=>s.id===state.selectedStadiumId) || BUILTIN_STADIUMS[0];
  const appearance = appearanceFor(state.selectedStadiumId);
  const app = $('app');
  const pitcher = document.querySelector('.pitcherWrap');
  const keyboard = $('keyboardGuide');
  const wordPanel = document.querySelector('.wordPanel');

  app.style.backgroundImage = `url("${stadium.url}")`;
  app.style.backgroundPosition = `${appearance.bgX}% ${appearance.bgY}%`;
  app.style.backgroundSize = appearance.bgScale===100 ? 'cover' : `${appearance.bgScale}% auto`;

  pitcher.style.left = `${appearance.pitcherX}%`;
  pitcher.style.top = `${appearance.pitcherY}px`;
  pitcher.style.transform = `translateX(-50%) scale(${appearance.pitcherScale/100})`;

  keyboard.style.left = `${appearance.keyboardX}%`;
  keyboard.style.bottom = `calc(8px + ${appearance.keyboardY}px)`;
  keyboard.style.transform = `translateX(-50%) scale(${appearance.keyboardScale/100})`;

  wordPanel.style.left = `${appearance.wordX}%`;
  wordPanel.style.bottom = `calc(23% + ${appearance.wordY}px)`;
  wordPanel.style.transform = `translateX(-50%) scale(${appearance.wordScale/100})`;
  updateBallReleasePreview();
}

function syncAppearanceControls(){
  const a = appearanceFor(state.selectedStadiumId);
  const controls = {
    bgPosX:a.bgX,bgPosY:a.bgY,bgScale:a.bgScale,
    pitcherPosX:a.pitcherX,pitcherPosY:a.pitcherY,pitcherScale:a.pitcherScale,
    ballReleaseY:a.ballReleaseY,
    keyboardPosX:a.keyboardX,keyboardPosY:a.keyboardY,keyboardScale:a.keyboardScale,
    wordPanelPosX:a.wordX,wordPanelPosY:a.wordY,wordPanelScale:a.wordScale
  };
  Object.entries(controls).forEach(([id,value])=>{ if($(id)) $(id).value = value; });

  $('bgPosXValue').textContent = `${a.bgX}%`;
  $('bgPosYValue').textContent = `${a.bgY}%`;
  $('bgScaleValue').textContent = `${a.bgScale}%`;
  $('pitcherPosXValue').textContent = `${a.pitcherX}%`;
  $('pitcherPosYValue').textContent = `${a.pitcherY}px`;
  $('pitcherScaleValue').textContent = `${a.pitcherScale}%`;
  if($('ballReleaseYValue')) $('ballReleaseYValue').textContent = `${a.ballReleaseY}px`;
  $('keyboardPosXValue').textContent = `${a.keyboardX}%`;
  $('keyboardPosYValue').textContent = `${a.keyboardY}px`;
  $('keyboardScaleValue').textContent = `${a.keyboardScale}%`;
  $('wordPanelPosXValue').textContent = `${a.wordX}%`;
  $('wordPanelPosYValue').textContent = `${a.wordY}px`;
  $('wordPanelScaleValue').textContent = `${a.wordScale}%`;
  $('appearanceBgSelect').value = state.selectedStadiumId;
}

function updateAppearanceFromControls(){
  appearanceStore[state.selectedStadiumId] = {
    bgX:+$('bgPosX').value,
    bgY:+$('bgPosY').value,
    bgScale:+$('bgScale').value,
    pitcherX:+$('pitcherPosX').value,
    pitcherY:+$('pitcherPosY').value,
    pitcherScale:+$('pitcherScale').value,
    ballReleaseY:+$('ballReleaseY').value,
    keyboardX:+$('keyboardPosX').value,
    keyboardY:+$('keyboardPosY').value,
    keyboardScale:+$('keyboardScale').value,
    wordX:+$('wordPanelPosX').value,
    wordY:+$('wordPanelPosY').value,
    wordScale:+$('wordPanelScale').value
  };
  saveAppearanceStore();
  syncAppearanceControls();
  applyAppearance();
  updateBallReleasePreview();
}

function selectStadium(id){
  if(!stadiumLibrary.some(s=>s.id===id)) id = 'escon';
  state.selectedStadiumId = id;
  try{localStorage.setItem(BG_STORAGE_KEY,id);}catch(_e){}
  rebuildStadiumSelectors();
  applyAppearance();
  syncAppearanceControls();
}

function resetCurrentAppearance(){
  delete appearanceStore[state.selectedStadiumId];
  saveAppearanceStore();
  syncAppearanceControls();
  applyAppearance();
}

function renderCustomStadiumList(){
  const box = $('customStadiumList');
  box.innerHTML = '';
  const custom = stadiumLibrary.filter(s=>!s.builtin);
  if(!custom.length){
    const empty = document.createElement('div');
    empty.className = 'customStadiumEmpty';
    empty.textContent = '追加した球場はありません';
    box.appendChild(empty);
    return;
  }

  custom.forEach(stadium=>{
    const row = document.createElement('div');
    row.className = 'customStadiumItem';
    const name = document.createElement('span');
    name.className = 'customStadiumName';
    name.textContent = stadium.name;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'customStadiumDelete';
    del.textContent = '削除';
    del.addEventListener('click',()=>deleteCustomStadium(stadium));
    row.append(name,del);
    box.appendChild(row);
  });
}

async function addCustomStadium(){
  const name = $('stadiumNameInput').value.trim();
  const file = state.selectedCustomFile;
  if(!name) return alert('球場名を入力してください。');
  if(!file) return alert('球場の画像を選んでください。');

  try{
    const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    await stadiumDbPut({id,name,blob:file});
    stadiumLibrary.push({id,name,url:URL.createObjectURL(file),builtin:false});
    $('stadiumNameInput').value = '';
    $('stadiumFileInput').value = '';
    $('stadiumFileName').textContent = '画像未選択';
    state.selectedCustomFile = null;
    renderCustomStadiumList();
    selectStadium(id);
  }catch(error){
    console.error(error);
    alert('球場画像を保存できませんでした。');
  }
}

async function deleteCustomStadium(stadium){
  if(!confirm(`「${stadium.name}」を削除しますか？`)) return;
  try{
    await stadiumDbDelete(stadium.id);
    if(stadium.url?.startsWith('blob:')) URL.revokeObjectURL(stadium.url);
    stadiumLibrary = stadiumLibrary.filter(s=>s.id!==stadium.id);
    delete appearanceStore[stadium.id];
    saveAppearanceStore();
    if(state.selectedStadiumId===stadium.id) state.selectedStadiumId = 'escon';
    renderCustomStadiumList();
    selectStadium(state.selectedStadiumId);
  }catch(error){
    console.error(error);
    alert('球場画像を削除できませんでした。');
  }
}

async function initStadiums(){
  const custom = await stadiumDbGetAll();
  stadiumLibrary = [
    ...BUILTIN_STADIUMS,
    ...custom.map(s=>({...s,url:URL.createObjectURL(s.blob),builtin:false}))
  ];
  try{
    const saved = localStorage.getItem(BG_STORAGE_KEY);
    if(saved && stadiumLibrary.some(s=>s.id===saved)) state.selectedStadiumId = saved;
  }catch(_e){}
  rebuildStadiumSelectors();
  renderCustomStadiumList();
  applyAppearance();
  syncAppearanceControls();
}

/* =========================================================
   投球 / ゲーム進行
   ========================================================= */
function clearPitcherAnimation(){
  state.animTimers.forEach(clearTimeout);
  state.animTimers = [];
}

function pitcherAnimation(){
  clearPitcherAnimation();
  const frameMs = 90;
  PITCHER_FRAMES.forEach((src,index)=>{
    state.animTimers.push(setTimeout(()=>{
      $('pitcher').src = src;
      if(index===8) beep(180,.05,'square',.025);
    },index*frameMs));
  });
}

function buildPitchDots(){
  const box = $('pitchDots');
  box.innerHTML = '';
  for(let i=0;i<TOTAL_PITCHES;i++){
    const dot = document.createElement('div');
    dot.className = 'pitchDot';
    dot.id = `dot${i}`;
    dot.textContent = i+1;
    box.appendChild(dot);
  }
}

function markCurrentPitch(){
  $$('.pitchDot').forEach(dot=>dot.classList.remove('current'));
  if(state.pitchIndex<TOTAL_PITCHES) $(`dot${state.pitchIndex}`)?.classList.add('current');
}

function chooseNextWord(){
  let candidates = words;
  if(words.length>1 && state.lastWordKey){
    candidates = words.filter(w=>`${w[0]}\u0000${w[1]}`!==state.lastWordKey);
  }
  const chosen = candidates[Math.floor(Math.random()*candidates.length)];
  state.lastWordKey = `${chosen[0]}\u0000${chosen[1]}`;
  return chosen;
}

function resetChallenge(){
  cancelAnimationFrame(state.raf);
  clearPitcherAnimation();
  clearTimeout(state.nextTimer);
  state.nextTimer = null;
  state.active = false;
  state.paused = false;
  state.challenge = true;
  state.hrs = 0;
  state.pitchIndex = 0;
  state.lastWordKey = null;

  $('hrs').textContent = '0';
  $('pitchNo').textContent = '0';
  $('pitcher').src = PITCHER_FRAMES[0];
  $('start').disabled = true;
  $('duration').disabled = true;
  $('timeoutBtn').disabled = false;
  $('summary').classList.remove('show');
  $('jp').textContent = 'プレイボール！';
  $('roman').textContent = 'Enterキーで第1球を投げる';
  $('miss').textContent = '0';
  $('time').textContent = '--';
  $('timerFill').style.transform = 'scaleX(1)';
  buildPitchDots();
  markCurrentPitch();
  updateKeyboardGuide();
}

function startPitch(){
  if(state.active || state.paused || !state.challenge || state.pitchIndex>=TOTAL_PITCHES) return;

  clearTimeout(state.nextTimer);
  state.nextTimer = null;
  state.active = true;
  state.misses = 0;
  $('miss').textContent = '0';
  state.duration = +$('duration').value;

  const [label,reading] = chooseNextWord();
  state.jp = label;
  prepareTypingTargets(reading);
  $('pitchNo').textContent = state.pitchIndex+1;
  markCurrentPitch();
  renderWord();
  pitcherAnimation();

  state.startAt = performance.now();
  $('ball').style.opacity = '1';
  $('ball').style.top=`calc(8% + ${currentBallReleaseYOffset()}px)`;
  $('ball').style.transform = 'translate(-50%,-50%) scale(.55)';
  $('ball').style.filter = 'blur(0px)';
  state.raf = requestAnimationFrame(tick);
}

function tick(now){
  if(!state.active || state.paused) return;

  const elapsed = (now-state.startAt)/1000;
  const progress = Math.min(1,elapsed/state.duration);
  const remaining = Math.max(0,state.duration-elapsed);
  $('time').textContent = remaining.toFixed(1);
  $('timerFill').style.transform = `scaleX(${1-progress})`;

  const scale = .55 + progress*10.5;
  const top = 8 + progress*65;
  $('ball').style.top=`calc(${top}% + ${currentBallReleaseYOffset()}px)`;
  $('ball').style.transform = `translate(-50%,-50%) scale(${scale})`;
  $('ball').style.filter = `blur(${Math.max(0,progress-.82)*8}px)`;

  if(progress>=1){
    timeoutPitch();
    return;
  }
  state.raf = requestAnimationFrame(tick);
}

function showKakushinHomerun(){
  const overlay=$('kakushinOverlay');
  const img=overlay?.querySelector('img');
  if(!overlay||!img)return;

  const imageUrl = pickKakushinImageUrl();
  if(!imageUrl) return;

  img.src=imageUrl;
  overlay.classList.remove('show');
  void overlay.offsetWidth;
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden','false');
  setTimeout(()=>{
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden','true');
  },1650);
}

function finish(type){
  if(!state.active) return;

  state.active = false;
  cancelAnimationFrame(state.raf);
  clearPitcherAnimation();
  $('ball').style.opacity = '0';
  updateKeyboardGuide();

  const result = $('result');
  result.className = '';
  void result.offsetWidth;

  let text = '';
  let dotClass = 'out';

  if(type==='hr'){
    text = 'ホームラン！';
    dotClass = 'hr';
    state.hrs++;
    $('hrs').textContent = state.hrs;
    playSfx('homerun');
    if(Math.random()<.30) showKakushinHomerun();
    const fly = document.createElement('div');
    fly.className = 'fly';
    $('game').appendChild(fly);
    setTimeout(()=>fly.remove(),1200);
  }else if(type==='hit'){
    text = 'ヒット！';
    dotClass = 'hit';
    playSfx('hit');
  }else if(type==='swing'){
    text = '空振り！';
    playSfx('strike');
  }else if(type==='strike'){
    text = '見逃しストライク！';
    playSfx('strike');
  }else{
    text = 'ボール！';
    dotClass = 'ball';
    beep(360,.12,'sine',.035);
  }

  const dot = $(`dot${state.pitchIndex}`);
  dot.classList.remove('current');
  dot.classList.add(dotClass);
  dot.textContent = type==='hr' ? 'HR' : type==='hit' ? 'H' : type==='ball' ? 'B' : '×';

  result.textContent = text;
  result.classList.add('show');
  $('jp').textContent = text;
  $('roman').textContent = '';
  $('time').textContent = '--';
  $('timerFill').style.transform = 'scaleX(1)';

  state.pitchIndex++;
  if(state.pitchIndex>=TOTAL_PITCHES){
    state.nextTimer = setTimeout(endChallenge,1200);
  }else{
    state.nextTimer = setTimeout(()=>{
      if(state.active || state.paused || !state.challenge) return;
      $('pitcher').src = PITCHER_FRAMES[0];
      markCurrentPitch();
      $('jp').textContent = `第${state.pitchIndex+1}球`;
      $('roman').textContent = 'Enterキーで投球';
      state.nextTimer = null;
    },800);
  }
}

function timeoutPitch(){
  finish(Math.random()<.70 ? 'strike' : 'ball');
}

function endChallenge(){
  state.challenge = false;
  state.paused = false;
  $('start').disabled = false;
  $('duration').disabled = false;
  $('timeoutBtn').disabled = true;
  $('pitcher').src = PITCHER_FRAMES[0];
  $('finalHR').textContent = state.hrs;

  let message = '';
  if(state.hrs===10) message = 'パーフェクト！ 10球全部ホームラン！';
  else if(state.hrs>=8) message = 'すごい！ ホームラン王クラス！';
  else if(state.hrs>=5) message = 'ナイスバッティング！ 半分以上ホームラン！';
  else if(state.hrs>=2) message = 'いい調子！ 次はもっと打てそう！';
  else message = 'もう一回挑戦してホームランを増やそう！';

  $('finalText').textContent = `10球中 ${state.hrs}本ホームラン！ ${message}`;
  $('summary').classList.add('show');
  $('jp').textContent = 'チャレンジ終了！';
  $('roman').textContent = `10球中 ${state.hrs}本ホームラン`;
  updateKeyboardGuide();
}

/* =========================================================
   タイム
   ========================================================= */
function updateTimeoutChoiceUI(){
  const seconds = state.selectedDuration ?? +$('duration').value;
  $('timeoutCurrent').textContent = `${seconds}秒`;
  $$('.timeoutChoices button').forEach(button=>{
    button.classList.toggle('selected',+button.dataset.seconds===seconds);
  });
}

function openTimeout(){
  if(!state.challenge || state.paused) return;

  state.paused = true;
  state.selectedDuration = +$('duration').value;
  if(state.active){
    cancelAnimationFrame(state.raf);
    clearPitcherAnimation();
    state.pausedElapsed = (performance.now()-state.startAt)/1000;
    state.pauseBallState = {
      top:$('ball').style.top,
      transform:$('ball').style.transform,
      filter:$('ball').style.filter,
      opacity:$('ball').style.opacity
    };
  }else{
    state.pausedElapsed = 0;
    state.pauseBallState = null;
  }
  updateTimeoutChoiceUI();
  showModal('timeoutModal');
}

function resumeTimeout(){
  if(!state.paused) return;
  const wasActive = state.active;
  const oldDuration = state.duration;

  if(state.selectedDuration){
    $('duration').value = String(state.selectedDuration);
    state.duration = state.selectedDuration;
  }
  hideModal('timeoutModal');
  state.paused = false;

  if(wasActive){
    const progress = oldDuration>0 ? Math.min(1,state.pausedElapsed/oldDuration) : 0;
    state.startAt = performance.now() - progress*state.duration*1000;
    if(state.pauseBallState){
      Object.assign($('ball').style,state.pauseBallState);
    }
    state.raf = requestAnimationFrame(tick);
  }
}

/* =========================================================
   モーダル共通
   ========================================================= */
function showModal(id){
  const modal = $(id);
  modal.classList.add('show');
  modal.setAttribute('aria-hidden','false');
}
function hideModal(id){
  const modal = $(id);
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden','true');
}
function isModalOpen(){
  return ['wordModal','timeoutModal','appearanceModal'].some(id=>$(id)?.classList.contains('show'));
}

/* =========================================================
   キー入力 / イベント
   ========================================================= */
function handleGameKeydown(e){
  if(isModalOpen()) return;

  if(e.code==='Space'){
    e.preventDefault();
    if(!state.challenge && !state.active) resetChallenge();
    return;
  }

  if(e.key==='Enter'){
    e.preventDefault();
    if(state.challenge && !state.active && state.pitchIndex<TOTAL_PITCHES) startPitch();
    return;
  }

  if(!state.active || e.key.length!==1) return;
  const key = e.key.toLowerCase();
  const candidate = state.typedBuffer + key;
  const matches = matchingTargets(candidate);

  if(matches.length){
    beep(520,.035,'sine',.018);
    state.typedBuffer = candidate;
    state.target = matches[0];
    renderWord();
    if(state.acceptedTargets.includes(state.typedBuffer)){
      finish(state.misses===0 ? 'hr' : state.misses<=2 ? 'hit' : 'swing');
    }
  }else{
    state.misses++;
    $('miss').textContent = state.misses;
    beep(95,.07,'square',.035);
    $('roman').classList.remove('wrongFlash');
    void $('roman').offsetWidth;
    $('roman').classList.add('wrongFlash');
  }
}

function bindEvents(){
  window.addEventListener('keydown',handleGameKeydown);
  window.addEventListener('keydown',e=>{
    if(e.key!=='Escape') return;
    ['wordModal','timeoutModal','appearanceModal'].forEach(id=>{
      if($(id)?.classList.contains('show')) hideModal(id);
    });
  },true);

  $('start').addEventListener('click',resetChallenge);
  $('again').addEventListener('click',resetChallenge);

  $('wordSettingsBtn').addEventListener('click',openWordModal);
  $('closeWordsBtn').addEventListener('click',()=>hideModal('wordModal'));
  $('closeWordsX').addEventListener('click',()=>hideModal('wordModal'));
  $('saveWordsBtn').addEventListener('click',saveCustomWords);
  $('resetWordsBtn').addEventListener('click',resetWords);
  $('addWordRowBtn').addEventListener('click',()=>addWordRow('','',true));

  $('timeoutBtn').addEventListener('click',openTimeout);
  $('resumeBtn').addEventListener('click',resumeTimeout);
  $$('.timeoutChoices button').forEach(button=>{
    button.addEventListener('click',()=>{
      state.selectedDuration = +button.dataset.seconds;
      updateTimeoutChoiceUI();
    });
  });

  $('backgroundSelect').addEventListener('change',e=>selectStadium(e.target.value));
  $('appearanceBgSelect').addEventListener('change',e=>selectStadium(e.target.value));
  $('appearanceBtn').addEventListener('click',()=>{
    syncAppearanceControls();
    renderCustomStadiumList();
    updateBallReleasePreview();
    if($('ballReleasePreview')) $('ballReleasePreview').style.display='block';
    showModal('appearanceModal');
  });
  $('appearanceCloseX').addEventListener('click',()=>{
    if($('ballReleasePreview')) $('ballReleasePreview').style.display='none';
    hideModal('appearanceModal');
  });
  $('appearanceDoneBtn').addEventListener('click',()=>{
    if($('ballReleasePreview')) $('ballReleasePreview').style.display='none';
    hideModal('appearanceModal');
  });
  $('appearanceResetBtn').addEventListener('click',resetCurrentAppearance);

  [
    'bgPosX','bgPosY','bgScale',
    'pitcherPosX','pitcherPosY','pitcherScale','ballReleaseY',
    'keyboardPosX','keyboardPosY','keyboardScale',
    'wordPanelPosX','wordPanelPosY','wordPanelScale'
  ].forEach(id=>$(id).addEventListener('input',updateAppearanceFromControls));

  $('stadiumFileInput').addEventListener('change',e=>{
    state.selectedCustomFile = e.target.files?.[0] || null;
    $('stadiumFileName').textContent = state.selectedCustomFile ? state.selectedCustomFile.name : '画像未選択';
  });
  $('stadiumUploadBtn').addEventListener('click',addCustomStadium);

  $$('.modal').forEach(modal=>{
    modal.addEventListener('click',e=>{
      if(e.target===modal && modal.id!=='timeoutModal'){
        if(modal.id==='appearanceModal' && $('ballReleasePreview')) $('ballReleasePreview').style.display='none';
        hideModal(modal.id);
      }
    });
  });
}

/* =========================================================
   初期化
   ========================================================= */
async function init(){
  $('pitcher').src = PITCHER_FRAMES[0];
  $('timeoutBtn').disabled = true;
  buildPitchDots();
  updateKeyboardGuide();
  bindEvents();
  await initStadiums();
}

init().catch(error=>{
  console.error('初期化エラー:',error);
  alert('ゲームの初期化中にエラーが発生しました。ページを再読み込みしてください。');
});


/* ===== v28 見た目変更パネルのドラッグ移動 ===== */
const appearanceDragState={
  dragging:false,
  pointerId:null,
  offsetX:0,
  offsetY:0
};

function clampAppearanceCard(left,top){
  const card=document.querySelector('.appearanceCard');
  if(!card)return {left,top};

  const margin=8;
  const w=card.offsetWidth;
  const h=card.offsetHeight;

  const minLeft=margin;
  const maxLeft=Math.max(margin,window.innerWidth-w-margin);
  const minTop=margin;
  const maxTop=Math.max(margin,window.innerHeight-h-margin);

  return {
    left:Math.min(Math.max(left,minLeft),maxLeft),
    top:Math.min(Math.max(top,minTop),maxTop)
  };
}

function startAppearanceDrag(e){
  if(e.button!==undefined && e.button!==0)return;

  const card=document.querySelector('.appearanceCard');
  const handle=$('appearanceDragHandle');
  if(!card||!handle)return;

  const rect=card.getBoundingClientRect();

  // 初回ドラッグ時に中央配置の transform を解除し、
  // 現在見えている位置を px 座標へ変換する。
  card.style.left=`${rect.left}px`;
  card.style.top=`${rect.top}px`;
  card.style.transform='none';

  appearanceDragState.dragging=true;
  appearanceDragState.pointerId=e.pointerId;
  appearanceDragState.offsetX=e.clientX-rect.left;
  appearanceDragState.offsetY=e.clientY-rect.top;

  card.classList.add('isDragging');

  if(handle.setPointerCapture && e.pointerId!==undefined){
    handle.setPointerCapture(e.pointerId);
  }
  e.preventDefault();
}

function moveAppearanceDrag(e){
  if(!appearanceDragState.dragging)return;
  if(appearanceDragState.pointerId!==null &&
     e.pointerId!==undefined &&
     e.pointerId!==appearanceDragState.pointerId)return;

  const card=document.querySelector('.appearanceCard');
  if(!card)return;

  const desiredLeft=e.clientX-appearanceDragState.offsetX;
  const desiredTop=e.clientY-appearanceDragState.offsetY;
  const p=clampAppearanceCard(desiredLeft,desiredTop);

  card.style.left=`${p.left}px`;
  card.style.top=`${p.top}px`;
  e.preventDefault();
}

function endAppearanceDrag(e){
  if(!appearanceDragState.dragging)return;
  if(appearanceDragState.pointerId!==null &&
     e.pointerId!==undefined &&
     e.pointerId!==appearanceDragState.pointerId)return;

  const card=document.querySelector('.appearanceCard');
  const handle=$('appearanceDragHandle');

  appearanceDragState.dragging=false;
  appearanceDragState.pointerId=null;
  if(card)card.classList.remove('isDragging');

  if(handle && handle.releasePointerCapture && e.pointerId!==undefined){
    try{handle.releasePointerCapture(e.pointerId)}catch(err){}
  }
}

function resetAppearancePanelPosition(){
  const card=document.querySelector('.appearanceCard');
  if(!card)return;
  card.style.left='50%';
  card.style.top='50%';
  card.style.transform='translate(-50%,-50%)';
}

function keepAppearancePanelOnScreen(){
  const modal=$('appearanceModal');
  const card=document.querySelector('.appearanceCard');
  if(!modal||!card||!modal.classList.contains('show'))return;

  const rect=card.getBoundingClientRect();

  // 中央配置のままなら何もしない。
  if(card.style.transform!=='none')return;

  const p=clampAppearanceCard(rect.left,rect.top);
  card.style.left=`${p.left}px`;
  card.style.top=`${p.top}px`;
}

if($('appearanceDragHandle')){
  $('appearanceDragHandle').addEventListener('pointerdown',startAppearanceDrag);
  $('appearanceDragHandle').addEventListener('pointermove',moveAppearanceDrag);
  $('appearanceDragHandle').addEventListener('pointerup',endAppearanceDrag);
  $('appearanceDragHandle').addEventListener('pointercancel',endAppearanceDrag);
  updateBallReleasePreview();
}

window.addEventListener('resize',keepAppearancePanelOnScreen);


if($('kakushinFileInput')){
  $('kakushinFileInput').addEventListener('change',e=>{
    selectedKakushinFile = e.target.files?.[0] || null;
    if($('kakushinFileName')){
      $('kakushinFileName').textContent =
        selectedKakushinFile ? selectedKakushinFile.name : '画像未選択';
    }
  });
}

if($('kakushinAddBtn')){
  $('kakushinAddBtn').addEventListener('click',()=>{
    addKakushinImage();
  });
}

initKakushinImages();

