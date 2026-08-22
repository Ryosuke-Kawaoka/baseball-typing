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


const BG_STORAGE_KEY='typingBaseballBackgroundV1';

function applyBackground(name){
  const app=$('app');
  if(!app)return;
  const bg=name==='dodgers'?'dodgers':'escon';

  app.classList.remove('bg-escon','bg-dodgers');
  app.classList.add(`bg-${bg}`);

  if($('backgroundSelect')){
    $('backgroundSelect').value=bg;
  }

  try{
    localStorage.setItem(BG_STORAGE_KEY,bg);
  }catch(e){}
}

function loadBackground(){
  let bg='escon';
  try{
    const saved=localStorage.getItem(BG_STORAGE_KEY);
    if(saved==='escon' || saved==='dodgers'){
      bg=saved;
    }
  }catch(e){}
  applyBackground(bg);
}


const sfx = {
  hit: new Audio('hit.mp3'),
  homerun: new Audio('homerun.mp3'),
  strike: new Audio('strike.mp3')
};
Object.values(sfx).forEach(a => a.preload = 'auto');

let active=false;
let challenge=false;
let target='';
let acceptedTargets=[];
let typedBuffer='';
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


/* ===== 柔軟なローマ字入力 =====
   例:
   し = shi / si
   しゃ = sha / sya
   しゅ = shu / syu
   しょ = sho / syo
   ち = chi / ti
   つ = tsu / tu
   ふ = fu / hu
   じ = ji / zi
   ん = n / nn
   などを許可する。
*/
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
  'わ':['wa'],'を':['wo'],
  'ん':['n','nn'],
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
  'でぃ':['dhi','dxi'],
  'びゃ':['bya'],'びゅ':['byu'],'びょ':['byo'],
  'ぴゃ':['pya'],'ぴゅ':['pyu'],'ぴょ':['pyo'],

  'ぁ':['xa','la'],'ぃ':['xi','li'],'ぅ':['xu','lu'],'ぇ':['xe','le'],'ぉ':['xo','lo'],
  'ゃ':['xya','lya'],'ゅ':['xyu','lyu'],'ょ':['xyo','lyo'],
  'っ':['xtu','ltu']
};

function katakanaToHiragana(s){
  return s.replace(/[\u30a1-\u30f6]/g,ch =>
    String.fromCharCode(ch.charCodeAt(0)-0x60)
  );
}

function combineVariants(parts, limit=512){
  let result=[''];
  for(const choices of parts){
    const next=[];
    for(const base of result){
      for(const c of choices){
        next.push(base+c);
        if(next.length>=limit) break;
      }
      if(next.length>=limit) break;
    }
    result=next;
  }
  return [...new Set(result)];
}

function kanaToRomajiVariants(source){
  let s=katakanaToHiragana(String(source||'').trim().toLowerCase());

  // すでにローマ字で登録されている旧データは、そのまま使いつつ
  // よくある表記揺れも追加する
  if(/^[a-z]+$/.test(s)){
    const set=new Set([s]);
    const swaps=[
      ['shi','si'],['si','shi'],
      ['sha','sya'],['sya','sha'],
      ['shu','syu'],['syu','shu'],
      ['sho','syo'],['syo','sho'],
      ['chi','ti'],['ti','chi'],
      ['cha','tya'],['tya','cha'],
      ['chu','tyu'],['tyu','chu'],
      ['cho','tyo'],['tyo','cho'],
      ['tsu','tu'],['tu','tsu'],
      ['fu','hu'],['hu','fu'],
      ['ji','zi'],['zi','ji'],
      ['dhi','dxi'],['dxi','dhi']
    ];
    // 複数箇所の表記揺れにもある程度対応
    let pool=[s];
    for(let round=0;round<3;round++){
      const add=[];
      for(const v of pool){
        for(const [a,b] of swaps){
          if(v.includes(a)) add.push(v.replaceAll(a,b));
        }
      }
      pool=[...new Set([...pool,...add])].slice(0,512);
    }
    pool.forEach(v=>set.add(v));

    // 「ん」は n / nn の両方を許可（旧ローマ字登録にも対応）
    // 例: densha / dennsha, kan / kann
    [...set].forEach(v=>{
      if(v.includes('nn')) set.add(v.replaceAll('nn','n'));

      // n の次が母音・y・n 以外、または語末なら「ん」とみなし nn 版も作る
      let doubled=v.replace(/n(?=[^aiueoyn]|$)/g,'nn');
      set.add(doubled);
    });
    return [...set].slice(0,512);
  }

  const parts=[];
  for(let i=0;i<s.length;){
    // 小さい「っ」: 次の音の先頭子音を重ねる
    if(s[i]==='っ'){
      let nextKey=s.slice(i+1,i+3);
      let nextChoices=ROMAJI_MAP[nextKey];
      if(!nextChoices){
        nextKey=s[i+1];
        nextChoices=ROMAJI_MAP[nextKey];
      }
      if(nextChoices){
        const consonants=[...new Set(nextChoices.map(v=>v[0]).filter(c=>/[a-z]/.test(c)))];
        parts.push(consonants.length?consonants:['xtu','ltu']);
        i++;
        continue;
      }
    }

    const two=s.slice(i,i+2);
    if(ROMAJI_MAP[two]){
      parts.push(ROMAJI_MAP[two]);
      i+=2;
      continue;
    }
    const one=s[i];
    if(ROMAJI_MAP[one]){
      parts.push(ROMAJI_MAP[one]);
      i++;
      continue;
    }

    // 未対応文字はそのまま（入力不能になるのを避ける）
    parts.push([one]);
    i++;
  }
  let variants=combineVariants(parts);

  // 複合音「でぃ / ディ」は dhi / dxi のどちらも必ず許可する
  // 例: フレディ → furedhi / furedxi
  const expanded=new Set(variants);
  for(const v of variants){
    if(v.includes('dhi')) expanded.add(v.replaceAll('dhi','dxi'));
    if(v.includes('dxi')) expanded.add(v.replaceAll('dxi','dhi'));
  }
  return [...expanded].slice(0,512);
}

function prepareTypingTargets(source){
  acceptedTargets=kanaToRomajiVariants(source);
  if(!acceptedTargets.length) acceptedTargets=[String(source||'').toLowerCase()];
  // 画面表示は一番一般的な候補
  target=acceptedTargets[0];
  typedBuffer='';
  pos=0;
}

function matchingTargets(buffer){
  return acceptedTargets.filter(v=>v.startsWith(buffer));
}

function chooseDisplayTarget(){
  const matches=matchingTargets(typedBuffer);
  return matches[0] || target;
}


function getNextGuideKeys(){
  const matches=matchingTargets(typedBuffer);
  return [...new Set(matches.map(v=>v[typedBuffer.length]).filter(Boolean))];
}
function updateKeyboardGuide(){
  document.querySelectorAll('.key').forEach(el=>el.classList.remove('next'));
  if(!$('nextKeyLabel')) return;
  if(!active){$('nextKeyLabel').textContent='-';return;}
  const keys=getNextGuideKeys();
  $('nextKeyLabel').textContent=keys.length?keys.map(k=>k.toUpperCase()).join(' / '):'-';
  keys.forEach(k=>{const el=document.querySelector(`.key[data-key="${k}"]`);if(el)el.classList.add('next')});
}
function flashKeyboardKey(key,type){
  const el=document.querySelector(`.key[data-key="${key}"]`);
  if(!el)return;
  el.classList.remove('correct','wrong');void el.offsetWidth;el.classList.add(type);
  setTimeout(()=>el.classList.remove(type),220);
}

function renderWord(){
  const displayTarget=chooseDisplayTarget();
  target=displayTarget;
  let h='';
  for(let i=0;i<displayTarget.length;i++){
    const c=displayTarget[i];
    h += i<typedBuffer.length
      ? `<span class="done">${c}</span>`
      : i===typedBuffer.length
        ? `<span class="current">${c}</span>`
        : c;
  }
  $('roman').innerHTML=h;
  $('jp').textContent=jp;
  updateKeyboardGuide();
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
  if($('timeoutBtn')) $('timeoutBtn').disabled=false;
  $('timeoutBtn').disabled=false;
  $('jp').textContent='プレイボール！';
  $('roman').textContent='Enterキーで第1球を投げる';
  updateKeyboardGuide();
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
  prepareTypingTargets(w[1]);

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
  if(!active || paused) return;

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
  updateKeyboardGuide();
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
  if($('timeoutBtn')) $('timeoutBtn').disabled=true;
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
  const candidate=typedBuffer+k;
  const matches=matchingTargets(candidate);

  if(matches.length){
    beep(520,.035,'sine',.018);
    flashKeyboardKey(k,'correct');
    typedBuffer=candidate;
    pos=typedBuffer.length;

    // 入力した経路に合うローマ字表記へ表示も自動で切り替える
    target=matches[0];
    renderWord();

    if(acceptedTargets.includes(typedBuffer)){
      finish(misses===0?'hr':misses<=2?'hit':'swing');
    }
  }else{
    flashKeyboardKey(k,'wrong');
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

updateKeyboardGuide();


if($('backgroundSelect')){
  $('backgroundSelect').addEventListener('change',e=>{
    applyBackground(e.target.value);
  });
}
loadBackground();
