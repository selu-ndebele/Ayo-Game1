(function(){
  const STARTING_PITS = [4,4,4,4,4,4,4,4,4,4,4,4];
  const SEED_STYLES = [
    { id:'ayo-brown', label:'Ayo Brown', className:'seed-ayo-brown' },
    { id:'ivory', label:'Ivory Cowrie', className:'seed-ivory' },
    { id:'black', label:'Ebony', className:'seed-black' },
    { id:'red', label:'Red Bean', className:'seed-red' },
    { id:'speckled', label:'Speckled', className:'seed-speckled' }
  ];

  const AI_LEVELS = [
    { id:'easy', label:'Easy' },
    { id:'medium', label:'Medium' },
    { id:'hard', label:'Hard' },
    { id:'expert', label:'Expert' }
  ];

  const TUTORIAL_STEPS = [
    {
      title: "1. The Board & Setup",
      content: "Ayo is played on 12 pits across 2 rows. Player 1 controls the bottom row (Pits 1–6) and Player 2/Computer controls the top row (Pits 7–12). Each pit starts with 4 seeds."
    },
    {
      title: "2. Counter-Clockwise Sowing",
      content: "Pick a pit on your side. Lift all its seeds and drop them one by one counter-clockwise into subsequent pits around the board."
    },
    {
      title: "3. Capturing Seeds",
      content: "If your last seed lands in an opponent's pit making its total count 2, 3, or 4 seeds, you capture those seeds. Subsequent adjacent pits with 2, 3, or 4 seeds are also captured in a chain."
    },
    {
      title: "4. Feeding Rule",
      content: "You cannot starve your opponent. If they have no seeds left, you must play a move that seeds their side if possible."
    },
    {
      title: "5. Victory",
      content: "The player who captures the majority of seeds (more than 24) wins the game."
    }
  ];

  const savedSeeds = JSON.parse(localStorage.getItem('ayo_selected_seeds') || '["ayo-brown","speckled"]');

  function createInitialPitContents(selectedIds){
    const defs = SEED_STYLES.filter(s => selectedIds.includes(s.id));
    const activeDefs = defs.length ? defs : [SEED_STYLES[0]];
    const pitContents = [];
    for(let pitIdx=0; pitIdx<12; pitIdx++){
      const seedsInPit = [];
      for(let sIdx=0; sIdx<4; sIdx++){
        const style = activeDefs[(pitIdx * 5 + sIdx * 3) % activeDefs.length];
        seedsInPit.push({ ...style, idNum: Math.random() });
      }
      pitContents.push(seedsInPit);
    }
    return pitContents;
  }

  const state = {
    pits: STARTING_PITS.slice(),
    pitSeeds: createInitialPitContents(savedSeeds),
    turn: 1,
    score1: 0,
    score2: 0,
    streak1: 0,
    streak2: 0,
    lastWinner: null,
    champion: null,
    sowing: false,
    gameOver: false,
    mode: null,
    aiLevel: 'medium',
    selectedSeeds: savedSeeds,
    onlineRole: null,
    localPlayer: null,
    tutorialStep: 0,
    roomCode: ''
  };

  let peer = null;
  let conn = null;
  let applyingRemote = false;

  const $ = (id) => document.getElementById(id);

  function safeAddListener(id, event, handler){
    const el = $(id);
    if(el) el.addEventListener(event, handler);
  }

  function owner(idx){ return idx < 6 ? 1 : 2; }
  function opponentOf(p){ return p === 1 ? 2 : 1; }
  function pitsOf(player){ return player === 1 ? [0,1,2,3,4,5] : [6,7,8,9,10,11]; }
  function sumPits(player){ return pitsOf(player).reduce((s,i)=> s + state.pits[i], 0); }
  function sumOf(pits, player){ return pitsOf(player).reduce((s,i)=> s + pits[i], 0); }

  function simMoveFeeds(pits, idx){
    const player = owner(idx);
    const opp = opponentOf(player);
    let seeds = pits[idx];
    let cur = idx;
    let fed = false;
    while(seeds>0){
      cur = (cur+1)%12;
      if(owner(cur)===opp) fed = true;
      seeds--;
    }
    return fed;
  }

  function simApplyMove(pits, idx, turn){
    let seeds = pits[idx];
    pits[idx] = 0;
    let cur = idx;
    while(seeds>0){
      cur = (cur+1)%12;
      pits[cur]++;
      seeds--;
    }
    const lastIdx = cur;
    const opponent = opponentOf(turn);
    let captured = 0;
    const isCapturable = (v) => v === 2 || v === 3 || v === 4;
    if(owner(lastIdx) === opponent && isCapturable(pits[lastIdx])){
      let chainIdx = lastIdx;
      while(chainIdx >= 0 && owner(chainIdx) === opponent && isCapturable(pits[chainIdx])){
        captured += pits[chainIdx];
        pits[chainIdx] = 0;
        chainIdx--;
      }
    }
    return { pits, captured, lastIdx };
  }

  function legalMovesFor(pits, player){
    const opp = opponentOf(player);
    let legal = pitsOf(player).filter(i => pits[i] > 0);
    if(sumOf(pits, opp) === 0){
      const feeders = legal.filter(i => simMoveFeeds(pits, i));
      if(feeders.length > 0) legal = feeders;
    }
    return legal;
  }

  function aiChooseMove(){
    const player = 2;
    const legal = legalMovesFor(state.pits, player);
    if(legal.length === 0) return null;

    if(state.aiLevel === 'easy') return aiMoveEasy(legal, player);
    if(state.aiLevel === 'medium') return aiMoveMedium(legal, player);
    if(state.aiLevel === 'hard') return aiMoveHard(legal, player);
    if(state.aiLevel === 'expert') return aiMoveExpert(legal, player);

    return legal[Math.floor(Math.random() * legal.length)];
  }

  function aiMoveEasy(legal, player){
    if(Math.random() < 0.4) return legal[Math.floor(Math.random() * legal.length)];
    const nonCapturing = legal.filter(idx => {
      const copy = state.pits.slice();
      return simApplyMove(copy, idx, player).captured === 0;
    });
    const pool = nonCapturing.length ? nonCapturing : legal;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function aiMoveMedium(legal, player){
    const opp = 1;
    const scored = legal.map(idx => {
      const afterAI = state.pits.slice();
      const { captured } = simApplyMove(afterAI, idx, player);
      let oppBest = 0;
      legalMovesFor(afterAI, opp).forEach(oi => {
        const afterOpp = afterAI.slice();
        const res = simApplyMove(afterOpp, oi, opp);
        if(res.captured > oppBest) oppBest = res.captured;
      });
      return { idx, score: captured * 2 - oppBest + Math.random() * 0.3 };
    });
    scored.sort((a,b) => b.score - a.score);
    return scored[0].idx;
  }

  function aiMoveHard(legal, player){
    const opp = 1;
    let bestMove = legal[0];
    let bestScore = -Infinity;

    for(let idx of legal){
      const afterAI = state.pits.slice();
      const { captured: aiCap } = simApplyMove(afterAI, idx, player);

      let oppMinNext = Infinity;
      const oppLegal = legalMovesFor(afterAI, opp);

      if(oppLegal.length === 0){
        oppMinNext = 0;
      } else {
        for(let oi of oppLegal){
          const afterOpp = afterAI.slice();
          const { captured: oppCap } = simApplyMove(afterOpp, oi, opp);
          let aiCounterCap = 0;
          legalMovesFor(afterOpp, player).forEach(aiNext => {
            const afterNext = afterOpp.slice();
            const res = simApplyMove(afterNext, aiNext, player);
            if(res.captured > aiCounterCap) aiCounterCap = res.captured;
          });
          const evalVal = (oppCap * 2) - (aiCounterCap * 1.5);
          if(evalVal < oppMinNext) oppMinNext = evalVal;
        }
      }

      const netScore = (aiCap * 2.5) - oppMinNext + (sumOf(afterAI, player) * 0.2);
      if(netScore > bestScore){
        bestScore = netScore;
        bestMove = idx;
      }
    }
    return bestMove;
  }

  function aiMoveExpert(legal, player){
    const opp = 1;
    let bestMove = legal[0];
    let bestVal = -Infinity;

    for(let idx of legal){
      const boardCopy = state.pits.slice();
      const { captured } = simApplyMove(boardCopy, idx, player);

      let vulnerablePits = 0;
      pitsOf(player).forEach(p => {
        if(boardCopy[p] === 1 || boardCopy[p] === 2) vulnerablePits++;
      });

      let oppBestResponse = 0;
      legalMovesFor(boardCopy, opp).forEach(oi => {
        const respCopy = boardCopy.slice();
        const res = simApplyMove(respCopy, oi, opp);
        if(res.captured > oppBestResponse) oppBestResponse = res.captured;
      });

      const positionControl = sumOf(boardCopy, player) - sumOf(boardCopy, opp);
      const score = (captured * 3.5) - (oppBestResponse * 2.2) + (positionControl * 0.4) - (vulnerablePits * 0.5);

      if(score > bestVal){
        bestVal = score;
        bestMove = idx;
      }
    }
    return bestMove;
  }

  const pitEls = {};
  function buildBoard(){
    const rowTop = $('rowTop');
    const rowBottom = $('rowBottom');
    if(!rowTop || !rowBottom) return;
    rowTop.innerHTML = '';
    rowBottom.innerHTML = '';
    for(let i=6;i<=11;i++) rowTop.appendChild(createPitEl(i));
    for(let i=0;i<=5;i++) rowBottom.appendChild(createPitEl(i));
  }

  function createPitEl(idx){
    const el = document.createElement('div');
    el.className = 'pit owner' + owner(idx);
    el.dataset.idx = idx;
    const idxLabel = document.createElement('div');
    idxLabel.className = 'idx';
    idxLabel.textContent = idx+1;
    el.appendChild(idxLabel);

    const seeds = document.createElement('div');
    seeds.className = 'seeds';
    el.appendChild(seeds);

    el.addEventListener('click', ()=> handlePitClick(idx));
    pitEls[idx] = el;
    return el;
  }

  function renderSeeds(idx){
    const el = pitEls[idx];
    if(!el) return;
    const seedsWrap = el.querySelector('.seeds');
    seedsWrap.innerHTML = '';
    const actualSeeds = state.pitSeeds[idx] || [];
    const count = actualSeeds.length;
    const maxShown = 12;
    const shown = Math.min(count, maxShown);

    for(let i=0;i<shown;i++){
      const seedObj = actualSeeds[i];
      const s = document.createElement('div');
      s.className = `seed ${seedObj.className}`;
      const rotate = ((idx * 31 + i * 47) % 80) - 40;
      const x = ((idx * 13 + i * 17) % 7) - 3;
      const y = ((idx * 19 + i * 11) % 5) - 2;
      s.style.setProperty('--seed-rotation', `${rotate}deg`);
      s.style.transform = `translate(${x}px, ${y}px) rotate(${rotate}deg)`;
      s.title = seedObj.label;
      seedsWrap.appendChild(s);
    }

    if(count > maxShown){
      const overflow = document.createElement('div');
      overflow.className = 'seed-overflow';
      overflow.textContent = '+' + (count - maxShown);
      seedsWrap.appendChild(overflow);
    }
  }

  function playerName(p){
    if(state.mode==='pvc' && p===2) return `Computer (${state.aiLevel.toUpperCase()})`;
    if(state.mode==='online' && state.localPlayer===p) return `You (Player ${p})`;
    return `Player ${p}`;
  }

  function renderAll(){
    for(let i=0;i<12;i++){ renderSeeds(i); updatePitSelectable(i); }
    if($('score1'))$('score1').textContent = state.score1;
    if($('score2'))$('score2').textContent = state.score2;
    if($('house1'))$('house1').classList.toggle('active', state.turn===1 && !state.gameOver);
    if($('house2'))$('house2').classList.toggle('active', state.turn===2 && !state.gameOver);

    const turnArrowEl = $('turnArrow');
    if(turnArrowEl){
      if(!state.gameOver){
        if(state.mode==='pvc' && state.turn===2){
          turnArrowEl.textContent = `Computer (${state.aiLevel}) is thinking...`;
        } else if(state.mode==='online'){
          turnArrowEl.textContent = state.turn===state.localPlayer
            ? `Your turn — Player ${state.localPlayer}: pick a pit on your row`
            : `Player ${state.turn}'s turn — waiting for your opponent`;
        } else {
          turnArrowEl.textContent = `Player ${state.turn}'s turn: pick a pit on your row`;
        }
      } else {
        turnArrowEl.textContent = '';
      }
    }
    renderStreaks();
  }

  function renderStreaks(){
    for(let i=0;i<3;i++){
      if($(`s1-${i}`)) $(`s1-${i}`).classList.toggle('filled', i < state.streak1);
      if($(`s2-${i}`)) $(`s2-${i}`).classList.toggle('filled', i < state.streak2);
    }
    if($('championBanner') &&$('championWho')){
      if(state.champion){
        $('championBanner').classList.add('show');$('championWho').textContent = playerName(state.champion);
      } else {
        $('championBanner').classList.remove('show');
      }
    }
  }

  function updatePitSelectable(idx){
    const el = pitEls[idx];
    if(!el) return;
    el.classList.remove('landing','capturing');
    const isComputerPit = state.mode==='pvc' && owner(idx)===2;
    const isRemotePit = state.mode==='online' && owner(idx)!==state.localPlayer;
    const canSelect = !state.sowing && !state.gameOver && owner(idx)===state.turn && state.pits[idx]>0 && !isComputerPit && !isRemotePit;
    el.classList.toggle('selectable', canSelect);
    el.classList.toggle('disabled', !canSelect);
  }

  function setMessage(text, type){
    const messageEl = $('message');
    if(messageEl){
      messageEl.textContent = text || '';
      messageEl.className = 'message-bar' + (type ? ' '+type : '');
    }
  }

  function delay(ms){ return new Promise(res=>setTimeout(res, ms)); }
  function legalMoveExistsThatFeeds(player){ return legalMovesFor(state.pits, player).some(i => simMoveFeeds(state.pits, i)); }

  // ---------------- Audio System ----------------
  let audioContext = null;
  function prepareAudio(){
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if(!AudioContextClass) return;
    try{
      audioContext ||= new AudioContextClass();
      if(audioContext.state==='suspended') audioContext.resume();
    } catch {}
  }

  function playSeedSound(){
    if(!audioContext || audioContext.state!=='running') return;
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.06);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start(now);
    osc.stop(now + 0.07);
  }

  function playCaptureSound(seedCount){
    if(!audioContext || audioContext.state!=='running') return;
    const now = audioContext.currentTime;
    const volume = Math.min(0.25, 0.10 + seedCount * 0.02);
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.18);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start(now);
    osc.stop(now + 0.19);
  }

  async function handlePitClick(idx){
    if(state.sowing || state.gameOver) return;
    if(state.mode==='pvc' && owner(idx)===2){ setMessage('The computer plays that side.', 'warn'); return; }
    if(state.mode==='online'){
      if(!conn || !conn.open){ setMessage('Wi-Fi opponent is not connected.', 'warn'); return; }
      if(state.turn!==state.localPlayer){ setMessage("Wait for your opponent's move.", 'warn'); return; }
      if(owner(idx)!==state.localPlayer){ setMessage(`You are Player ${state.localPlayer}. Choose a pit on your own row.`, 'warn'); return; }
    }
    if(owner(idx) !== state.turn){ setMessage("That pit isn't on your row.", 'warn'); return; }
    if(state.pits[idx] === 0){ setMessage('That pit is empty.', 'warn'); return; }

    const opp = opponentOf(state.turn);
    if(sumPits(opp) === 0 && !simMoveFeeds(state.pits, idx) && legalMoveExistsThatFeeds(state.turn)){
      setMessage('Your opponent has no seeds: you must play a pit that reaches their row.', 'warn');
      return;
    }

    prepareAudio();
    if(state.mode==='online' && !applyingRemote) sendNetwork({ type:'move', idx });
    await performMove(idx);
  }

  async function performMove(idx){
    const player = state.turn;
    const pName = playerName(player);
    setMessage(`${pName} played pit ${idx + 1}`);

    state.sowing = true;
    renderAll();

    const handSeeds = state.pitSeeds[idx].splice(0);
    state.pits[idx] = 0;
    renderSeeds(idx);
    let cur = idx;

    const moveStepDelay = (state.mode === 'pvc' && player === 2) ? 350 : 220;

    while(handSeeds.length > 0){
      await delay(moveStepDelay);
      cur = (cur + 1) % 12;
      
      const seedToPlace = handSeeds.pop();
      state.pitSeeds[cur].push(seedToPlace);
      state.pits[cur] = state.pitSeeds[cur].length;
      
      renderSeeds(cur);
      playSeedSound();

      if(pitEls[cur]) pitEls[cur].classList.add('landing');
      if(handSeeds.length !== 0 && pitEls[cur]) pitEls[cur].classList.remove('landing');
    }

    const lastIdx = cur;
    const opponent = opponentOf(player);
    let captured = 0;
    const isCapturable = (v) => v === 2 || v === 3 || v === 4;

    if(owner(lastIdx) === opponent && isCapturable(state.pits[lastIdx])){
      await delay(250);
      let chainIdx = lastIdx;
      while(chainIdx >= 0 && owner(chainIdx) === opponent && isCapturable(state.pits[chainIdx])){
        if(pitEls[chainIdx]) pitEls[chainIdx].classList.add('capturing');
        playCaptureSound(state.pits[chainIdx]);
        
        captured += state.pits[chainIdx];
        await delay(300);
        
        state.pitSeeds[chainIdx] = [];
        state.pits[chainIdx] = 0;
        
        renderSeeds(chainIdx);
        if(pitEls[chainIdx]) pitEls[chainIdx].classList.remove('capturing');
        chainIdx--;
      }
    }

    if(pitEls[lastIdx]) pitEls[lastIdx].classList.remove('landing');

    if(captured > 0){
      if(player === 1) state.score1 += captured; else state.score2 += captured;
      setMessage(`${pName} captured ${captured} seed${captured > 1 ? 's' : ''}!`);
      renderAll();
      await delay(400);
    }

    const p1Sum = sumPits(1);
    const p2Sum = sumPits(2);

    if(p1Sum === 0 || p2Sum === 0){
      if(p1Sum > 0){ 
        state.score1 += p1Sum; 
        pitsOf(1).forEach(i=>{ state.pits[i]=0; state.pitSeeds[i]=[]; }); 
      }
      if(p2Sum > 0){ 
        state.score2 += p2Sum; 
        pitsOf(2).forEach(i=>{ state.pits[i]=0; state.pitSeeds[i]=[]; }); 
      }
      state.gameOver = true;
      endGame();
    } else {
      state.turn = opponentOf(player);
    }

    state.sowing = false;
    renderAll();

    if(!state.gameOver && state.mode==='pvc' && state.turn===2){
      await delay(900);
      const aiIdx = aiChooseMove();
      if(aiIdx !== null && !state.gameOver) await performMove(aiIdx);
    }
  }

  function endGame(){
    const winner = state.score1 > state.score2 ? 1 : (state.score2 > state.score1 ? 2 : 0);
    let text;
    if(winner === 0){
      text = `Game over — a tie, ${state.score1}–${state.score2}.`;
      state.streak1 = 0; state.streak2 = 0; state.lastWinner = null;
    } else {
      text = `Game over: ${playerName(winner)} wins ${winner===1?state.score1:state.score2}-${winner===1?state.score2:state.score1}.`;
      if(state.lastWinner === winner){
        if(winner===1) state.streak1++; else state.streak2++;
      } else {
        state.streak1 = winner===1 ? 1 : 0;
        state.streak2 = winner===2 ? 1 : 0;
      }
      state.lastWinner = winner;
      if((winner===1 && state.streak1>=3) || (winner===2 && state.streak2>=3)){
        state.champion = winner;
        text += ` ${playerName(winner)} takes three straight wins: Champion!`;
      }
    }
    setMessage(text, 'win');
  }

  function resetBoardOnly(){
    state.pits = STARTING_PITS.slice();
    state.pitSeeds = createInitialPitContents(state.selectedSeeds);
    state.score1 = 0;
    state.score2 = 0;
    state.turn = state.lastWinner || 1;
    state.gameOver = false;
    state.sowing = false;
    setMessage('');
    renderAll();
  }

  function newGame(fromNetwork=false){
    if(state.mode==='online' && !fromNetwork){
      if(state.onlineRole!=='host'){ setMessage('Only the host can restart an online game.', 'warn'); return; }
      sendNetwork({ type:'newGame' });
    }
    resetBoardOnly();
    if(state.mode==='pvc' && state.turn===2){
      delay(600).then(()=>{ const aiIdx=aiChooseMove(); if(aiIdx!==null) performMove(aiIdx); });
    }
  }

  function newMatch(fromNetwork=false){
    if(state.mode==='online' && !fromNetwork){
      if(state.onlineRole!=='host'){ setMessage('Only the host can start a new online match.', 'warn'); return; }
      sendNetwork({ type:'newMatch' });
    }
    state.streak1 = 0;
    state.streak2 = 0;
    state.lastWinner = null;
    state.champion = null;
    resetBoardOnly();
  }

  function startMode(mode){
    state.mode = mode;
    state.onlineRole = null;
    state.localPlayer = null;
    
    if($('house2Label'))$('house2Label').textContent = mode==='pvc' ? `Computer (${state.aiLevel})` : 'Ilé P2';
    if($('menuScreen'))$('menuScreen').classList.add('hidden');
    if($('onlineSetup'))$('onlineSetup').classList.add('hidden');
    if($('gameScreen'))$('gameScreen').classList.remove('hidden');
    if($('networkBar'))$('networkBar').classList.add('hidden');
    
    renderDifficultyUI();

    state.streak1 = 0;
    state.streak2 = 0;
    state.lastWinner = null;
    state.champion = null;
    newGame(true);
  }

  function renderDifficultyUI(){
    let container = $('difficultyPanel');
    if(!container){
      container = document.createElement('div');
      container.id = 'difficultyPanel';
      container.className = 'compact-panel in-game';
      const tools = document.querySelector('.game-tools');
      if(tools) tools.appendChild(container);
    }

    if(state.mode !== 'pvc'){
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');
    container.innerHTML = `
      <strong>Computer Difficulty</strong>
      <div class="seed-options" style="margin-top:6px;">
        ${AI_LEVELS.map(lvl => `
          <label class="seed-choice">
            <input type="radio" name="aiLevelChoice" value="${lvl.id}" ${state.aiLevel === lvl.id ? 'checked' : ''} />
            <span>${lvl.label}</span>
          </label>
        `).join('')}
      </div>
    `;

    container.querySelectorAll('input[name="aiLevelChoice"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        state.aiLevel = e.target.value;
        if($('house2Label'))$('house2Label').textContent = `Computer (${state.aiLevel})`;
        setMessage(`AI level set to ${state.aiLevel.toUpperCase()}`);
        renderAll();
      });
    });
  }

  // ---------------- Tutorial System ----------------
  function openTutorial(){
    let tutorialModal = $('tutorialModal');
    if(!tutorialModal){
      tutorialModal = document.createElement('div');
      tutorialModal.id = 'tutorialModal';
      tutorialModal.className = 'modal hidden';
      document.body.appendChild(tutorialModal);
    }

    state.tutorialStep = 0;
    renderTutorialStep();
    tutorialModal.classList.remove('hidden');
  }

  function renderTutorialStep(){
    const modal = $('tutorialModal');
    if(!modal) return;
    const stepData = TUTORIAL_STEPS[state.tutorialStep];
    const isFirst = state.tutorialStep === 0;
    const isLast = state.tutorialStep === TUTORIAL_STEPS.length - 1;

    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h2>Interactive Ayo Tutorial (${state.tutorialStep + 1}/${TUTORIAL_STEPS.length})</h2>
          <button id="closeTutorialBtn" class="secondary">&times;</button>
        </div>
        <div class="modal-body">
          <h3>${stepData.title}</h3>
          <p style="margin-top:10px; line-height:1.5;">${stepData.content}</p>
        </div>
        <div class="modal-footer" style="display:flex; justify-content:space-between; margin-top:20px;">
          <button id="prevTutBtn" class="secondary" ${isFirst ? 'disabled' : ''}>Previous</button>
          <button id="nextTutBtn" class="primary">${isLast ? 'Finish' : 'Next'}</button>
        </div>
      </div>
    `;

    safeAddListener('closeTutorialBtn', 'click', closeTutorial);
    safeAddListener('prevTutBtn', 'click', () => {
      if(state.tutorialStep > 0){ state.tutorialStep--; renderTutorialStep(); }
    });
    safeAddListener('nextTutBtn', 'click', () => {
      if(isLast){ closeTutorial(); } else { state.tutorialStep++; renderTutorialStep(); }
    });
  }

  function closeTutorial(){
    const modal = $('tutorialModal');
    if(modal) modal.classList.add('hidden');
  }

  // ---------------- Short-Code Wi-Fi Room System ----------------
  function generate6CharRoomCode(){
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'AYO-';
    for(let i=0; i<4; i++){
      code += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    return code;
  }

  function createHostRoom(){
    closePeer();
    const code = generate6CharRoomCode();
    state.roomCode = code;
    state.onlineRole = 'host';
    state.localPlayer = 1;

    const hostField = $('hostOffer') || $('roomCodeOutput');
    if(hostField) hostField.value = code;

    const onlineStatus = $('onlineStatus');
    if(onlineStatus) onlineStatus.textContent = `Room Code: ${code} (Waiting for Player 2...)`;

    if(typeof Peer !== 'undefined'){
      peer = new Peer(code);
      peer.on('connection', (c) => {
        conn = c;
        bindConnectionEvents();
      });
      peer.on('error', () => {
        if(onlineStatus) onlineStatus.textContent = `Code ${code} active (Wi-Fi Ready)`;
      });
    }
  }

  function joinHostRoom(){
    closePeer();
    const inputField = $('guestOfferInput') || $('roomCodeInput');
    const enteredCode = inputField ? inputField.value.trim().toUpperCase() : '';

    if(!enteredCode || enteredCode.length < 4 || enteredCode.length > 10){
      alert('Please enter a 5-10 character room code.');
      return;
    }

    state.roomCode = enteredCode;
    state.onlineRole = 'guest';
    state.localPlayer = 2;

    const onlineStatus = $('onlineStatus');
    if(onlineStatus) onlineStatus.textContent = `Connecting to ${enteredCode}...`;

    if(typeof Peer !== 'undefined'){
      peer = new Peer();
      peer.on('open', () => {
        conn = peer.connect(enteredCode);
        bindConnectionEvents();
      });
      peer.on('error', () => {
        alert(`Could not find room ${enteredCode}. Check room code.`);
        if(onlineStatus) onlineStatus.textContent = 'Room not found.';
      });
    } else {
      setTimeout(() => startOnlineGame('guest'), 300);
    }
  }

  function bindConnectionEvents(){
    if(!conn) return;
    conn.on('open', () => {
      const onlineStatus = $('onlineStatus');
      if(onlineStatus) onlineStatus.textContent = 'Connected!';
      startOnlineGame(state.onlineRole || 'guest');
    });
    conn.on('data', async (data) => {
      await handleNetworkMessage(data);
    });
    conn.on('close', () => {
      const onlineStatus = $('onlineStatus');
      if(onlineStatus) onlineStatus.textContent = 'Disconnected';
      if($('networkState'))$('networkState').textContent = 'Disconnected';
      setMessage('Opponent disconnected.', 'warn');
    });
  }

  function sendNetwork(payload){
    if(conn && conn.open) conn.send(payload);
  }

  function serializableState(){
    return {
      pits: state.pits.slice(), turn: state.turn, score1:state.score1, score2:state.score2,
      streak1:state.streak1, streak2:state.streak2, lastWinner:state.lastWinner,
      champion:state.champion, gameOver:state.gameOver, selectedSeeds:state.selectedSeeds.slice()
    };
  }

  function sendStateSync(){ sendNetwork({ type:'sync', state:serializableState() }); }

  function applyStateSync(s){
    if(!s || !Array.isArray(s.pits) || s.pits.length!==12) return;
    state.pits = s.pits.slice();
    state.turn = s.turn;
    state.score1 = s.score1;
    state.score2 = s.score2;
    state.streak1 = s.streak1;
    state.streak2 = s.streak2;
    state.lastWinner = s.lastWinner;
    state.champion = s.champion;
    state.gameOver = s.gameOver;
    state.sowing = false;
    buildSeedSelectors();
    renderAll();
  }

  async function handleNetworkMessage(msg){
    if(msg.type==='move'){
      if(state.sowing || state.gameOver) return;
      if(state.turn===state.localPlayer) return;
      const idx = Number(msg.idx);
      if(!Number.isInteger(idx) || idx<0 || idx>11 || owner(idx)!==state.turn || state.pits[idx]<=0) return;
      applyingRemote = true;
      try { await performMove(idx); } finally { applyingRemote = false; }
    } else if(msg.type==='sync'){
      applyStateSync(msg.state);
    } else if(msg.type==='newGame'){
      newGame(true);
    } else if(msg.type==='newMatch'){
      newMatch(true);
    } else if(msg.type==='seeds' && Array.isArray(msg.selectedSeeds) && msg.selectedSeeds.length){
      state.selectedSeeds = msg.selectedSeeds.filter(id => SEED_STYLES.some(s=>s.id===id));
      localStorage.setItem('ayo_selected_seeds', JSON.stringify(state.selectedSeeds));
      state.pitSeeds = createInitialPitContents(state.selectedSeeds);
      buildSeedSelectors(); renderAll();
    }
  }

  function closePeer(){
    if(conn){ try{ conn.close(); }catch{} }
    if(peer){ try{ peer.destroy(); }catch{} }
    conn = null; peer = null;
    if($('onlineStatus'))$('onlineStatus').textContent = 'Not connected';
  }

  function startOnlineGame(role){
    state.mode = 'online';
    state.onlineRole = role;
    state.localPlayer = role==='host' ? 1 : 2;
    
    if($('house2Label'))$('house2Label').textContent = 'Ilé P2';
    if($('menuScreen'))$('menuScreen').classList.add('hidden');
    if($('onlineSetup'))$('onlineSetup').classList.add('hidden');
    if($('gameScreen'))$('gameScreen').classList.remove('hidden');
    if($('networkBar'))$('networkBar').classList.remove('hidden');
    if($('networkRole'))$('networkRole').textContent = role==='host' ? `Online — Player 1 (Room: ${state.roomCode})` : `Online — Player 2 (Room: ${state.roomCode})`;
    if($('networkState'))$('networkState').textContent = 'Connected';
    
    renderDifficultyUI();
    state.streak1 = 0;
    state.streak2 = 0;
    state.lastWinner = null;
    state.champion = null;
    resetBoardOnly();
    setMessage('Wi-Fi multiplayer connected. Have a good game!');
    if(role==='host') setTimeout(()=>sendStateSync(), 250);
  }

  function backToMenu(){
    closePeer();
    if($('gameScreen'))$('gameScreen').classList.add('hidden');
    if($('onlineSetup'))$('onlineSetup').classList.add('hidden');
    if($('menuScreen'))$('menuScreen').classList.remove('hidden');
    state.mode = null;
    state.onlineRole = null;
    state.localPlayer = null;
  }

  function buildSeedSelectors(){
    ['seedOptionsMenu','seedOptionsGame'].forEach(containerId => {
      const container = $(containerId);
      if(!container) return;
      container.innerHTML = '';
      SEED_STYLES.forEach(def => {
        const label = document.createElement('label');
        label.className = 'seed-choice';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = def.id;
        input.checked = state.selectedSeeds.includes(def.id);
        input.addEventListener('change', () => updateSeedSelection(def.id, input.checked));

        const sample = document.createElement('span');
        sample.className = `seed sample-seed ${def.className}`;
        const text = document.createElement('span');
        text.textContent = def.label;

        label.append(input, sample, text);
        container.appendChild(label);
      });
    });
  }

  function updateSeedSelection(id, checked){
    const next = new Set(state.selectedSeeds);
    if(checked) next.add(id); else next.delete(id);
    if(next.size===0){
      next.add(id);
      setMessage('Keep at least one seed style selected.', 'warn');
    }
    state.selectedSeeds = [...next];
    localStorage.setItem('ayo_selected_seeds', JSON.stringify(state.selectedSeeds));
    state.pitSeeds = createInitialPitContents(state.selectedSeeds);
    buildSeedSelectors();
    if(Object.keys(pitEls).length) renderAll();
    if(state.mode==='online' && conn && conn.open) sendNetwork({ type:'seeds', selectedSeeds:state.selectedSeeds });
  }

  function openHistory(){ if($('historyModal'))$('historyModal').classList.remove('hidden'); }
  function closeHistory(){ if($('historyModal'))$('historyModal').classList.add('hidden'); }

  function showOnlineSetup(){
    if($('menuScreen'))$('menuScreen').classList.add('hidden');
    if($('gameScreen'))$('gameScreen').classList.add('hidden');
    if($('onlineSetup'))$('onlineSetup').classList.remove('hidden');
    if($('onlineStatus'))$('onlineStatus').textContent = 'Not connected';
  }

  function showHostTab(){
    if($('hostPanel'))$('hostPanel').classList.remove('hidden');
    if($('joinPanel'))$('joinPanel').classList.add('hidden');
    if($('hostTabBtn'))$('hostTabBtn').classList.add('primary');
    if($('joinTabBtn'))$('joinTabBtn').classList.remove('primary');
  }

  function showJoinTab(){
    if($('joinPanel'))$('joinPanel').classList.remove('hidden');
    if($('hostPanel'))$('hostPanel').classList.add('hidden');
    if($('joinTabBtn'))$('joinTabBtn').classList.add('primary');
    if($('hostTabBtn'))$('hostTabBtn').classList.remove('primary');
  }

  async function copyField(id, button){
    const field = $(id);
    const value = field ? field.value : '';
    if(!value) return;
    try{
      await navigator.clipboard.writeText(value);
      const old = button.textContent; button.textContent = 'Copied'; setTimeout(()=>button.textContent=old, 1200);
    }catch{
      if(field){ field.select(); document.execCommand('copy'); }
    }
  }

  safeAddListener('pvpBtn', 'click', ()=> startMode('pvp'));
  safeAddListener('pvcBtn', 'click', ()=> startMode('pvc'));
  safeAddListener('onlineBtn', 'click', showOnlineSetup);
  safeAddListener('onlineBackBtn', 'click', ()=>{ closePeer(); if($('onlineSetup'))$('onlineSetup').classList.add('hidden'); if($('menuScreen'))$('menuScreen').classList.remove('hidden'); });
  safeAddListener('hostTabBtn', 'click', showHostTab);
  safeAddListener('joinTabBtn', 'click', showJoinTab);
  safeAddListener('createOfferBtn', 'click', createHostRoom);
  safeAddListener('createAnswerBtn', 'click', joinHostRoom);

  document.querySelectorAll('.copy-btn').forEach(btn => btn.addEventListener('click', ()=>copyField(btn.dataset.copy, btn)));
  safeAddListener('menuBtn', 'click', backToMenu);
  safeAddListener('newGameBtn', 'click', ()=>newGame(false));
  safeAddListener('newMatchBtn', 'click', ()=>newMatch(false));
  safeAddListener('rulesBtn', 'click', openTutorial);
  
  // History Modal Event Listeners
  safeAddListener('historyBtn', 'click', openHistory);
  safeAddListener('historyMenuBtn', 'click', openHistory);
  safeAddListener('closeHistoryBtn', 'click', closeHistory);

  if($('historyModal')){$('historyModal').addEventListener('click', (e)=>{ if(e.target.id==='historyModal') closeHistory(); });
  }
  
  document.addEventListener('keydown', (e)=>{ 
    if(e.key==='Escape'){
      closeHistory();
      closeTutorial();
    } 
  });

  buildSeedSelectors();
  buildBoard();
})();