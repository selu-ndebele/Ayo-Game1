(function(){
  const STARTING_PITS = [4,4,4,4,4,4,4,4,4,4,4,4];
  const SEED_STYLES = [
    { id:'ayo-brown', label:'Ayo Brown', className:'seed-ayo-brown' },
    { id:'ivory', label:'Ivory Cowrie', className:'seed-ivory' },
    { id:'black', label:'Ebony', className:'seed-black' },
    { id:'red', label:'Red Bean', className:'seed-red' },
    { id:'speckled', label:'Speckled', className:'seed-speckled' }
  ];

  const state = {
    pits: STARTING_PITS.slice(),
    turn: 1,
    score1: 0,
    score2: 0,
    streak1: 0,
    streak2: 0,
    lastWinner: null,
    champion: null,
    sowing: false,
    gameOver: false,
    mode: null, // pvp, pvc, online
    selectedSeeds: ['ayo-brown','speckled'],
    onlineRole: null, // host or guest
    localPlayer: null
  };

  let peer = null;
  let channel = null;
  let applyingRemote = false;

  const $ = (id) => document.getElementById(id);
  const menuScreen = $('menuScreen');
  const onlineSetup = $('onlineSetup');
  const gameScreen = $('gameScreen');
  const pvpBtn = $('pvpBtn');
  const pvcBtn = $('pvcBtn');
  const onlineBtn = $('onlineBtn');
  const menuBtn = $('menuBtn');
  const house2Label = $('house2Label');
  const rowTop = $('rowTop');
  const rowBottom = $('rowBottom');
  const score1El = $('score1');
  const score2El = $('score2');
  const messageEl = $('message');
  const turnArrowEl = $('turnArrow');
  const house1 = $('house1');
  const house2 = $('house2');
  const championBanner = $('championBanner');
  const championWho = $('championWho');
  const networkBar = $('networkBar');
  const networkRole = $('networkRole');
  const networkState = $('networkState');
  const onlineStatus = $('onlineStatus');

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
      return { idx, score: captured * 2 - oppBest + Math.random() * 0.3 };
    });
    scored.sort((a,b) => b.score - a.score);
    return scored[0].idx;
  }

  const pitEls = {};
  function buildBoard(){
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

  function selectedSeedDefs(){
    const selected = SEED_STYLES.filter(s => state.selectedSeeds.includes(s.id));
    return selected.length ? selected : [SEED_STYLES[0]];
  }

  function renderSeeds(idx){
    const el = pitEls[idx];
    const seedsWrap = el.querySelector('.seeds');
    seedsWrap.innerHTML = '';
    const count = state.pits[idx];
    const maxShown = 12;
    const shown = Math.min(count, maxShown);
    const styles = selectedSeedDefs();
    for(let i=0;i<shown;i++){
      const def = styles[(idx * 5 + i * 3) % styles.length];
      const s = document.createElement('div');
      s.className = `seed ${def.className}`;
      const rotate = ((idx * 31 + i * 47) % 80) - 40;
      const x = ((idx * 13 + i * 17) % 7) - 3;
      const y = ((idx * 19 + i * 11) % 5) - 2;
      s.style.setProperty('--seed-rotation', `${rotate}deg`);
      s.style.transform = `translate(${x}px, ${y}px) rotate(${rotate}deg)`;
      s.title = def.label;
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
    if(state.mode==='pvc' && p===2) return 'Computer';
    if(state.mode==='online' && state.localPlayer===p) return `You (Player ${p})`;
    return `Player ${p}`;
  }

  function renderAll(){
    for(let i=0;i<12;i++){ renderSeeds(i); updatePitSelectable(i); }
    score1El.textContent = state.score1;
    score2El.textContent = state.score2;
    house1.classList.toggle('active', state.turn===1 && !state.gameOver);
    house2.classList.toggle('active', state.turn===2 && !state.gameOver);
    if(!state.gameOver){
      if(state.mode==='pvc' && state.turn===2){
        turnArrowEl.textContent = 'Computer is thinking…';
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
    renderStreaks();
  }

  function renderStreaks(){
    for(let i=0;i<3;i++){
      $(`s1-${i}`).classList.toggle('filled', i < state.streak1);
      $(`s2-${i}`).classList.toggle('filled', i < state.streak2);
    }
    if(state.champion){
      championBanner.classList.add('show');
      championWho.textContent = playerName(state.champion);
    } else {
      championBanner.classList.remove('show');
    }
  }

  function updatePitSelectable(idx){
    const el = pitEls[idx];
    el.classList.remove('landing','capturing');
    const isComputerPit = state.mode==='pvc' && owner(idx)===2;
    const isRemotePit = state.mode==='online' && owner(idx)!==state.localPlayer;
    const canSelect = !state.sowing && !state.gameOver && owner(idx)===state.turn && state.pits[idx]>0 && !isComputerPit && !isRemotePit;
    el.classList.toggle('selectable', canSelect);
    el.classList.toggle('disabled', !canSelect);
  }

  function setMessage(text, type){
    messageEl.textContent = text || '';
    messageEl.className = 'message-bar' + (type ? ' '+type : '');
  }

  function delay(ms){ return new Promise(res=>setTimeout(res, ms)); }
  function legalMoveExistsThatFeeds(player){ return legalMovesFor(state.pits, player).some(i => simMoveFeeds(state.pits, i)); }

  async function handlePitClick(idx){
    if(state.sowing || state.gameOver) return;
    if(state.mode==='pvc' && owner(idx)===2){ setMessage('The computer plays that side.', 'warn'); return; }
    if(state.mode==='online'){
      if(!channel || channel.readyState!=='open'){ setMessage('The Wi-Fi opponent is not connected.', 'warn'); return; }
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

    if(state.mode==='online' && !applyingRemote) sendNetwork({ type:'move', idx });
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
      await delay(115);
      cur = (cur+1)%12;
      state.pits[cur]++;
      renderSeeds(cur);
      pitEls[cur].classList.add('landing');
      seeds--;
      if(seeds!==0) pitEls[cur].classList.remove('landing');
    }

    const lastIdx = cur;
    const opponent = opponentOf(player);
    let captured = 0;
    const isCapturable = (v) => v === 2 || v === 3 || v === 4;
    if(owner(lastIdx) === opponent && isCapturable(state.pits[lastIdx])){
      await delay(180);
      let chainIdx = lastIdx;
      while(chainIdx >= 0 && owner(chainIdx) === opponent && isCapturable(state.pits[chainIdx])){
        pitEls[chainIdx].classList.add('capturing');
        captured += state.pits[chainIdx];
        await delay(150);
        state.pits[chainIdx] = 0;
        renderSeeds(chainIdx);
        pitEls[chainIdx].classList.remove('capturing');
        chainIdx--;
      }
    }
    pitEls[lastIdx].classList.remove('landing');

    if(captured > 0){
      if(player===1) state.score1 += captured; else state.score2 += captured;
      setMessage(`${playerName(player)} captures ${captured} seed${captured>1?'s':''}!`);
      renderAll();
      await delay(250);
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
      await delay(450 + Math.random()*450);
      const aiIdx = aiChooseMove();
      if(aiIdx !== null && !state.gameOver) await performMove(aiIdx);
    }
  }

  function endGame(){
    const winner = state.score1 > state.score2 ? 1 : (state.score2 > state.score1 ? 2 : 0);
    let text;
    if(winner === 0){
      text = `Game over — a rare tie, ${state.score1}–${state.score2}.`;
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
      delay(500).then(()=>{ const aiIdx=aiChooseMove(); if(aiIdx!==null) performMove(aiIdx); });
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
    house2Label.textContent = mode==='pvc' ? 'Ilé Kọ̀mpútà' : 'Ilé P2';
    menuScreen.classList.add('hidden');
    onlineSetup.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    networkBar.classList.add('hidden');
    state.streak1 = 0;
    state.streak2 = 0;
    state.lastWinner = null;
    state.champion = null;
    newGame(true);
  }

  function startOnlineGame(role){
    state.mode = 'online';
    state.onlineRole = role;
    state.localPlayer = role==='host' ? 1 : 2;
    house2Label.textContent = 'Ilé P2';
    menuScreen.classList.add('hidden');
    onlineSetup.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    networkBar.classList.remove('hidden');
    networkRole.textContent = role==='host' ? 'Online · You are Player 1 (Host)' : 'Online · You are Player 2 (Guest)';
    networkState.textContent = 'Connected';
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
    gameScreen.classList.add('hidden');
    onlineSetup.classList.add('hidden');
    menuScreen.classList.remove('hidden');
    state.mode = null;
    state.onlineRole = null;
    state.localPlayer = null;
  }

  function buildSeedSelectors(){
    ['seedOptionsMenu','seedOptionsGame'].forEach(containerId => {
      const container = $(containerId);
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
    buildSeedSelectors();
    if(Object.keys(pitEls).length) renderAll();
    if(state.mode==='online' && channel?.readyState==='open') sendNetwork({ type:'seeds', selectedSeeds:state.selectedSeeds });
  }

  function openHistory(){ $('historyModal').classList.remove('hidden'); }
  function closeHistory(){ $('historyModal').classList.add('hidden'); }

  // ---------------- Wi-Fi / LAN WebRTC multiplayer ----------------
  function supportedOnline(){ return typeof RTCPeerConnection !== 'undefined'; }

  function createPeer(){
    closePeer();
    peer = new RTCPeerConnection({ iceServers: [] }); // LAN-only: no external relay required.
    peer.onconnectionstatechange = () => {
      const value = peer?.connectionState || 'closed';
      onlineStatus.textContent = value;
      networkState.textContent = value;
      if(value==='failed' || value==='disconnected') setMessage('Wi-Fi connection lost. Reconnect from Change Mode.', 'warn');
    };
    peer.ondatachannel = (event) => setupChannel(event.channel);
    return peer;
  }

  function setupChannel(dc){
    channel = dc;
    channel.onopen = () => {
      onlineStatus.textContent = 'Connected';
      startOnlineGame(state.onlineRole || 'guest');
    };
    channel.onclose = () => {
      onlineStatus.textContent = 'Disconnected';
      networkState.textContent = 'Disconnected';
    };
    channel.onerror = () => {
      onlineStatus.textContent = 'Connection error';
    };
    channel.onmessage = async (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      await handleNetworkMessage(msg);
    };
  }

  function sendNetwork(payload){
    if(channel?.readyState==='open') channel.send(JSON.stringify(payload));
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
    if(Array.isArray(s.selectedSeeds) && s.selectedSeeds.length) state.selectedSeeds = s.selectedSeeds.slice();
    state.sowing = false;
    buildSeedSelectors();
    renderAll();
  }

  async function handleNetworkMessage(msg){
    if(msg.type==='move'){
      if(state.sowing || state.gameOver) return;
      if(state.turn===state.localPlayer) return; // reject a move claiming to come from ourselves
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
      buildSeedSelectors(); renderAll();
    }
  }

  function waitForIceGathering(pc){
    if(pc.iceGatheringState==='complete') return Promise.resolve();
    return new Promise(resolve => {
      const check = () => {
        if(pc.iceGatheringState==='complete'){
          pc.removeEventListener('icegatheringstatechange', check);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', check);
      setTimeout(resolve, 5000);
    });
  }

  function encodeDescription(desc){
    const json = JSON.stringify({ type:desc.type, sdp:desc.sdp });
    return btoa(unescape(encodeURIComponent(json)));
  }

  function decodeDescription(code){
    const json = decodeURIComponent(escape(atob(code.trim())));
    const parsed = JSON.parse(json);
    if(!parsed.type || !parsed.sdp) throw new Error('Invalid connection code');
    return parsed;
  }

  async function createHostOffer(){
    try{
      if(!supportedOnline()) throw new Error('This browser does not support WebRTC multiplayer.');
      state.onlineRole = 'host'; state.localPlayer = 1;
      const pc = createPeer();
      setupChannel(pc.createDataChannel('ayo-game', { ordered:true }));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      onlineStatus.textContent = 'Preparing invitation…';
      await waitForIceGathering(pc);
      $('hostOffer').value = encodeDescription(pc.localDescription);
      onlineStatus.textContent = 'Invitation ready';
    } catch(err){ onlineStatus.textContent = 'Error'; alert(err.message); }
  }

  async function createGuestAnswer(){
    try{
      if(!supportedOnline()) throw new Error('This browser does not support WebRTC multiplayer.');
      state.onlineRole = 'guest'; state.localPlayer = 2;
      const remoteOffer = decodeDescription($('guestOfferInput').value);
      const pc = createPeer();
      await pc.setRemoteDescription(remoteOffer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      onlineStatus.textContent = 'Preparing answer…';
      await waitForIceGathering(pc);
      $('guestAnswer').value = encodeDescription(pc.localDescription);
      onlineStatus.textContent = 'Answer ready · send to host';
    } catch(err){ onlineStatus.textContent = 'Error'; alert(`Could not join: ${err.message}`); }
  }

  async function acceptHostAnswer(){
    try{
      if(!peer) throw new Error('Create the host invitation first.');
      const remoteAnswer = decodeDescription($('hostAnswerInput').value);
      await peer.setRemoteDescription(remoteAnswer);
      onlineStatus.textContent = 'Connecting…';
    } catch(err){ onlineStatus.textContent = 'Error'; alert(`Could not connect: ${err.message}`); }
  }

  function closePeer(){
    if(channel){ try{ channel.close(); }catch{} }
    if(peer){ try{ peer.close(); }catch{} }
    channel = null; peer = null;
    onlineStatus.textContent = 'Not connected';
  }

  function showOnlineSetup(){
    menuScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    onlineSetup.classList.remove('hidden');
    onlineStatus.textContent = supportedOnline() ? 'Not connected' : 'WebRTC unavailable';
  }

  function showHostTab(){ $('hostPanel').classList.remove('hidden'); $('joinPanel').classList.add('hidden'); $('hostTabBtn').classList.add('primary'); $('joinTabBtn').classList.remove('primary'); }
  function showJoinTab(){ $('joinPanel').classList.remove('hidden'); $('hostPanel').classList.add('hidden'); $('joinTabBtn').classList.add('primary'); $('hostTabBtn').classList.remove('primary'); }

  async function copyField(id, button){
    const value = $(id).value;
    if(!value) return;
    try{
      await navigator.clipboard.writeText(value);
      const old = button.textContent; button.textContent = 'Copied'; setTimeout(()=>button.textContent=old, 1200);
    }catch{
      $(id).select(); document.execCommand('copy');
    }
  }

  pvpBtn.addEventListener('click', ()=> startMode('pvp'));
  pvcBtn.addEventListener('click', ()=> startMode('pvc'));
  onlineBtn.addEventListener('click', showOnlineSetup);
  $('onlineBackBtn').addEventListener('click', ()=>{ closePeer(); onlineSetup.classList.add('hidden'); menuScreen.classList.remove('hidden'); });
  $('hostTabBtn').addEventListener('click', showHostTab);
  $('joinTabBtn').addEventListener('click', showJoinTab);
  $('createOfferBtn').addEventListener('click', createHostOffer);
  $('createAnswerBtn').addEventListener('click', createGuestAnswer);
  $('acceptAnswerBtn').addEventListener('click', acceptHostAnswer);
  document.querySelectorAll('.copy-btn').forEach(btn => btn.addEventListener('click', ()=>copyField(btn.dataset.copy, btn)));

  menuBtn.addEventListener('click', backToMenu);
  $('newGameBtn').addEventListener('click', ()=>newGame(false));
  $('newMatchBtn').addEventListener('click', ()=>newMatch(false));
  $('rulesBtn').addEventListener('click', ()=>$('rulesPanel').classList.toggle('show'));
  $('historyBtn').addEventListener('click', openHistory);
  $('historyMenuBtn').addEventListener('click', openHistory);
  $('closeHistoryBtn').addEventListener('click', closeHistory);
  $('historyModal').addEventListener('click', (e)=>{ if(e.target.id==='historyModal') closeHistory(); });
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeHistory(); });

  buildSeedSelectors();
  buildBoard();
})();
