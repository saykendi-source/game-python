import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  onValue,
  onDisconnect,
  runTransaction,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';

const INITIAL_SCORE = 80;
const CORRECT_SCORE = 5;
const WRONG_SCORE = -2;
const MAX_SCORE = 100;
const MIN_SCORE = 0;

const QUESTIONS = [
  makeQuestion({
    id: 'q1',
    title: 'Output sederhana',
    prompt: 'Susun program Python untuk menampilkan teks: Hello, Python!',
    parts: [
      ['print', 'print'],
      ['(', '('],
      ['"Hello, Python!"', '"Hello, Python!"'],
      [')', ')']
    ]
  }),
  makeQuestion({
    id: 'q2',
    title: 'Variabel dan operasi aritmatika',
    prompt: 'Susun kode untuk menyimpan nilai panjang dan lebar, lalu menghitung luas persegi panjang.',
    parts: [
      ['panjang', 'panjang'], [' ', 'spasi'], ['=', '='], [' ', 'spasi'], ['10', '10'], ['\n', '↵ Enter'],
      ['lebar', 'lebar'], [' ', 'spasi'], ['=', '='], [' ', 'spasi'], ['5', '5'], ['\n', '↵ Enter'],
      ['luas', 'luas'], [' ', 'spasi'], ['=', '='], [' ', 'spasi'], ['panjang', 'panjang'], [' ', 'spasi'], ['*', '*'], [' ', 'spasi'], ['lebar', 'lebar'], ['\n', '↵ Enter'],
      ['print', 'print'], ['(', '('], ['luas', 'luas'], [')', ')']
    ]
  }),
  makeQuestion({
    id: 'q3',
    title: 'Percabangan if',
    prompt: 'Susun kode untuk mengecek apakah nilai memenuhi syarat lulus atau belum.',
    parts: [
      ['nilai', 'nilai'], [' ', 'spasi'], ['=', '='], [' ', 'spasi'], ['80', '80'], ['\n', '↵ Enter'],
      ['if', 'if'], [' ', 'spasi'], ['nilai', 'nilai'], [' ', 'spasi'], ['>=', '>='], [' ', 'spasi'], ['75', '75'], [':', ':'], ['\n', '↵ Enter'],
      ['    ', '⇥ indentasi'], ['print', 'print'], ['(', '('], ['"Lulus"', '"Lulus"'], [')', ')'], ['\n', '↵ Enter'],
      ['else', 'else'], [':', ':'], ['\n', '↵ Enter'],
      ['    ', '⇥ indentasi'], ['print', 'print'], ['(', '('], ['"Belum lulus"', '"Belum lulus"'], [')', ')']
    ]
  }),
  makeQuestion({
    id: 'q4',
    title: 'Perulangan for',
    prompt: 'Susun kode Python untuk mencetak angka 1 sampai 5 menggunakan for.',
    parts: [
      ['for', 'for'], [' ', 'spasi'], ['i', 'i'], [' ', 'spasi'], ['in', 'in'], [' ', 'spasi'], ['range', 'range'], ['(', '('], ['1', '1'], [',', ','], [' ', 'spasi'], ['6', '6'], [')', ')'], [':', ':'], ['\n', '↵ Enter'],
      ['    ', '⇥ indentasi'], ['print', 'print'], ['(', '('], ['i', 'i'], [')', ')']
    ]
  }),
  makeQuestion({
    id: 'q5',
    title: 'Fungsi sederhana',
    prompt: 'Susun kode untuk membuat fungsi salam, lalu memanggil fungsi tersebut.',
    parts: [
      ['def', 'def'], [' ', 'spasi'], ['salam', 'salam'], ['(', '('], ['nama', 'nama'], [')', ')'], [':', ':'], ['\n', '↵ Enter'],
      ['    ', '⇥ indentasi'], ['print', 'print'], ['(', '('], ['"Halo"', '"Halo"'], [',', ','], [' ', 'spasi'], ['nama', 'nama'], [')', ')'], ['\n\n', '↵↵ Enter'],
      ['salam', 'salam'], ['(', '('], ['"Mahasiswa TI"', '"Mahasiswa TI"'], [')', ')']
    ]
  })
];

const els = {
  loginScreen: document.querySelector('#loginScreen'),
  gameScreen: document.querySelector('#gameScreen'),
  playerName: document.querySelector('#playerName'),
  roomName: document.querySelector('#roomName'),
  loginBtn: document.querySelector('#loginBtn'),
  configWarning: document.querySelector('#configWarning'),
  roomBadge: document.querySelector('#roomBadge'),
  questionTitle: document.querySelector('#questionTitle'),
  questionText: document.querySelector('#questionText'),
  progressText: document.querySelector('#progressText'),
  turnInfo: document.querySelector('#turnInfo'),
  startBtn: document.querySelector('#startBtn'),
  shuffleTurnBtn: document.querySelector('#shuffleTurnBtn'),
  codeOutput: document.querySelector('#codeOutput'),
  messageBox: document.querySelector('#messageBox'),
  playersList: document.querySelector('#playersList'),
  tokenBank: document.querySelector('#tokenBank'),
  myStatus: document.querySelector('#myStatus')
};

let app;
let db;
let roomId = 'kelas-python';
let playerId = localStorage.getItem('pythonQuizPlayerId') || crypto.randomUUID();
let playerName = localStorage.getItem('pythonQuizPlayerName') || '';
let rootRef;
let playersRef;
let playerRef;
let stateRef;
let playersCache = {};
let stateCache = null;
let hasLoggedIn = false;

localStorage.setItem('pythonQuizPlayerId', playerId);

init();

function init() {
  const params = new URLSearchParams(window.location.search);
  const roomFromUrl = sanitizeRoom(params.get('room'));
  if (roomFromUrl) els.roomName.value = roomFromUrl;
  if (playerName) els.playerName.value = playerName;

  if (!isFirebaseConfigured()) {
    els.configWarning.textContent = 'Firebase belum dikonfigurasi. Buka firebase-config.js lalu isi konfigurasi project Firebase terlebih dahulu.';
    els.configWarning.classList.remove('hidden');
    els.loginBtn.disabled = true;
    return;
  }

  app = initializeApp(firebaseConfig);
  db = getDatabase(app);

  els.loginBtn.addEventListener('click', login);
  els.playerName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') login();
  });
  els.startBtn.addEventListener('click', startGame);
  els.shuffleTurnBtn.addEventListener('click', shuffleTurn);
  window.addEventListener('beforeunload', markOffline);
}

async function login() {
  const cleanName = els.playerName.value.trim().slice(0, 30);
  const cleanRoom = sanitizeRoom(els.roomName.value.trim());

  if (!cleanName) {
    alert('Nama pemain belum diisi.');
    return;
  }
  if (!cleanRoom) {
    alert('Kode room belum diisi. Gunakan huruf, angka, atau tanda hubung.');
    return;
  }

  roomId = cleanRoom;
  playerName = cleanName;
  localStorage.setItem('pythonQuizPlayerName', playerName);

  rootRef = ref(db, `pythonQuizGame/rooms/${roomId}`);
  playersRef = ref(db, `pythonQuizGame/rooms/${roomId}/players`);
  playerRef = ref(db, `pythonQuizGame/rooms/${roomId}/players/${playerId}`);
  stateRef = ref(db, `pythonQuizGame/rooms/${roomId}/state`);

  try {
    const existingPlayerSnapshot = await get(playerRef);
    const existingPlayer = existingPlayerSnapshot.val() || {};
    const roomStateSnapshot = await get(stateRef);
    const roomState = roomStateSnapshot.val() || {};
    const shouldResetScoreOnLogin = roomState.status !== 'playing';
    const scoreOnLogin = shouldResetScoreOnLogin
      ? INITIAL_SCORE
      : clampScore(Number.isFinite(Number(existingPlayer.score)) ? Number(existingPlayer.score) : INITIAL_SCORE);

    await update(playerRef, {
      name: playerName,
      online: true,
      joinedAt: existingPlayer.joinedAt || serverTimestamp(),
      lastActive: serverTimestamp(),
      score: scoreOnLogin
    });

    onDisconnect(playerRef).update({
      online: false,
      leftAt: serverTimestamp()
    });
  } catch (error) {
    console.error(error);
    alert('Gagal masuk game. Cek kembali Firebase config, databaseURL, dan Rules.\n\nDetail error: ' + error.message);
    return;
  }

  hasLoggedIn = true;
  els.loginScreen.classList.add('hidden');
  els.gameScreen.classList.remove('hidden');
  els.roomBadge.textContent = `Room: ${roomId}`;
  window.history.replaceState({}, '', `${location.pathname}?room=${roomId}`);

  listenRoom();
}

function listenRoom() {
  onValue(playersRef, (snapshot) => {
    playersCache = snapshot.val() || {};
    renderPlayers();
    ensureValidTurn();
  });

  onValue(stateRef, (snapshot) => {
    stateCache = snapshot.val() || getWaitingState();
    renderGame();
    ensureValidTurn();
  });
}

function renderGame() {
  const state = stateCache || getWaitingState();
  const qIndex = state.questionIndex || 0;
  const question = QUESTIONS[qIndex] || QUESTIONS[0];
  const placedIds = state.placedTokenIds || [];
  const placedCode = placedIds.map((id) => findToken(question, id)?.text || '').join('');
  const isMyTurn = state.status === 'playing' && state.currentTurnUserId === playerId;

  els.questionTitle.textContent = `Level ${qIndex + 1}/${QUESTIONS.length} — ${question.title}`;
  els.questionText.textContent = question.prompt;
  els.progressText.textContent = `${placedIds.length}/${question.tokens.length}`;
  els.codeOutput.textContent = placedCode;
  els.messageBox.textContent = state.message || 'Silakan mulai game.';

  if (state.status === 'finished') {
    els.turnInfo.textContent = 'Game selesai 🎉';
    els.myStatus.textContent = 'Selesai';
    els.myStatus.classList.remove('active');
  } else if (state.status === 'playing') {
    const turnName = state.currentTurnUserName || getPlayerName(state.currentTurnUserId) || 'Pemain';
    els.turnInfo.textContent = `Giliran: ${turnName}`;
    els.myStatus.textContent = isMyTurn ? 'Giliran Anda' : 'Menunggu giliran';
    els.myStatus.classList.toggle('active', isMyTurn);
  } else {
    els.turnInfo.textContent = 'Game belum dimulai';
    els.myStatus.textContent = 'Menunggu mulai';
    els.myStatus.classList.remove('active');
  }

  renderTokens(question, placedIds, isMyTurn && state.status === 'playing');
  renderPlayers();
}

function renderTokens(question, placedIds, enabled) {
  const used = new Set(placedIds);
  els.tokenBank.innerHTML = '';

  const remaining = question.shuffledTokenIds.filter((id) => !used.has(id));
  if (!remaining.length) {
    const empty = document.createElement('div');
    empty.className = 'token-empty';
    empty.textContent = 'Semua potongan pada level ini sudah tersusun.';
    els.tokenBank.appendChild(empty);
    return;
  }

  for (const tokenId of remaining) {
    const token = findToken(question, tokenId);
    if (!token) continue;
    const btn = document.createElement('button');
    btn.className = 'token-btn';
    btn.textContent = token.label;
    btn.title = token.text.replace(/\n/g, 'baris baru');
    btn.disabled = !enabled;
    btn.addEventListener('click', () => answerToken(tokenId));
    els.tokenBank.appendChild(btn);
  }
}

function renderPlayers() {
  if (!hasLoggedIn || !els.playersList) return;

  const state = stateCache || getWaitingState();
  const players = Object.entries(playersCache)
    .map(([id, data]) => ({ id, ...data }))
    .filter((p) => p.online)
    .sort((a, b) => (b.score || 0) - (a.score || 0) || String(a.name).localeCompare(String(b.name)));

  els.playersList.innerHTML = '';
  if (!players.length) {
    els.playersList.innerHTML = '<div class="token-empty">Belum ada pemain online.</div>';
    return;
  }

  for (const p of players) {
    const item = document.createElement('div');
    item.className = `player-item ${state.currentTurnUserId === p.id ? 'turn' : ''}`;

    const score = getPlayerScore(p.id);
    const isMaxed = score >= MAX_SCORE;
    const statusText = isMaxed
      ? 'Poin maksimal'
      : state.currentTurnUserId === p.id
        ? 'Sedang menjawab'
        : 'Online';

    const nameBox = document.createElement('div');
    nameBox.className = 'player-name';
    nameBox.innerHTML = `<strong>${escapeHtml(p.name || 'Tanpa nama')}</strong><span>${statusText}</span>`;

    const scoreBox = document.createElement('div');
    scoreBox.className = state.currentTurnUserId === p.id ? 'turn-pill' : isMaxed ? 'max-pill' : 'score-pill';
    scoreBox.textContent = state.currentTurnUserId === p.id ? 'Giliran' : `${score}/${MAX_SCORE} poin`;

    item.append(nameBox, scoreBox);
    els.playersList.appendChild(item);
  }
}

async function startGame() {
  if (!hasLoggedIn) return;
  await resetScores();
  const chosen = chooseRandomOnline();
  await set(stateRef, {
    status: 'playing',
    questionIndex: 0,
    placedTokenIds: [],
    currentTurnUserId: chosen?.id || playerId,
    currentTurnUserName: chosen?.name || playerName,
    message: `Game dimulai. Setiap pemain mendapat ${INITIAL_SCORE} poin. Benar +${CORRECT_SCORE}, salah ${WRONG_SCORE} poin, maksimal ${MAX_SCORE} poin.`,
    startedAt: Date.now(),
    lastEvent: null
  });
}

async function shuffleTurn() {
  if (!stateRef || !stateCache) return;
  const chosen = chooseRandomOnline(stateCache.currentTurnUserId);
  if (!chosen) return;
  await update(stateRef, {
    currentTurnUserId: chosen.id,
    currentTurnUserName: chosen.name,
    message: `Giliran diacak. Sekarang giliran ${chosen.name}.`
  });
}

async function answerToken(tokenId) {
  const localState = stateCache || getWaitingState();
  if (localState.status !== 'playing') return;
  if (localState.currentTurnUserId !== playerId) return;

  const eventId = crypto.randomUUID();

  try {
    const result = await runTransaction(stateRef, (state) => {
      if (!state || state.status !== 'playing') return state;
      if (state.currentTurnUserId !== playerId) return state;

      const qIndex = state.questionIndex || 0;
      const question = QUESTIONS[qIndex];
      if (!question) return state;

      const placed = Array.isArray(state.placedTokenIds) ? [...state.placedTokenIds] : [];
      const expectedTokenId = question.tokens[placed.length]?.id;
      const chosenToken = findToken(question, tokenId);
      const isCorrect = tokenId === expectedTokenId;
      const nextPlayer = chooseRandomOnline(playerId) || { id: playerId, name: playerName };

      state.lastEvent = {
        eventId,
        by: playerId,
        byName: playerName,
        tokenId,
        correct: isCorrect,
        scoreDelta: isCorrect ? CORRECT_SCORE : WRONG_SCORE,
        at: Date.now()
      };

      if (!isCorrect) {
        state.currentTurnUserId = nextPlayer.id;
        state.currentTurnUserName = nextPlayer.name;
        state.message = `${playerName} memilih “${chosenToken?.label || tokenId}”, belum tepat. Giliran berpindah ke ${nextPlayer.name}.`;
        return state;
      }

      placed.push(tokenId);
      state.placedTokenIds = placed;

      const completedLevel = placed.length >= question.tokens.length;
      if (completedLevel) {
        if (qIndex >= QUESTIONS.length - 1) {
          state.status = 'finished';
          state.currentTurnUserId = '';
          state.currentTurnUserName = '';
          state.message = `Game selesai. Semua source code Python berhasil disusun. Jawaban terakhir oleh ${playerName}.`;
          state.finishedAt = Date.now();
        } else {
          const nextQuestionIndex = qIndex + 1;
          const firstTurn = chooseRandomOnline() || { id: playerId, name: playerName };
          state.questionIndex = nextQuestionIndex;
          state.placedTokenIds = [];
          state.currentTurnUserId = firstTurn.id;
          state.currentTurnUserName = firstTurn.name;
          state.message = `${playerName} menyelesaikan level ${qIndex + 1}. Lanjut ke level ${nextQuestionIndex + 1}.`;
        }
      } else {
        state.currentTurnUserId = nextPlayer.id;
        state.currentTurnUserName = nextPlayer.name;
        state.message = `${playerName} benar memilih “${chosenToken?.label || tokenId}”. Giliran berikutnya: ${nextPlayer.name}.`;
      }

      return state;
    });

    const latest = result.snapshot.val();
    if (result.committed && latest?.lastEvent?.eventId === eventId && latest.lastEvent.correct) {
      await applyScoreDelta(latest.lastEvent.scoreDelta || 0);
      if (latest.status === 'playing') await ensureValidTurn(latest);
    } else if (result.committed && latest?.lastEvent?.eventId === eventId) {
      await applyScoreDelta(latest.lastEvent.scoreDelta || 0);
      if (latest.status === 'playing') await ensureValidTurn(latest);
    } else {
      await update(playerRef, { lastActive: serverTimestamp() });
    }
  } catch (error) {
    console.error(error);
    alert('Terjadi kendala saat mengirim jawaban. Coba klik ulang.');
  }
}

async function ensureValidTurn(stateOverride = stateCache) {
  const state = stateOverride || stateCache;
  if (!stateRef || !state || state.status !== 'playing') return;
  const turnPlayer = playersCache[state.currentTurnUserId];
  if (turnPlayer?.online && getPlayerScore(state.currentTurnUserId) < MAX_SCORE) return;

  const chosen = chooseRandomOnline();
  if (!chosen) {
    await update(stateRef, {
      currentTurnUserId: '',
      currentTurnUserName: '',
      message: `Semua pemain online sudah mencapai ${MAX_SCORE} poin. Tidak ada pemain yang perlu mendapat giliran lagi. Tambahkan pemain baru atau klik Mulai / Ulang.`
    });
    return;
  }

  const reason = turnPlayer?.online
    ? `pemain sebelumnya sudah mencapai ${MAX_SCORE} poin`
    : 'pemain sebelumnya offline';

  await update(stateRef, {
    currentTurnUserId: chosen.id,
    currentTurnUserName: chosen.name,
    message: `Giliran dialihkan otomatis ke ${chosen.name} karena ${reason}.`
  });
}

async function resetScores() {
  const updates = {};
  for (const id of Object.keys(playersCache)) {
    updates[`pythonQuizGame/rooms/${roomId}/players/${id}/score`] = INITIAL_SCORE;
    playersCache[id] = { ...playersCache[id], score: INITIAL_SCORE };
  }
  if (Object.keys(updates).length) {
    await update(ref(db), updates);
  }
}


async function applyScoreDelta(delta) {
  if (!playerRef) return getPlayerScore(playerId);
  if (!delta) {
    await update(playerRef, { lastActive: serverTimestamp() });
    return getPlayerScore(playerId);
  }

  let newScore = INITIAL_SCORE;
  await runTransaction(playerRef, (player) => {
    const currentPlayer = player || {};
    const currentScore = Number.isFinite(Number(currentPlayer.score)) ? Number(currentPlayer.score) : INITIAL_SCORE;
    newScore = clampScore(currentScore + delta);
    return {
      ...currentPlayer,
      name: currentPlayer.name || playerName,
      online: true,
      score: newScore,
      lastActive: Date.now()
    };
  });

  playersCache[playerId] = { ...(playersCache[playerId] || {}), score: newScore, online: true, name: playerName };
  return newScore;
}

function getPlayerScore(id) {
  const score = Number(playersCache[id]?.score);
  return clampScore(Number.isFinite(score) ? score : INITIAL_SCORE);
}

function clampScore(score) {
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, Math.round(score)));
}

function markOffline() {
  if (!playerRef) return;
  update(playerRef, { online: false, leftAt: serverTimestamp() }).catch(() => {});
}

function makeQuestion({ id, title, prompt, parts }) {
  const tokens = parts.map(([text, label], index) => ({
    id: `${id}_${index}`,
    text,
    label
  }));
  return {
    id,
    title,
    prompt,
    tokens,
    shuffledTokenIds: deterministicShuffle(tokens.map((t) => t.id), id)
  };
}

function deterministicShuffle(items, seedText) {
  const arr = [...items];
  let seed = 0;
  for (let i = 0; i < seedText.length; i += 1) seed += seedText.charCodeAt(i) * (i + 1);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    seed = (seed * 9301 + 49297) % 233280;
    const j = Math.floor((seed / 233280) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function findToken(question, tokenId) {
  return question.tokens.find((token) => token.id === tokenId);
}

function chooseRandomOnline(excludeId = '') {
  let players = Object.entries(playersCache)
    .map(([id, data]) => ({
      id,
      name: data.name || 'Pemain',
      online: data.online,
      score: clampScore(Number.isFinite(Number(data.score)) ? Number(data.score) : INITIAL_SCORE)
    }))
    .filter((p) => p.online && p.score < MAX_SCORE);

  if (excludeId && players.length > 1) {
    players = players.filter((p) => p.id !== excludeId);
  }

  if (!players.length) return null;
  return players[Math.floor(Math.random() * players.length)];
}

function getPlayerName(id) {
  return playersCache[id]?.name || '';
}

function getWaitingState() {
  return {
    status: 'waiting',
    questionIndex: 0,
    placedTokenIds: [],
    currentTurnUserId: '',
    currentTurnUserName: '',
    message: 'Silakan klik Mulai / Ulang untuk memulai game.'
  };
}

function sanitizeRoom(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function isFirebaseConfigured() {
  const text = JSON.stringify(firebaseConfig);
  return firebaseConfig?.apiKey && !text.includes('ISI_') && !text.includes('NAMA_PROJECT');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
