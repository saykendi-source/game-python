import { firebaseConfig } from './firebase-config.js';
import { gameConfig } from './game-config.js';
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
const TURN_SECONDS = Math.max(5, Number(gameConfig?.turnSeconds || 30));

const DEFAULT_QUESTION_BANK = [
  {
    id: 'q1',
    title: 'Output sederhana',
    prompt: 'Susun program Python untuk menampilkan teks: Hello, Python!',
    parts: [
      ['print', 'print'],
      ['(', '('],
      ['"Hello, Python!"', '"Hello, Python!"'],
      [')', ')']
    ]
  },
  {
    id: 'q2',
    title: 'Variabel dan operasi aritmatika',
    prompt: 'Susun kode untuk menyimpan nilai panjang dan lebar, lalu menghitung luas persegi panjang.',
    parts: [
      ['panjang', 'panjang'], [' ', 'spasi'], ['=', '='], [' ', 'spasi'], ['10', '10'], ['\n', '↵ Enter'],
      ['lebar', 'lebar'], [' ', 'spasi'], ['=', '='], [' ', 'spasi'], ['5', '5'], ['\n', '↵ Enter'],
      ['luas', 'luas'], [' ', 'spasi'], ['=', '='], [' ', 'spasi'], ['panjang', 'panjang'], [' ', 'spasi'], ['*', '*'], [' ', 'spasi'], ['lebar', 'lebar'], ['\n', '↵ Enter'],
      ['print', 'print'], ['(', '('], ['luas', 'luas'], [')', ')']
    ]
  },
  {
    id: 'q3',
    title: 'Percabangan if',
    prompt: 'Susun kode untuk mengecek apakah nilai memenuhi syarat lulus atau belum.',
    code: 'nilai = 80\nif nilai >= 75:\n    print("Lulus")\nelse:\n    print("Belum lulus")'
  },
  {
    id: 'q4',
    title: 'Perulangan for',
    prompt: 'Susun kode Python untuk mencetak angka 1 sampai 5 menggunakan for.',
    code: 'for i in range(1, 6):\n    print(i)'
  },
  {
    id: 'q5',
    title: 'Fungsi sederhana',
    prompt: 'Susun kode untuk membuat fungsi salam, lalu memanggil fungsi tersebut.',
    code: 'def salam(nama):\n    print("Halo", nama)\n\nsalam("Mahasiswa TI")'
  }
];

let QUESTIONS = buildQuestions(DEFAULT_QUESTION_BANK);

const els = {
  loginScreen: document.querySelector('#loginScreen'),
  gameScreen: document.querySelector('#gameScreen'),
  playerName: document.querySelector('#playerName'),
  roomName: document.querySelector('#roomName'),
  adminCode: document.querySelector('#adminCode'),
  loginBtn: document.querySelector('#loginBtn'),
  configWarning: document.querySelector('#configWarning'),
  roomBadge: document.querySelector('#roomBadge'),
  questionTitle: document.querySelector('#questionTitle'),
  questionText: document.querySelector('#questionText'),
  progressText: document.querySelector('#progressText'),
  timerText: document.querySelector('#timerText'),
  adminStatus: document.querySelector('#adminStatus'),
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
let isAdmin = false;
let rootRef;
let playersRef;
let playerRef;
let stateRef;
let playersCache = {};
let stateCache = null;
let hasLoggedIn = false;
let timerInterval = null;
let timeoutInProgress = false;
let audioContext = null;

localStorage.setItem('pythonQuizPlayerId', playerId);

init();

async function init() {
  const params = new URLSearchParams(window.location.search);
  const roomFromUrl = sanitizeRoom(params.get('room'));
  if (roomFromUrl) els.roomName.value = roomFromUrl;
  if (playerName) els.playerName.value = playerName;

  await loadQuestionBank();

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
  els.roomName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') login();
  });
  els.adminCode?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') login();
  });
  els.startBtn.addEventListener('click', startGame);
  els.shuffleTurnBtn.addEventListener('click', shuffleTurn);
  window.addEventListener('beforeunload', markOffline);

  timerInterval = window.setInterval(tickTimer, 500);
}

async function login() {
  const cleanName = els.playerName.value.trim().slice(0, 30);
  const cleanRoom = sanitizeRoom(els.roomName.value.trim());
  const enteredAdminCode = String(els.adminCode?.value || '').trim();

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
  isAdmin = Boolean(enteredAdminCode && enteredAdminCode === String(gameConfig?.adminCode || ''));
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
      role: isAdmin ? 'admin' : 'player',
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
  updateAdminControls();
  tickTimer();
}

function listenRoom() {
  onValue(playersRef, (snapshot) => {
    playersCache = snapshot.val() || {};
    renderPlayers();
    ensureValidTurn();
    updateAdminControls();
  });

  onValue(stateRef, (snapshot) => {
    stateCache = snapshot.val() || getWaitingState();
    renderGame();
    ensureValidTurn();
    updateAdminControls();
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
  tickTimer(false);
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
    .sort((a, b) => {
      const roleSort = (b.role === 'admin') - (a.role === 'admin');
      return roleSort || (b.score || 0) - (a.score || 0) || String(a.name).localeCompare(String(b.name));
    });

  els.playersList.innerHTML = '';
  if (!players.length) {
    els.playersList.innerHTML = '<div class="token-empty">Belum ada pemain online.</div>';
    return;
  }

  for (const p of players) {
    const item = document.createElement('div');
    const score = getPlayerScore(p.id);
    const isMaxed = score >= MAX_SCORE;
    const isTurn = state.currentTurnUserId === p.id;
    const isPlayerAdmin = p.role === 'admin';

    item.className = `player-item ${isTurn ? 'turn' : ''} ${isMaxed ? 'completed' : ''} ${isPlayerAdmin ? 'admin-player' : ''}`;

    const statusText = isMaxed
      ? 'Poin maksimal • tetap di room'
      : isTurn
        ? 'Sedang menjawab'
        : isPlayerAdmin
          ? 'Guru/Admin'
          : 'Online';

    const nameBox = document.createElement('div');
    nameBox.className = 'player-name';
    nameBox.innerHTML = `<strong>${escapeHtml(p.name || 'Tanpa nama')}</strong><span>${statusText}</span>`;

    const metaBox = document.createElement('div');
    metaBox.className = 'player-meta';

    const scoreBox = document.createElement('div');
    scoreBox.className = 'score-pill';
    scoreBox.textContent = `${score}/${MAX_SCORE} poin`;
    metaBox.appendChild(scoreBox);

    if (isTurn) {
      const turnBox = document.createElement('div');
      turnBox.className = 'turn-pill';
      turnBox.textContent = 'Giliran';
      metaBox.appendChild(turnBox);
    } else if (isMaxed) {
      const maxBox = document.createElement('div');
      maxBox.className = 'max-pill';
      maxBox.textContent = 'Maks';
      metaBox.appendChild(maxBox);
    } else if (isPlayerAdmin) {
      const adminBox = document.createElement('div');
      adminBox.className = 'admin-pill';
      adminBox.textContent = 'Admin';
      metaBox.appendChild(adminBox);
    } else {
      const onlineBox = document.createElement('div');
      onlineBox.className = 'online-pill';
      onlineBox.textContent = 'Online';
      metaBox.appendChild(onlineBox);
    }

    item.append(nameBox, metaBox);
    els.playersList.appendChild(item);
  }
}

async function startGame() {
  if (!hasLoggedIn) return;
  if (!isCurrentUserAdmin()) {
    alert('Hanya guru/admin yang bisa menekan Mulai/Ulang. Masuk ulang dengan kode guru/admin.');
    return;
  }
  await resetScores();
  const chosen = chooseRandomOnline();
  await set(stateRef, {
    status: 'playing',
    questionIndex: 0,
    placedTokenIds: [],
    currentTurnUserId: chosen?.id || '',
    currentTurnUserName: chosen?.name || '',
    ...makeTurnTimer(),
    message: `Game dimulai. Setiap pemain mendapat ${INITIAL_SCORE} poin. Benar +${CORRECT_SCORE}, salah ${WRONG_SCORE} poin, maksimal ${MAX_SCORE} poin. Timer per giliran ${TURN_SECONDS} detik.`,
    startedAt: Date.now(),
    lastEvent: null
  });
}

async function shuffleTurn() {
  if (!stateRef || !stateCache) return;
  if (!isCurrentUserAdmin()) {
    alert('Hanya guru/admin yang bisa mengacak giliran.');
    return;
  }
  const chosen = chooseRandomOnline(stateCache.currentTurnUserId);
  if (!chosen) return;
  await update(stateRef, {
    currentTurnUserId: chosen.id,
    currentTurnUserName: chosen.name,
    ...makeTurnTimer(),
    message: `Giliran diacak oleh guru/admin. Sekarang giliran ${chosen.name}.`
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
      if (Number(state.turnEndsAt || 0) <= Date.now()) return state;

      const qIndex = state.questionIndex || 0;
      const question = QUESTIONS[qIndex];
      if (!question) return state;

      const placed = Array.isArray(state.placedTokenIds) ? [...state.placedTokenIds] : [];
      const expectedToken = question.tokens[placed.length];
      const chosenToken = findToken(question, tokenId);
      const isCorrect = Boolean(chosenToken && expectedToken && chosenToken.text === expectedToken.text);
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
        Object.assign(state, makeTurnTimer());
        state.message = `${playerName} memilih “${chosenToken?.label || tokenId}”, belum tepat. Poin berkurang ${Math.abs(WRONG_SCORE)}. Giliran berpindah ke ${nextPlayer.name}.`;
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
          state.turnStartedAt = 0;
          state.turnEndsAt = 0;
          state.message = `Game selesai. Semua source code Python berhasil disusun. Jawaban terakhir oleh ${playerName}.`;
          state.finishedAt = Date.now();
        } else {
          const nextQuestionIndex = qIndex + 1;
          const firstTurn = chooseRandomOnline() || { id: playerId, name: playerName };
          state.questionIndex = nextQuestionIndex;
          state.placedTokenIds = [];
          state.currentTurnUserId = firstTurn.id;
          state.currentTurnUserName = firstTurn.name;
          Object.assign(state, makeTurnTimer());
          state.message = `${playerName} menyelesaikan level ${qIndex + 1}. Lanjut ke level ${nextQuestionIndex + 1}.`;
        }
      } else {
        state.currentTurnUserId = nextPlayer.id;
        state.currentTurnUserName = nextPlayer.name;
        Object.assign(state, makeTurnTimer());
        state.message = `${playerName} benar memilih “${chosenToken?.label || tokenId}”. Poin bertambah ${CORRECT_SCORE}. Giliran berikutnya: ${nextPlayer.name}.`;
      }

      return state;
    });

    const latest = result.snapshot.val();
    if (result.committed && latest?.lastEvent?.eventId === eventId) {
      await applyScoreDelta(latest.lastEvent.scoreDelta || 0);
      playFeedbackSound(Boolean(latest.lastEvent.correct));
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
  if (turnPlayer?.online && getPlayerScore(state.currentTurnUserId) < MAX_SCORE && state.currentTurnUserId) return;

  const chosen = chooseRandomOnline();
  if (!chosen) {
    await update(stateRef, {
      currentTurnUserId: '',
      currentTurnUserName: '',
      turnStartedAt: 0,
      turnEndsAt: 0,
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
    ...makeTurnTimer(),
    message: `Giliran dialihkan otomatis ke ${chosen.name} karena ${reason}.`
  });
}

async function handleTurnTimeout() {
  if (timeoutInProgress || !stateRef || !stateCache || stateCache.status !== 'playing') return;
  if (!stateCache.currentTurnUserId || !stateCache.turnEndsAt) return;
  if (Date.now() < Number(stateCache.turnEndsAt)) return;

  timeoutInProgress = true;
  const expiredUserId = stateCache.currentTurnUserId;
  const expiredName = stateCache.currentTurnUserName || getPlayerName(expiredUserId) || 'Pemain';

  try {
    await runTransaction(stateRef, (state) => {
      if (!state || state.status !== 'playing') return state;
      if (state.currentTurnUserId !== expiredUserId) return state;
      if (Date.now() < Number(state.turnEndsAt || 0)) return state;

      const nextPlayer = chooseRandomOnline(expiredUserId);
      if (!nextPlayer) {
        state.currentTurnUserId = '';
        state.currentTurnUserName = '';
        state.turnStartedAt = 0;
        state.turnEndsAt = 0;
        state.message = `Waktu ${expiredName} habis. Belum ada pemain lain yang bisa mendapat giliran.`;
        return state;
      }

      state.currentTurnUserId = nextPlayer.id;
      state.currentTurnUserName = nextPlayer.name;
      Object.assign(state, makeTurnTimer());
      state.message = `Waktu ${expiredName} habis. Giliran berpindah ke ${nextPlayer.name}.`;
      state.lastEvent = {
        eventId: crypto.randomUUID(),
        by: expiredUserId,
        byName: expiredName,
        timeout: true,
        at: Date.now()
      };
      return state;
    });
  } catch (error) {
    console.error(error);
  } finally {
    timeoutInProgress = false;
  }
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
      role: currentPlayer.role || (isAdmin ? 'admin' : 'player'),
      score: newScore,
      lastActive: Date.now()
    };
  });

  playersCache[playerId] = { ...(playersCache[playerId] || {}), score: newScore, online: true, name: playerName };
  return newScore;
}

function tickTimer(allowTimeout = true) {
  if (!els.timerText) return;
  const state = stateCache || getWaitingState();
  if (state.status !== 'playing' || !state.turnEndsAt || !state.currentTurnUserId) {
    els.timerText.textContent = '--';
    els.timerText.parentElement?.classList.remove('timer-warning', 'timer-danger');
    return;
  }

  const remaining = Math.max(0, Math.ceil((Number(state.turnEndsAt) - Date.now()) / 1000));
  els.timerText.textContent = `${remaining}s`;
  els.timerText.parentElement?.classList.toggle('timer-warning', remaining <= 10 && remaining > 5);
  els.timerText.parentElement?.classList.toggle('timer-danger', remaining <= 5);

  if (allowTimeout && remaining <= 0) {
    handleTurnTimeout();
  }
}

function makeTurnTimer() {
  const now = Date.now();
  return {
    turnStartedAt: now,
    turnEndsAt: now + TURN_SECONDS * 1000,
    turnDurationSeconds: TURN_SECONDS
  };
}

function updateAdminControls() {
  if (!hasLoggedIn) return;
  const admin = isCurrentUserAdmin();
  els.startBtn.disabled = !admin;
  els.shuffleTurnBtn.disabled = !admin;
  els.startBtn.title = admin ? 'Mulai atau ulang game' : 'Hanya guru/admin yang bisa menekan tombol ini';
  els.shuffleTurnBtn.title = admin ? 'Acak giliran pemain' : 'Hanya guru/admin yang bisa menekan tombol ini';
  if (els.adminStatus) {
    els.adminStatus.textContent = admin ? 'Mode guru/admin' : 'Mode pemain';
    els.adminStatus.classList.toggle('active', admin);
  }
}

function isCurrentUserAdmin() {
  return Boolean(isAdmin || playersCache[playerId]?.role === 'admin');
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

async function loadQuestionBank() {
  const source = gameConfig?.questionSource || { type: 'json', url: './questions.json' };
  try {
    if (!source.url) throw new Error('questionSource.url belum diisi.');
    const response = await fetch(source.url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Gagal mengambil bank soal: HTTP ${response.status}`);

    let rawQuestions = [];
    const sourceType = String(source.type || 'json').toLowerCase();
    if (sourceType === 'spreadsheet' || sourceType === 'csv') {
      const csvText = await response.text();
      rawQuestions = rowsToQuestions(parseCSV(csvText));
    } else {
      const json = await response.json();
      rawQuestions = Array.isArray(json) ? json : (json.questions || []);
    }

    const built = buildQuestions(rawQuestions);
    if (built.length) QUESTIONS = built;
  } catch (error) {
    console.warn('Menggunakan bank soal bawaan karena bank soal eksternal belum terbaca:', error);
    QUESTIONS = buildQuestions(DEFAULT_QUESTION_BANK);
  }
}

function buildQuestions(rawQuestions) {
  return (rawQuestions || [])
    .map((raw, index) => normalizeQuestion(raw, index))
    .filter((q) => q.parts.length)
    .map(makeQuestion);
}

function normalizeQuestion(raw, index) {
  const id = sanitizeId(raw.id || raw.kode || raw.no || `q${index + 1}`);
  const title = raw.title || raw.judul || raw.nama || `Soal ${index + 1}`;
  const prompt = raw.prompt || raw.soal || raw.pertanyaan || raw.instruksi || title;
  const code = raw.code ?? raw.kode_program ?? raw.sourceCode ?? raw.source_code ?? raw.jawaban ?? '';
  const parts = normalizeParts(raw.parts ?? raw.potongan ?? raw.tokens ?? '', code);
  return { id, title, prompt, parts };
}

function normalizeParts(parts, code = '') {
  if (Array.isArray(parts) && parts.length) {
    return parts.map((part) => {
      if (Array.isArray(part)) return [decodeTokenValue(part[0]), part[1] || labelForText(decodeTokenValue(part[0]))];
      if (part && typeof part === 'object') {
        const text = decodeTokenValue(part.text ?? part.value ?? part.token ?? '');
        return [text, part.label || labelForText(text)];
      }
      const text = decodeTokenValue(part);
      return [text, labelForText(text)];
    }).filter(([text]) => text !== '');
  }

  if (typeof parts === 'string' && parts.trim()) {
    return splitPartsString(parts).map((item) => {
      const [rawText, rawLabel] = item.includes('::') ? item.split('::') : [item, ''];
      const text = decodeTokenValue(rawText);
      return [text, rawLabel || labelForText(text)];
    }).filter(([text]) => text !== '');
  }

  if (typeof code === 'string' && code) {
    return tokenizeCode(code);
  }

  return [];
}

function splitPartsString(value) {
  return String(value)
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

function decodeTokenValue(value) {
  const text = String(value ?? '');
  const lowered = text.toLowerCase();
  if (['\\n', '{enter}', '[enter]', '<enter>'].includes(lowered)) return '\n';
  if (['\\n\\n', '{enter2}', '[enter2]', '<enter2>'].includes(lowered)) return '\n\n';
  if (['\\s', '{space}', '[space]', '<space>'].includes(lowered)) return ' ';
  if (['\\t', '{tab}', '[tab]', '<tab>', '{indent}', '[indent]', '<indent>'].includes(lowered)) return '    ';
  return text.replaceAll('\\n', '\n').replaceAll('\\t', '    ');
}

function tokenizeCode(code) {
  const source = String(code).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const parts = [];
  const punctuation = new Set(['(', ')', '[', ']', '{', '}', ':', ',', '.', '+', '-', '*', '/', '%', '=', '<', '>', '!']);
  let i = 0;

  while (i < source.length) {
    const char = source[i];

    if (char === '\n') {
      let value = '';
      while (source[i] === '\n') {
        value += '\n';
        i += 1;
      }
      parts.push([value, labelForText(value)]);
      continue;
    }

    if (char === ' ' || char === '\t') {
      let value = '';
      while (source[i] === ' ' || source[i] === '\t') {
        value += source[i] === '\t' ? '    ' : ' ';
        i += 1;
      }
      parts.push([value, labelForText(value)]);
      continue;
    }

    if (char === '"' || char === "'") {
      const quote = char;
      let value = char;
      i += 1;
      while (i < source.length) {
        value += source[i];
        if (source[i] === quote && source[i - 1] !== '\\') {
          i += 1;
          break;
        }
        i += 1;
      }
      parts.push([value, value]);
      continue;
    }

    if (punctuation.has(char)) {
      const two = source.slice(i, i + 2);
      if (['==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '//', '**'].includes(two)) {
        parts.push([two, two]);
        i += 2;
      } else {
        parts.push([char, char]);
        i += 1;
      }
      continue;
    }

    let value = '';
    while (i < source.length && !['\n', ' ', '\t', '"', "'"].includes(source[i]) && !punctuation.has(source[i])) {
      value += source[i];
      i += 1;
    }
    if (value) parts.push([value, value]);
  }

  return parts;
}

function labelForText(text) {
  if (text === ' ') return 'spasi';
  if (/^ +$/.test(text)) return text.length === 4 ? '⇥ indentasi' : `${text.length} spasi`;
  if (/^\n+$/.test(text)) return text.length === 1 ? '↵ Enter' : `↵ Enter x${text.length}`;
  if (text === '\t' || text === '    ') return '⇥ indentasi';
  return text;
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some((value) => String(value).trim() !== '')) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => String(value).trim() !== '')) rows.push(row);

  if (!rows.length) return [];
  const headers = rows.shift().map((header) => String(header).trim());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function rowsToQuestions(rows) {
  return rows.map((row, index) => ({
    id: row.id || row.ID || row.no || row.No || `q${index + 1}`,
    title: row.title || row.judul || row.Judul || row.nama || `Soal ${index + 1}`,
    prompt: row.prompt || row.soal || row.Soal || row.pertanyaan || row.Pertanyaan || '',
    code: row.code || row.kode || row.Kode || row.jawaban || row.Jawaban || '',
    parts: row.parts || row.potongan || row.Potongan || ''
  }));
}

function makeQuestion({ id, title, prompt, parts }) {
  const tokens = parts.map(([text, label], index) => ({
    id: `${id}_${index}`,
    text,
    label: label || labelForText(text)
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
    turnStartedAt: 0,
    turnEndsAt: 0,
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

function sanitizeId(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || `q-${crypto.randomUUID().slice(0, 8)}`;
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

function playFeedbackSound(isCorrect) {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();

    const now = audioContext.currentTime;
    const gain = audioContext.createGain();
    gain.connect(audioContext.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    const tones = isCorrect ? [660, 880] : [260, 180];
    tones.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      oscillator.type = isCorrect ? 'sine' : 'sawtooth';
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.11);
      oscillator.connect(gain);
      oscillator.start(now + index * 0.11);
      oscillator.stop(now + index * 0.11 + 0.13);
    });
  } catch (error) {
    console.warn('Audio feedback tidak tersedia di browser ini:', error);
  }
}
