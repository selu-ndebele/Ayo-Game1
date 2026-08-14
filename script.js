(function(){
  const state = {
    pits: [4,4,4,4,4,4,4,4,4,4,4,4],
    turn: 1,
    score1: 0,
    score2: 0,
    streak1: 0,
    streak2: 0,
    lastWinner: null,
    champion: null,
    sowing: false,
    gameOver: false,
    mode: null, // 'pvp' or 'pvc'
  };

  const menuScreen = document.getElementById('menuScreen');
  const gameScreen = document.getElementById('gameScreen');
  const pvpBtn = document.getElementById('pvpBtn');
  const pvcBtn = document.getElementById('pvcBtn');
  const menuBtn = document.getElementById('menuBtn');
  const house2Label = document.getElementById('house2Label');

  const rowTop = document.getElementById('rowTop');
  const rowBottom = document.getElementById('rowBottom');
  const score1El = document.getElementById('score1');
  const score2El = document.getElementById('score2');
  const messageEl = document.getElementById('message');
  const turnArrowEl = document.getElementById('turnArrow');
  const house1 = document.getElementById('house1');
  const house2 = document.getElementById('house2');
  const championBanner = document.getElementById('championBanner');
  const championWho = document.getElementById('championWho');

  function owner(idx){ return idx < 6 ? 1 : 2; }
  function opponentOf(p){ return p === 1 ? 2 : 1; }
  function pitsOf(player){ return player === 1 ? [0,1,2,3,4,5] : [6,7,8,9,10,11]; }
  function sumPits(player){ return pitsOf(player).reduce((s,i)=> s + state.pits[i], 0); }
  function sumOf(pits, player){ return pitsOf(player).reduce((s,i)=> s + pits[i], 0); }

  // ---- pure (non-mutating-of-state) simulation helpers, used for legality checks and AI lookahead ----
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

  // ---- simple AI: prefers moves that capture now and don't hand the opponent a big capture next turn ----
  function aiChooseMove(){
    const player = 2;
    const opp = 1;
    const legal = legalMovesFor(state.pits, player);
    if(legal.length === 0) return null;

    const scored = legal.map(idx => {
      const afterAI = state.pits.slice();
      const { captured } = simApplyMove(afterAI, idx, player);

      let oppBest = 0;
      legalMovesFor(afterAI, opp).forEach(oi => {
        const afterOpp = afterAI.slice();
        const res = simApplyMove(afterOpp, oi, opp);
        if(res.captured > oppBest) oppBest = res.captured;
      });

      const score = captured * 2 - oppBest + Math.random() * 0.3;
      return { idx, score };
    });

    scored.sort((a,b) => b.score - a.score);
    return scored[0].idx;
  }

  // ---- board build/render ----
  const pitEls = {};
  function buildBoard(){
    rowTop.innerHTML = '';
    rowBottom.innerHTML = '';
    for(let i=6;i<=11;i++){ rowTop.appendChild(createPitEl(i)); }
    for(let i=0;i<=5;i++){ rowBottom.appendChild(createPitEl(i)); }
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
    const seedsWrap = el.querySelector('.seeds');
    seedsWrap.innerHTML = '';
    const count = state.pits[idx];
    const maxShown = 9;
    const shown = Math.min(count, maxShown);
    for(let i=0;i<shown;i++){
      const s = document.createElement('div');
      s.className = 'seed';
      s.style.transform = `rotate(${(i*47)%360}deg)`;
      seedsWrap.appendChild(s);
    }
    if(count > maxShown){
      const overflow = document.createElement('div');
      overflow.className = 'seed-overflow';
      overflow.textContent = '+' + (count - maxShown);
      seedsWrap.appendChild(overflow);
    }
  }

  function renderAll(){
    for(let i=0;i<12;i++){ renderSeeds(i); updatePitSelectable(i); }
    score1El.textContent = state.score1;
    score2El.textContent = state.score2;
    house1.classList.toggle('active', state.turn===1 && !state.gameOver);
    house2.classList.toggle('active', state.turn===2 && !state.gameOver);
    if(!state.gameOver){
      if(state.turn===1){
        turnArrowEl.textContent = "Player 1's turn: pick a pit on your row";
      } else {
        turnArrowEl.textContent = state.mode==='pvc' ? "Computer is thinking…" : "Player 2's turn: pick a pit on your row";
      }
    } else {
      turnArrowEl.textContent = '';
    }
    renderStreaks();
  }

  function renderStreaks(){
    for(let i=0;i<3;i++){
      document.getElementById('s1-'+i).classList.toggle('filled', i < state.streak1);
      document.getElementById('s2-'+i).classList.toggle('filled', i < state.streak2);
    }
    if(state.champion){
      championBanner.classList.add('show');
      championWho.textContent = state.champion===2 && state.mode==='pvc' ? 'Computer' : state.champion;
    } else {
      championBanner.classList.remove('show');
    }
  }

  function updatePitSelectable(idx){
    const el = pitEls[idx];
    el.classList.remove('landing','capturing');
    const humanControlsThisPit = !(state.mode==='pvc' && owner(idx)===2);
    const canSelect = !state.sowing && !state.gameOver && owner(idx)===state.turn && state.pits[idx] > 0 && humanControlsThisPit;
    el.classList.toggle('selectable', canSelect);
    el.classList.toggle('disabled', !canSelect);
  }

  function setMessage(text, type){
    messageEl.textContent = text || '';
    messageEl.className = 'message-bar' + (type ? ' '+type : '');
  }

  function delay(ms){ return new Promise(res=>setTimeout(res, ms)); }

  function legalMoveExistsThatFeeds(player){
    return legalMovesFor(state.pits, player).some(i => simMoveFeeds(state.pits, i));
  }

  async function handlePitClick(idx){
    if(state.sowing || state.gameOver) return;
    if(state.mode==='pvc' && owner(idx)===2){
      setMessage("The computer plays that side.", 'warn');
      return;
    }
    if(owner(idx) !== state.turn){
      setMessage("That pit isn't on your row.", 'warn');
      return;
    }
    if(state.pits[idx] === 0){
      setMessage('That pit is empty.', 'warn');
      return;
    }
    const opp = opponentOf(state.turn);
    if(sumPits(opp) === 0){
      if(!simMoveFeeds(state.pits, idx)){
        if(legalMoveExistsThatFeeds(state.turn)){
          setMessage("Your opponent has no seeds: you must play a pit that reaches their row.", 'warn');
          return;
        }
      }
    }

    await performMove(idx);
  }

  async function performMove(idx){
    setMessage('');
    state.sowing = true;
    renderAll();

    let seeds = state.pits[idx];
    state.pits[idx] = 0;
    renderSeeds(idx);
    let cur = idx;
    const player = state.turn;

    while(seeds>0){
      await delay(130);
      cur = (cur+1)%12;
      state.pits[cur]++;
      renderSeeds(cur);
      pitEls[cur].classList.add('landing');
      seeds--;
      if(seeds!==0){ pitEls[cur].classList.remove('landing'); }
    }

    const lastIdx = cur;
    const opponent = opponentOf(player);
    let captured = 0;

    const isCapturable = (v) => v === 2 || v === 3 || v === 4;
    if(owner(lastIdx) === opponent && isCapturable(state.pits[lastIdx])){
      await delay(220);
      let chainIdx = lastIdx;
      while(chainIdx >= 0 && owner(chainIdx) === opponent && isCapturable(state.pits[chainIdx])){
        pitEls[chainIdx].classList.add('capturing');
        captured += state.pits[chainIdx];
        await delay(180);
        state.pits[chainIdx] = 0;
        renderSeeds(chainIdx);
        pitEls[chainIdx].classList.remove('capturing');
        chainIdx--;
      }
    }
    pitEls[lastIdx].classList.remove('landing');

    if(captured > 0){
      if(player===1) state.score1 += captured; else state.score2 += captured;
      const who = (player===2 && state.mode==='pvc') ? 'Computer' : `Player ${player}`;
      setMessage(`${who} captures ${captured} seed${captured>1?'s':''}!`);
      renderAll();
      await delay(300);
    }

    const p1Sum = sumPits(1);
    const p2Sum = sumPits(2);
    if(p1Sum === 0 || p2Sum === 0){
      if(p1Sum > 0){ state.score1 += p1Sum; pitsOf(1).forEach(i=>state.pits[i]=0); }
      if(p2Sum > 0){ state.score2 += p2Sum; pitsOf(2).forEach(i=>state.pits[i]=0); }
      state.gameOver = true;
      endGame();
    } else {
      state.turn = opponentOf(player);
    }

    state.sowing = false;
    renderAll();

    if(!state.gameOver && state.mode==='pvc' && state.turn===2){
      await delay(500 + Math.random()*500);
      const aiIdx = aiChooseMove();
      if(aiIdx !== null && !state.gameOver){
        await performMove(aiIdx);
      }
    }
  }

  function endGame(){
    const winner = state.score1 > state.score2 ? 1 : (state.score2 > state.score1 ? 2 : 0);
    let text;
    const nameOf = (p) => (p===2 && state.mode==='pvc') ? 'Computer' : `Player ${p}`;
    if(winner === 0){
      text = `Game over — a rare tie, ${state.score1}–${state.score2}.`;
      state.streak1 = 0; state.streak2 = 0; state.lastWinner = null;
    } else {
      text = `Game over: ${nameOf(winner)} wins ${winner===1?state.score1:state.score2}-${winner===1?state.score2:state.score1}.`;
      if(state.lastWinner === winner){
        if(winner===1) state.streak1++; else state.streak2++;
      } else {
        state.streak1 = winner===1 ? 1 : 0;
        state.streak2 = winner===2 ? 1 : 0;
      }
      state.lastWinner = winner;
      if((winner===1 && state.streak1>=3) || (winner===2 && state.streak2>=3)){
        state.champion = winner;
        text += ` ${nameOf(winner)} takes three straight wins: Champion!`;
      }
    }
    setMessage(text, 'win');
  }

  function newGame(){
    state.pits = [4,4,4,4,4,4,4,4,4,4,4,4];
    state.score1 = 0;
    state.score2 = 0;
    state.turn = state.lastWinner || 1;
    state.gameOver = false;
    state.sowing = false;
    setMessage('');
    renderAll();
    if(state.mode==='pvc' && state.turn===2){
      delay(500).then(()=>{
        const aiIdx = aiChooseMove();
        if(aiIdx !== null) performMove(aiIdx);
      });
    }
  }

  function newMatch(){
    state.streak1 = 0;
    state.streak2 = 0;
    state.lastWinner = null;
    state.champion = null;
    newGame();
  }

  function startMode(mode){
    state.mode = mode;
    house2Label.textContent = mode==='pvc' ? 'Ilé Kọ̀mpútà' : 'Ilé P2';
    menuScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    state.streak1 = 0;
    state.streak2 = 0;
    state.lastWinner = null;
    state.champion = null;
    newGame();
  }

  function backToMenu(){
    gameScreen.classList.add('hidden');
    menuScreen.classList.remove('hidden');
    state.mode = null;
  }

  pvpBtn.addEventListener('click', ()=> startMode('pvp'));
  pvcBtn.addEventListener('click', ()=> startMode('pvc'));
  menuBtn.addEventListener('click', backToMenu);
  document.getElementById('newGameBtn').addEventListener('click', newGame);
  document.getElementById('newMatchBtn').addEventListener('click', newMatch);
  document.getElementById('rulesBtn').addEventListener('click', ()=>{
    document.getElementById('rulesPanel').classList.toggle('show');
  });

  buildBoard();
})();
