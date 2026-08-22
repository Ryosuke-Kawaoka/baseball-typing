const frames = Array.from({length:10}, (_,i) => `pitcher_frames/frame_${String(i+1).padStart(2,'0')}.png`);

const defaultWords=[
  ['ねこ','neko'],['いぬ','inu'],['すし','sushi'],['くるま','kuruma'],
  ['さくら','sakura'],['でんしゃ','densha'],['やきゅう','yakyuu'],
  ['りんご','ringo'],['うさぎ','usagi'],['ひこうき','hikouki'],
  ['きょうりゅう','kyouryuu'],['しょうぼうしゃ','shoubousha']
];

const WORD_STORAGE_KEY='typingBaseballCustomWordsV1';

function loadWords(){
  try{
    const saved=JSON.parse(localStorage.getItem(WORD_STORAGE_KEY));
    if(Array.isArray(saved) && saved.length){
      return saved.filter(w=>Array.isArray(w) && w.length>=2 && String(w[0]).trim() && String(w[1]).trim());
    }
  }catch(e){}
  return defaultWords.map(w=>[...w]);
}

let words=loadWords();

const $ = id => document.getElementById(id);

const sfx = {
  hit: new Audio('hit.mp3'),
  homerun: new Audio('homerun.mp3'),
  strike: new Audio('strike.mp3')
};
Object.values(sfx).forEach(a => a.preload = 'auto');

let active=false;
let challenge=false;
let target='';
let jp='';
let pos=0;
let misses=0;
let hrs=0;
let pitchIndex=0;
let startAt=0;
let duration=10;
let raf=null;
let animTimers=[];
let nextTimer=null;
let paused=false;
let pauseStartedAt=0;
let pausedElapsed=0;
let pauseBallState=null;
let selectedDuration=null;
const BALL_RELEASE_Y_OFFSET = -10;

$('pitcher').src=frames[0];

function playSfx(name){
  const a=sfx[name];
  if(!a) return;
  try{
    a.pause();
    a.currentTime=0;
    a.play().catch(()=>{});
  }catch(e){}
}

function beep(freq=440,dur=.08,type='sine',gain=.04){
  try{
    const A=window.AudioContext||window.webkitAudioContext;
    const c=window._ac||(window._ac=new A());
    const o=c.createOscillator(),g=c.createGain();
    o.type=type;o.frequency.value=freq;g.gain.value=gain;
    o.connect(g);g.connect(c.destination);o.start();
    g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+dur);
    o.stop(c.currentTime+dur);
  }catch(e){}
}

function clearAnim(){
  animTimers.forEach(clearTimeout);
  animTimers=[];
}

/* 画像1〜10を順番に再生。
   9〜10あたりでボールが手を離れるイメージ。 */
function pitcherAnimation(){
  clearAnim();
  const frameMs=90;
  frames.forEach((src,i)=>{
    animTimers.push(setTimeout(()=>{
      $('pitcher').src=src;
      if(i===8) beep(180,.05,'square',.025);
    }, i*frameMs));
  });
}



const MAX_WORDS=100;

function makeWordRow(label='',kana=''){
  const row=document.createElement('div');
  row.className='wordRow';

  const labelInput=document.createElement('input');
  labelInput.type='text';
  labelInput.className='wordLabelInput';
  labelInput.placeholder='表示する文字';
  labelInput.value=label;

  const kanaInput=document.createElement('input');
  kanaInput.type='text';
  kanaInput.className='wordKanaInput';
  kanaInput.placeholder='ふりがな';
  kanaInput.value=kana;

  const del=document.createElement('button');
  del.type='button';
  del.className='wordDeleteBtn';
  del.textContent='×';
  del.title='削除';

  del.addEventListener('click',()=>{
    row.remove();
    if(!$('wordRows').children.length) addWordRow();
    updateWordCount();
  });

  // 改行された一覧を貼り付けた場合、1行ずつ下へ展開
  labelInput.addEventListener('paste',e=>handleMultiLinePaste(e,'label',row));
  kanaInput.addEventListener('paste',e=>handleMultiLinePaste(e,'kana',row));

  labelInput.addEventListener('input',updateWordCount);
  kanaInput.addEventListener('input',updateWordCount);

  row.append(labelInput,kanaInput,del);
  return row;
}

function addWordRow(label='',kana='',focus=false){
  if($('wordRows').children.length>=MAX_WORDS)return null;
  const row=makeWordRow(label,kana);
  $('wordRows').appendChild(row);
  updateWordCount();
  if(focus) row.querySelector('.wordLabelInput').focus();
  return row;
}

function handleMultiLinePaste(e,type,currentRow){
  const text=e.clipboardData?.getData('text');
  if(!text || !/[\r\n]/.test(text)) return;

  e.preventDefault();
  const lines=text.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
  if(!lines.length)return;

  const rows=[...$('wordRows').children];
  let index=rows.indexOf(currentRow);

  lines.forEach((line,i)=>{
    if(index+i>=MAX_WORDS)return;
    let row=$('wordRows').children[index+i];
    if(!row) row=addWordRow();

    // 「表示,ふりがな」形式を貼った場合は両方に自動入力
    const comma=line.indexOf(',');
    if(comma>=0){
      row.querySelector('.wordLabelInput').value=line.slice(0,comma).trim();
      row.querySelector('.wordKanaInput').value=line.slice(comma+1).trim();
    }else{
      const target=type==='label'
        ? row.querySelector('.wordLabelInput')
        : row.querySelector('.wordKanaInput');
      target.value=line;
    }
  });
  updateWordCount();
}

function fillWordRows(list){
  $('wordRows').innerHTML='';
  list.slice(0,MAX_WORDS).forEach(([label,kana])=>addWordRow(label,kana));
  if(!$('wordRows').children.length)addWordRow();
  updateWordCount();
}

function collectWordRows(){
  const result=[];
  [...$('wordRows').children].forEach(row=>{
    const label=row.querySelector('.wordLabelInput').value.trim();
    const kana=row.querySelector('.wordKanaInput').value.trim();
    if(!label && !kana)return;
    if(!label || !kana)return;
    result.push([label,kana]);
  });
  return result.slice(0,MAX_WORDS);
}

function updateWordCount(){
  const count=collectWordRows().length;
  $('wordCount').textContent=count;
}

function openWordModal(){
  if(active)return;
  fillWordRows(words);
  $('wordModal').classList.add('show');
  $('wordModal').setAttribute('aria-hidden','false');
}

function closeWordModal(){
  $('wordModal').classList.remove('show');
  $('wordModal').setAttribute('aria-hidden','true');
}

function saveCustomWords(){
  const parsed=collectWordRows();
  if(!parsed.length){
    alert('「表示する文字」と「ふりがな」を1つ以上登録してください。');
    return;
  }
  words=parsed;
  localStorage.setItem(WORD_STORAGE_KEY,JSON.stringify(words));
  closeWordModal();
  $('jp').textContent=`単語を${words.length}語保存しました`;
  $('roman').textContent='スペースキーでゲームスタート';
}

function resetWords(){
  words=defaultWords.map(w=>[...w]);
  localStorage.removeItem(WORD_STORAGE_KEY);
  fillWordRows(words);
}


function updateTimeoutChoiceUI(){
  const secs=selectedDuration ?? +$('duration').value;
  $('timeoutCurrent').textContent=`${secs}秒`;
  document.querySelectorAll('.timeoutChoices button').forEach(btn=>{
    btn.classList.toggle('selected', +btn.dataset.seconds===secs);
  });
}

function openTimeout(){
  if(!challenge || paused) return;

  paused=true;
  selectedDuration=+$('duration').value;

  // 投球中なら現在位置で止める
  if(active){
    cancelAnimationFrame(raf);
    clearAnim();

    const now=performance.now();
    pausedElapsed=(now-startAt)/1000;
    pauseBallState={
      top:$('ball').style.top,
      transform:$('ball').style.transform,
      filter:$('ball').style.filter,
      opacity:$('ball').style.opacity
    };
  }else{
    pausedElapsed=0;
    pauseBallState=null;
  }

  $('timeoutModal').classList.add('show');
  $('timeoutModal').setAttribute('aria-hidden','false');
  updateTimeoutChoiceUI();
}

function resumeTimeout(){
  if(!paused) return;

  const wasActive=active;
  const oldDuration=duration;

  if(selectedDuration){
    $('duration').value=String(selectedDuration);
    duration=selectedDuration;
  }

  $('timeoutModal').classList.remove('show');
  $('timeoutModal').setAttribute('aria-hidden','true');
  paused=false;

  // 投球中なら、新しい制限時間に合わせて残り時間を再計算して再開
  if(wasActive){
    // 既に経過していた割合を保って、新しい時間へ置き換える
    const progress = oldDuration > 0 ? Math.min(1, pausedElapsed / oldDuration) : 0;
    const newElapsed = progress * duration;
    startAt=performance.now()-(newElapsed*1000);

    if(pauseBallState){
      $('ball').style.top=pauseBallState.top;
      $('ball').style.transform=pauseBallState.transform;
      $('ball').style.filter=pauseBallState.filter;
      $('ball').style.opacity=pauseBallState.opacity;
    }

    raf=requestAnimationFrame(tick);
  }else{
    $('roman').textContent='Enterキーで投球';
  }
}

function renderWord(){
  let h='';
  for(let i=0;i<target.length;i++){
    const c=target[i];
    h += i<pos
      ? `<span class="done">${c}</span>`
      : i===pos
        ? `<span class="current">${c}</span>`
        : c;
  }
  $('roman').innerHTML=h;
  $('jp').textContent=jp;
}

function buildDots(){
  const box=$('pitchDots');
  box.innerHTML='';
  for(let i=0;i<10;i++){
    const d=document.createElement('div');
    d.className='pitchDot';
    d.id='dot'+i;
    d.textContent=i+1;
    box.appendChild(d);
  }
}

function markCurrent(){
  document.querySelectorAll('.pitchDot').forEach(d=>d.classList.remove('current'));
  if(pitchIndex<10) $('dot'+pitchIndex).classList.add('current');
}

function resetChallenge(){
  cancelAnimationFrame(raf);
  clearAnim();
  clearTimeout(nextTimer);
  active=false;
  paused=false;
  challenge=true;
  hrs=0;
  pitchIndex=0;
  $('hrs').textContent='0';
  $('pitchNo').textContent='0';
  $('pitcher').src=frames[0];
  buildDots();
  markCurrent();
  $('summary').classList.remove('show');
  $('start').disabled=true;
  $('duration').disabled=true;
  $('timeoutBtn').disabled=false;
  $('jp').textContent='プレイボール！';
  $('roman').textContent='Enterキーで第1球を投げる';
}

function startPitch(){
  if(active || paused || !challenge || pitchIndex>=10) return;

  // 前の球の終了後タイマーが残っていると、
  // 投球中に「Enterキーで投球」が上書き表示されるため解除する
  clearTimeout(nextTimer);
  nextTimer=null;

  active=true;
  misses=0;
  pos=0;
  $('miss').textContent='0';

  duration=+$('duration').value;
  const w=words[Math.floor(Math.random()*words.length)];
  jp=w[0];
  target=w[1];

  $('pitchNo').textContent=pitchIndex+1;
  markCurrent();
  renderWord();

  pitcherAnimation();

  startAt=performance.now();
  $('ball').style.opacity='1';
  $('ball').style.top=`calc(8% + ${BALL_RELEASE_Y_OFFSET}px)`;
  $('ball').style.transform='translate(-50%,-50%) scale(.55)';
  $('ball').style.filter='blur(0px)';
  raf=requestAnimationFrame(tick);
}

function tick(now){
  if(!active || paused) return;

  const e=(now-startAt)/1000;
  const p=Math.min(1,e/duration);
  const rem=Math.max(0,duration-e);

  $('time').textContent=rem.toFixed(1);
  $('timerFill').style.transform=`scaleX(${1-p})`;

  const scale=.55+p*10.5;
  const top=8+p*65;
  $('ball').style.top=`calc(${top}% + ${BALL_RELEASE_Y_OFFSET}px)`;
  $('ball').style.transform=`translate(-50%,-50%) scale(${scale})`;
  $('ball').style.filter=`blur(${Math.max(0,p-.82)*8}px)`;

  if(p>=1){
    timeoutPitch();
    return;
  }
  raf=requestAnimationFrame(tick);
}


function showKakushinHomerun(){
  const overlay=$('kakushinOverlay');
  if(!overlay)return;
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
  if(!active) return;

  active=false;
  cancelAnimationFrame(raf);
  clearAnim();
  $('ball').style.opacity='0';

  const r=$('result');
  r.className='';
  void r.offsetWidth;

  let text='';
  let cls='out';

  if(type==='hr'){
    text='ホームラン！';
    cls='hr';
    hrs++;
    $('hrs').textContent=hrs;
    playSfx('homerun');
    if(Math.random()<0.30){
      showKakushinHomerun();
    }

    const f=document.createElement('div');
    f.className='fly';
    $('game').appendChild(f);
    setTimeout(()=>f.remove(),1200);
  }else if(type==='hit'){
    text='ヒット！';
    cls='hit';
    playSfx('hit');
  }else if(type==='swing'){
    text='空振り！';
    playSfx('strike');
  }else if(type==='strike'){
    text='見逃しストライク！';
    playSfx('strike');
  }else{
    text='ボール！';
    cls='ball';
    beep(360,.12,'sine',.035);
  }

  const d=$('dot'+pitchIndex);
  d.classList.remove('current');
  d.classList.add(cls);
  d.textContent=type==='hr'?'HR':type==='hit'?'H':type==='ball'?'B':'×';

  r.textContent=text;
  r.classList.add('show');
  $('jp').textContent=text;
  $('roman').textContent='';
  $('time').textContent='--';
  $('timerFill').style.transform='scaleX(1)';

  pitchIndex++;

  if(pitchIndex>=10){
    nextTimer=setTimeout(endChallenge,1200);
  }else{
    nextTimer=setTimeout(()=>{
      // すでに次の投球が始まっていたら案内表示で上書きしない
      if(active || paused || !challenge) return;
      $('pitcher').src=frames[0];
      markCurrent();
      $('jp').textContent=`第${pitchIndex+1}球`;
      $('roman').textContent='Enterキーで投球';
      nextTimer=null;
    },800);
  }
}

function timeoutPitch(){
  finish(Math.random()<.7?'strike':'ball');
}

function endChallenge(){
  challenge=false;
  paused=false;
  $('start').disabled=false;
  $('duration').disabled=false;
  $('timeoutBtn').disabled=true;
  $('pitcher').src=frames[0];
  $('finalHR').textContent=hrs;

  let t='';
  if(hrs===10) t='パーフェクト！ 10球全部ホームラン！';
  else if(hrs>=8) t='すごい！ ホームラン王クラス！';
  else if(hrs>=5) t='ナイスバッティング！ 半分以上ホームラン！';
  else if(hrs>=2) t='いい調子！ 次はもっと打てそう！';
  else t='もう一回挑戦してホームランを増やそう！';

  $('finalText').textContent=`10球中 ${hrs}本ホームラン！ ${t}`;
  $('summary').classList.add('show');
  $('jp').textContent='チャレンジ終了！';
  $('roman').textContent=`10球中 ${hrs}本ホームラン`;
}

window.addEventListener('keydown',e=>{
  if(($('wordModal') && $('wordModal').classList.contains('show')) || ($('timeoutModal') && $('timeoutModal').classList.contains('show'))) return;
  if(e.code==='Space'){
    e.preventDefault();
    if(!challenge && !active) resetChallenge();
    return;
  }

  if(e.key==='Enter'){
    e.preventDefault();
    if(challenge && !active && pitchIndex<10) startPitch();
    return;
  }

  if(!active || e.key.length!==1) return;

  const k=e.key.toLowerCase();

  if(k===target[pos]){
    beep(520,.035,'sine',.018);
    pos++;
    renderWord();
    if(pos>=target.length){
      finish(misses===0?'hr':misses===1?'hit':'swing');
    }
  }else{
    misses++;
    $('miss').textContent=misses;
    beep(95,.07,'square',.035);
    $('roman').classList.remove('wrongFlash');
    void $('roman').offsetWidth;
    $('roman').classList.add('wrongFlash');
  }
});

$('start').addEventListener('click',resetChallenge);
$('again').addEventListener('click',resetChallenge);

buildDots();


$('wordSettingsBtn').addEventListener('click',openWordModal);
$('closeWordsBtn').addEventListener('click',closeWordModal);
$('saveWordsBtn').addEventListener('click',saveCustomWords);
$('resetWordsBtn').addEventListener('click',resetWords);
$('wordModal').addEventListener('click',e=>{
  if(e.target===$('wordModal'))closeWordModal();
});

window.addEventListener('keydown',e=>{
  if(e.key==='Escape' && $('wordModal').classList.contains('show')){
    e.preventDefault();
    closeWordModal();
  }
},true);


$('addWordRowBtn').addEventListener('click',()=>addWordRow('','',true));
$('closeWordsX').addEventListener('click',closeWordModal);


$('timeoutBtn').disabled=true;

$('timeoutBtn').addEventListener('click',openTimeout);

document.querySelectorAll('.timeoutChoices button').forEach(btn=>{
  btn.addEventListener('click',()=>{
    selectedDuration=+btn.dataset.seconds;
    updateTimeoutChoiceUI();
  });
});

$('resumeBtn').addEventListener('click',resumeTimeout);
