// Use config from snake.js
// Fallback if config didn't load
if (!window.GAME_CONFIG) {
  window.GAME_CONFIG = {
    grid: { width: 72, height: 80, cellSize: 5, drawSize: 5 },
    initialPosition: { x: 10, y: 5 },
    initialLength: 3,
    speed: { player: 120, enemy: 120, boss: { normal: 120, rage: 60 } },
    timings: { gameLoop: 120, blueAppleSpawn: 8000, greenAppleSpawn: 16000, enemySpawn: 20000 },
    foodGrowth: { red: 2, blue: 8, green: 15 },
    boss: { baseSpeedMs: 120, rageSpeedMs: 60, rageIntervalMs: 5000, rageDurationMs: 3000, initialLength: 20, baseColor: '#b5c6ff', rageColor: '#ff4444', highlightColor: '#ef4444' },
    audio: { introVolume: 0.35, bgVolume: 0.35, gameOverVolume: 1.0 }
  };
  console.warn('GAME_CONFIG not found, using defaults');
}

// Use config from config.js
const WS_URL = window.GAME_CONFIG?.multiplayer?.wsUrl || 'wss://multiplayer-snake-9g07.onrender.com';

const mainMenu = document.getElementById('mainMenu');
const levelScreen = document.getElementById('levelScreen');
const multiplayerMenu = document.getElementById('multiplayerMenu');
const roomScreen = document.getElementById('roomScreen');
const gameScreen = document.getElementById('gameScreen');

const singlePlayerBtn = document.getElementById('singlePlayerBtn');
const level1Btn = document.getElementById('level1Btn');
const level2Btn = document.getElementById('level2Btn');
const level3Btn = document.getElementById('level3Btn');
const level4Btn = document.getElementById('level4Btn');
const level5Btn =
  document.getElementById('level5Btn');
const level6Btn =
  document.getElementById('level6Btn');
const backFromLevelBtn =
  document.getElementById('backFromLevelBtn');

const multiplayerBtn = document.getElementById('multiplayerBtn');
const backToMenuBtn = document.getElementById('backToMenuBtn');

const playerNameInput = document.getElementById('playerName');
const createRoomNameInput = document.getElementById('createRoomName');
const searchRoomNameInput = document.getElementById('searchRoomName');

const createRoomBtn = document.getElementById('createRoomBtn');
const searchRoomsBtn = document.getElementById('searchRoomsBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');

const availableRooms =
  document.getElementById('availableRooms');

const roomTitle = document.getElementById('roomTitle');
const playerList = document.getElementById('playerList');
const readyBtn = document.getElementById('readyBtn');
const startRoomBtn = document.getElementById('startRoomBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const roomLevelButtons =
  document.querySelectorAll('.room-level-button');

const roomLevelStatus =
  document.getElementById('roomLevelStatus');
const roomMessage = document.getElementById('roomMessage');
const roomStatus = document.getElementById('roomStatus');

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const statusEl = document.getElementById('status');
const pauseBtn = document.getElementById('pause');
const restartBtn = document.getElementById('restart');
const menuBtn = document.getElementById('menuBtn');
const gameOverLogo = document.getElementById('gameOverLogo');
const controlButtons = document.querySelectorAll('.controls button');

const introMusic = document.getElementById('introMusic');
const bgMusic = document.getElementById('bgMusic');
const gameOverSound = document.getElementById('gameOverSound');
const bossMusic = document.getElementById('bossMusic');
const gameBackground = new Image();
gameBackground.src = 'Sbackground.jpg';

let ws = null;
let socketReadyPromise = null;
let mode = 'menu';
let selectedLevel = 1;
let multiplayerLevel = 1;
let obstacles = [];
let isHost = false;
let myId = null;
let currentRoom = '';
let isReady = false;
let isPaused = false;

let players = {};

// Countdown and winner display
let countdownValue = 60;
let countdownTimerInterval = null;
let countdownElement = null;
let winnerMessageElement = null;
let introMessageElement = null;
let introMessageTimeout = null;

let food = [
  {
    x: 10,
    y: 10,
    type: 'red'
  }
];

// Grid settings from config.js
let gridWidth = window.GAME_CONFIG?.grid?.width || 72;
let gridHeight = window.GAME_CONFIG?.grid?.height || 80;
let size = window.GAME_CONFIG?.grid?.cellSize || 5;
const drawSize = window.GAME_CONFIG?.grid?.drawSize || 5;

// Initial snake from config.js
const initialPos = window.GAME_CONFIG?.initialPosition || { x: 10, y: 5 };
const initialLen = window.GAME_CONFIG?.initialLength || 3;

let localSnake = [];
for (let i = 0; i < initialLen; i++) {
  localSnake.push({ x: initialPos.x - i, y: initialPos.y });
}

let localDir = 'right';
let localNextDir = 'right';
let localGrow = 0;
let localScore = 0;
let localAlive = true;
let localGameOverShown = false;

let offlineBlueTimer = null;
let offlineGreenTimer = null;
let offlineEnemyTimer = null;
let enemyMoveTimer = null;
let playerMoveTimer = null;
let bossMoveTimer = null;

let enemies = [];
let remoteBoss = null;
let bossSnake = null;
let bossTimers = {
  rage: null,
  blink: null
};
let bossRageActive = false;
let bossRageEndTime = 0;
let bossPatrolTarget = null;
function showScreen(screen) {
  mainMenu.classList.add('hidden');
  levelScreen.classList.add('hidden');
  multiplayerMenu.classList.add('hidden');
  roomScreen.classList.add('hidden');
  gameScreen.classList.add('hidden');

  screen.classList.remove('hidden');

  // Create countdown and winner message elements if not already created
  if (screen.id === 'gameScreen') {
    createCountdownAndWinnerElements();
  }
}

function createCountdownAndWinnerElements() {
  if (countdownElement) return; // already created

  // Countdown element
  countdownElement = document.createElement('div');
  countdownElement.id = 'countdownDisplay';
  countdownElement.style.cssText = `
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.7);
    border: 2px solid #38bdf8;
    border-radius: 8px;
    padding: 6px 14px;
    color: #fff;
    font-size: 18px;
    font-weight: bold;
    z-index: 100;
    display: none;
  `;
  countdownElement.textContent = '60';

  const canvasWrap = document.querySelector('.canvas-wrap');
  if (canvasWrap) {
    canvasWrap.appendChild(countdownElement);
  }

  // Winner message element
  winnerMessageElement = document.createElement('div');
  winnerMessageElement.id = 'winnerMessage';
  winnerMessageElement.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.85);
    border: 3px solid #ff4444;
    border-radius: 16px;
    padding: 24px 32px;
    color: #ffb3b3;
    font-size: 28px;
    font-weight: bold;
    text-align: center;
    z-index: 200;
    display: none;
    text-shadow:
      0 0 8px #ff4444,
      0 0 16px #ff4444,
      2px 2px 0 #8b0000,
      -2px -2px 0 #8b0000;
    animation: blinkWinner 0.15s infinite;
  `;
  winnerMessageElement.innerHTML = '';

  if (canvasWrap) {
    canvasWrap.appendChild(winnerMessageElement);
  }

  // Intro message element
  introMessageElement = document.createElement('div');
  introMessageElement.id = 'introMessage';
  introMessageElement.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.9);
    border: 3px solid #ff6666;
    border-radius: 16px;
    padding: 24px 32px;
    color: #ffcccc;
    font-size: 22px;
    font-weight: bold;
    text-align: center;
    z-index: 150;
    display: none;
    text-shadow:
      0 0 10px #ff4444,
      0 0 20px #ff4444,
      2px 2px 0 #8b0000,
      -2px -2px 0 #8b0000,
      3px 3px 0 #660000;
  `;
  introMessageElement.innerHTML = '';

  if (canvasWrap) {
    canvasWrap.appendChild(introMessageElement);
  }

  // Add blinking animation style
  const style = document.createElement('style');
  style.textContent = `
    @keyframes blinkWinner {
      0% { color: #ffb3b3; }
      50% { color: #ffffff; }
      100% { color: #ffb3b3; }
    }
  `;
  document.head.appendChild(style);
}

function setRoomMessage(message) {
  roomMessage.textContent = message || '';
}

function setRoomStatus(message) {
  roomStatus.textContent = message || '';
}

function setRoomStatus(message) {
  roomStatus.textContent = message || '';
}

function showIntroMessage(message) {
  if (!introMessageElement) return;

  introMessageElement.innerHTML = message.replace(/, /g, '<br>');
  introMessageElement.style.display = 'block';

  // Reset countdown
  stopCountdown();
  countdownValue = 60;

  // Hide after 4 seconds
  clearTimeout(introMessageTimeout);
  introMessageTimeout = setTimeout(() => {
    introMessageElement.style.display = 'none';
    // Now allow player control
    isPaused = false;
    setStatus(`Level ${multiplayerLevel}`);
  }, 4000);
}

function startCountdown(seconds) {
  clearInterval(countdownTimerInterval);

  countdownValue = seconds;

  if (countdownElement) {
    countdownElement.textContent = countdownValue;
    countdownElement.style.display = 'block';
  }

  countdownTimerInterval = setInterval(() => {
    countdownValue--;

    if (countdownElement) {
      countdownElement.textContent = countdownValue;
    }

    if (countdownValue <= 0) {
      clearInterval(countdownTimerInterval);
      countdownTimerInterval = null;

      if (countdownElement) {
        countdownElement.style.display = 'none';
      }
    }
  }, 1000);
}

function stopCountdown() {
  clearInterval(countdownTimerInterval);
  countdownTimerInterval = null;

  if (countdownElement) {
    countdownElement.style.display = 'none';
  }
}

function showWinnerMessage(winnerName) {
  if (!winnerMessageElement) return;

  stopCountdown();
  stopGameMusic();
  stopBossMusic();

  // Play winner or noWinner music
  const winnerAudio = document.getElementById('winnerMusic');
  const noWinnerAudio = document.getElementById('noWinnerMusic');

  if (winnerName === 'NO WINNER') {
    if (noWinnerAudio) {
      noWinnerAudio.currentTime = 0;
      noWinnerAudio.play().catch(() => {});
    }
  } else {
    if (winnerAudio) {
      winnerAudio.currentTime = 0;
      winnerAudio.play().catch(() => {});
    }
  }

  const names = winnerName.split(' & ');
  let html = 'WINNER<br><br>';

  for (const name of names) {
    html += `${name}<br>`;
  }

  winnerMessageElement.innerHTML = html;
  winnerMessageElement.style.display = 'block';
}

function hideWinnerMessage() {
  if (!winnerMessageElement) return;

  winnerMessageElement.style.display = 'none';
  winnerMessageElement.innerHTML = '';
}

function setStatus(text) {
  statusEl.textContent = text;
}

function playIntroMusic() {
  if (!introMusic) return;

  stopGameMusic();
  stopBossMusic();

  introMusic.volume =
    window.GAME_CONFIG?.audio?.introVolume || 0.35;

  if (introMusic.paused) {
    const attempt = introMusic.play();

    if (attempt !== undefined) {
      attempt.catch(() => {
        console.log('Intro music requires user interaction.');
      });
    }
  }
}

function stopIntroMusic() {
  if (!introMusic) return;

  introMusic.pause();
  introMusic.currentTime = 0;
}

function playGameMusic() {
  if (!bgMusic) return;

  stopIntroMusic();
  stopBossMusic();

  bgMusic.volume =
    window.GAME_CONFIG?.audio?.bgVolume || 0.35;

  bgMusic.loop = true;

  if (bgMusic.paused) {
    bgMusic.play().catch(() => {});
  }
}

function playBossMusic() {
  if (!bossMusic) return;

  stopIntroMusic();
  stopGameMusic();

  bossMusic.volume =
    window.GAME_CONFIG?.audio?.bgVolume || 0.35;

  bossMusic.loop = true;

  if (bossMusic.paused) {
    bossMusic.play().catch(() => {});
  }
}

function stopBossMusic() {
  if (!bossMusic) return;

  bossMusic.pause();
  bossMusic.currentTime = 0;
}



function stopGameMusic() {
  if (!bgMusic) return;

  bgMusic.pause();
  bgMusic.currentTime = 0;
}

function stopWinnerMusic() {
  const winnerAudio = document.getElementById('winnerMusic');
  const noWinnerAudio = document.getElementById('noWinnerMusic');

  if (winnerAudio) {
    winnerAudio.pause();
    winnerAudio.currentTime = 0;
  }

  if (noWinnerAudio) {
    noWinnerAudio.pause();
    noWinnerAudio.currentTime = 0;
  }
}

function playGameOverSound() {
  if (!gameOverSound) return;

  gameOverSound.currentTime = 0;
  gameOverSound.play().catch(() => {});
}

function send(data) {
  if (
    ws &&
    ws.readyState === WebSocket.OPEN
  ) {
    ws.send(JSON.stringify(data));
    return true;
  }

  return false;
}

function connectSocket() {
  if (
    ws &&
    (
      ws.readyState === WebSocket.OPEN ||
      ws.readyState === WebSocket.CONNECTING
    )
  ) {
    return;
  }

  try {
    ws = new WebSocket(WS_URL);
  } catch (error) {
    setRoomMessage('Could not connect to server.');
    return;
  }

  socketReadyPromise = new Promise((resolve, reject) => {
    ws.onopen = () => {
      if (
        mode === 'menu' ||
        mode === 'multiplayer-menu'
      ) {
        setRoomMessage('Connected.');
      }

      resolve();
    };

    ws.onerror = () => {
      setRoomMessage('Server connection error.');
      reject(new Error('WebSocket connection failed.'));
    };
  });

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleServerMessage(data);
    } catch (error) {
      console.error('Invalid server response:', error);
      setRoomMessage('Invalid response from server.');
    }
  };

  ws.onclose = () => {
    ws = null;
    socketReadyPromise = null;

    if (
      mode === 'room' ||
      mode === 'online'
    ) {
      setRoomStatus('Disconnected from server.');
    }
  };
}

function normalizeFood(foodData) {
  if (Array.isArray(foodData)) {
    return foodData;
  }

  if (
    foodData &&
    Number.isFinite(foodData.x) &&
    Number.isFinite(foodData.y)
  ) {
    return [
      {
        x: foodData.x,
        y: foodData.y,
        type: foodData.type || 'red'
      }
    ];
  }

  return [randomFood('red')];
}

function handleServerMessage(data) {
  if (!data || !data.type) {
    return;
  }

  if (data.type === 'error') {
    setRoomMessage(data.message || 'Something went wrong.');
    setRoomStatus(data.message || 'Something went wrong.');
    return;
  }

  if (data.type === 'connected') {
    return;
  }

  if (data.type === 'roomList') {
    renderAvailableRooms(data.rooms || []);
    return;
  }

  if (data.type === 'roomJoined') {
    currentRoom = data.room;
    isHost = Boolean(data.host);
    myId = data.playerId;
    mode = 'room';

    showScreen(roomScreen);
    updateRoomButtons();
    return;
  }

  if (data.type === 'roomState') {
    currentRoom = data.room;
    isPaused = Boolean(data.paused);

    isHost = data.hostId === myId;
    multiplayerLevel = data.level || 1;
    selectedLevel = multiplayerLevel;

    renderRoom(data);
    updateRoomButtons();
    updateRoomLevelButtons();

    return;
  }

  if (data.type === 'gameStart') {
  mode = 'online';

  localGameOverShown = false;
  localAlive = true;

  multiplayerLevel = data.level || 1;
  selectedLevel = multiplayerLevel;
  obstacles = createLevelObstacles(selectedLevel);

  players = convertPlayers(data.players);
  food = normalizeFood(data.food);

  if (data.boss && data.boss.snake) {
    remoteBoss = {
      snake: data.boss.snake,
      alive: data.boss.alive,
      rageActive: data.boss.rageActive
    };
  } else {
    remoteBoss = null;
  }

  gridWidth = data.width || gridWidth;
  gridHeight = data.height || gridHeight;
  size = data.size || size;

  stopOfflineAppleTimers();
  stopIntroMusic();
  stopWinnerMusic(); // Stop any winner/noWinner music

  if (multiplayerLevel === 6) {
    playBossMusic();
  } else {
    playGameMusic();
  }

  showScreen(gameScreen);
  updatePauseButton();
  setStatus(`Level ${multiplayerLevel}`);

  // Hide any previous winner message
  hideWinnerMessage();
  stopCountdown();

  // Only show intro message and pause for Level 6
  if (multiplayerLevel === 6) {
    isPaused = data.paused; // Should be true for Level 6
    showIntroMessage(data.introMessage || 'SNAKE SURVIVAL LAST SNAKE ALIVE<br>AVOID BOSS SNAKE');
  } else {
    isPaused = data.paused; // Should be false for Levels 1-5
  }

  draw();
  return;
}

  if (data.type === 'bossDied') {
    remoteBoss = null;
    return;
  }

  if (data.type === 'state') {
  mode = 'online';
  isPaused = Boolean(data.paused);
  players = convertPlayers(data.players);
  food = normalizeFood(data.food);

  if (data.boss && data.boss.snake) {
    remoteBoss = {
      snake: data.boss.snake,
      alive: data.boss.alive,
      rageActive: data.boss.rageActive
    };
  } else {
    remoteBoss = null;
  }

  updatePauseButton();
  setStatus(isPaused ? 'Paused' : 'Connected');
  draw();
}

  if (data.type === 'countdownStart') {
  // Only start countdown for Level 6
  if (multiplayerLevel === 6) {
    startCountdown(60);
  }
  return;
}

  if (data.type === 'winner') {
  // Only show winner message for Level 6
  if (multiplayerLevel === 6) {
    showWinnerMessage(data.winnerName || 'NO WINNER');
  }
  return;
}

if (data.type === 'noWinner') {
  // Only show no winner message for Level 6
  if (multiplayerLevel === 6) {
    showWinnerMessage('NO WINNER');
  }
  return;
}


function renderAvailableRooms(rooms) {
  availableRooms.innerHTML = '';

  if (!rooms.length) {
    availableRooms.textContent =
      'No rooms available.';
    return;
  }

  for (const room of rooms) {
    const roomButton =
      document.createElement('button');

    roomButton.type = 'button';
    roomButton.className = 'available-room';
    roomButton.textContent =
      `${room.name} (${room.players}/4)`;

    roomButton.addEventListener('click', () => {
      searchRoomNameInput.value = room.name;

      document
        .querySelectorAll('.available-room')
        .forEach((button) => {
          button.classList.remove('selected');
        });

      roomButton.classList.add('selected');
      setRoomMessage(
        `Selected room: ${room.name}`
      );
    });

    availableRooms.appendChild(roomButton);
  }
}

function convertPlayers(playerArray) {
  const result = {};

  for (const player of playerArray || []) {
    result[player.id] = player;
  }

  return result;
}

function renderRoom(data) {
  mode = 'room';
  showScreen(roomScreen);

  roomTitle.textContent = data.room;
  playerList.innerHTML = '';

  const playerArray = data.players || [];
  const me = playerArray.find((player) => player.id === myId);

  isReady = Boolean(me && me.ready);

  for (let i = 0; i < 4; i++) {
    const player = playerArray[i];
    const row = document.createElement('div');

    row.className = 'player-row';

    if (!player) {
      row.innerHTML = `
        <span class="player-name">
          PLAYER ${i + 1}: waiting...
        </span>
        <span class="player-badge"></span>
      `;
    } else {
      const mark = player.host ? '🔴' : player.ready ? '🟢' : '';

      row.innerHTML = `
        <span class="player-name">
          PLAYER ${i + 1}: ${escapeHtml(player.name)}
        </span>
        <span class="player-badge">${mark}</span>
      `;
    }

    playerList.appendChild(row);
  }

  const allReady = playerArray.every(
    (player) => player.host || player.ready
  );

  readyBtn.classList.toggle('hidden', isHost);
  startRoomBtn.classList.toggle('hidden', !isHost);
  startRoomBtn.disabled = !isHost || !allReady;

  readyBtn.textContent = isReady ? 'Not Ready' : 'Ready';

  setRoomStatus(
    isHost
      ? allReady
        ? 'All players are ready.'
        : 'Waiting for all players to be ready.'
      : isReady
        ? 'You are ready.'
        : 'Tap Ready when you are ready.'
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function updateRoomButtons() {
  readyBtn.classList.toggle('hidden', isHost);
  startRoomBtn.classList.toggle('hidden', !isHost);
}

function updateRoomLevelButtons() {
  roomLevelButtons.forEach((button) => {
    const level = Number(button.dataset.level);

    button.disabled = !isHost;

    button.classList.toggle(
      'selected',
      level === multiplayerLevel
    );
  });

  roomLevelStatus.textContent =
    `Level ${multiplayerLevel} selected` +
    (isHost ? '' : ' by host');
}

function randomFood(type = 'red') {
  const freeCells = [];

  for (let x = 0; x < gridWidth; x++) {
    for (let y = 0; y < gridHeight; y++) {
      const blockedByObstacle = obstacles.some((block) =>
        block.x === x &&
        block.y === y
      );

      const blockedBySnake =
        localSnake.some((part) =>
          part.x === x &&
          part.y === y
        );

      const blockedByEnemy = enemies.some((enemy) =>
        enemy.alive &&
        enemy.snake.some((part) =>
          part.x === x &&
          part.y === y
        )
      );

      const alreadyHasFood = food.some((apple) =>
        apple.x === x &&
        apple.y === y
      );

      if (
        !blockedByObstacle &&
        !blockedBySnake &&
        !blockedByEnemy &&
        !alreadyHasFood
      ) {
        freeCells.push({ x, y });
      }
    }
  }

  if (!freeCells.length) {
    return {
      x: 0,
      y: 0,
      type
    };
  }

  const position =
    freeCells[
      Math.floor(Math.random() * freeCells.length)
    ];

  return {
    x: position.x,
    y: position.y,
    type
  };
}

function spawnEnemy() {
  if (
    mode !== 'offline' ||
    localGameOverShown
  ) {
    return;
  }

  const margin = 5;

  const corners = [
    {
      x: margin,
      y: margin,
      dir: 'right'
    },
    {
      x: gridWidth - margin - 1,
      y: margin,
      dir: 'down'
    },
    {
      x: gridWidth - margin - 1,
      y: gridHeight - margin - 1,
      dir: 'left'
    },
    {
      x: margin,
      y: gridHeight - margin - 1,
      dir: 'up'
    }
  ];

  const corner =
    corners[
      Math.floor(Math.random() * corners.length)
    ];

  const body = {
    right: [
      { x: corner.x, y: corner.y },
      { x: corner.x - 1, y: corner.y },
      { x: corner.x - 2, y: corner.y }
    ],

    down: [
      { x: corner.x, y: corner.y },
      { x: corner.x, y: corner.y - 1 },
      { x: corner.x, y: corner.y - 2 }
    ],

    left: [
      { x: corner.x, y: corner.y },
      { x: corner.x + 1, y: corner.y },
      { x: corner.x + 2, y: corner.y }
    ],

    up: [
      { x: corner.x, y: corner.y },
      { x: corner.x, y: corner.y + 1 },
      { x: corner.x, y: corner.y + 2 }
    ]
  }[corner.dir];

  enemies.push({
    snake: body,
    dir: corner.dir,
    grow: 0,
    score: 0,
    alive: true
  });

  console.log('Enemy spawned');
}

function createBossSnake() {
  const bossConfig = window.GAME_CONFIG?.boss || {};
  const speedConfig = window.GAME_CONFIG?.speed?.boss || { normal: 120, rage: 60 };
  const baseSpeed = speedConfig.normal || bossConfig.baseSpeedMs || 120;

  // Spawn in middle of board
  const startX = Math.floor(gridWidth / 2);
  const startY = Math.floor(gridHeight / 2);

  // Initial length
    const initialLen = bossConfig.initialLength || 20;

  const snake = [];
  for (let i = 0; i < initialLen; i++) {
    snake.push({ x: startX - i, y: startY });
  }

return {
  snake,
  dir: 'right',
  nextDir: 'right',
  alive: true,
  grow: 0,
  score: 0,
  baseSpeed,
  currentSpeed: baseSpeed,
  lastMoveTime: 0,
  rageActive: false,
  patrolTarget: getRandomPatrolTarget()
};
}
function startBossTimers() {
  stopBossTimers();

  const bossConfig = window.GAME_CONFIG?.boss || {};
  const speedConfig = window.GAME_CONFIG?.speed?.boss || { normal: 60, rage: 20 };
  const rageInterval = bossConfig.rageIntervalMs || 5000;
  const rageDuration = bossConfig.rageDurationMs || 3000;
  const blinkInterval = 100; // fast blink

  bossTimers.rage = setInterval(() => {
    if (!bossSnake || !bossSnake.alive || isPaused || localGameOverShown || selectedLevel !== 6) {
      return;
    }

    activateBossRage(rageDuration);
  }, rageInterval);

  bossTimers.blink = setInterval(() => {
    if (!bossSnake || !bossSnake.alive || selectedLevel !== 6) {
      return;
    }
    // Blink handled in drawBossSnake()
  }, blinkInterval);

  // Boss movement timer
  bossMoveTimer = setInterval(() => {
    if (!bossSnake || !bossSnake.alive || isPaused || localGameOverShown || selectedLevel !== 6) {
      return;
    }

    moveBossSnake();
    checkBossPlayerCollision();
    draw();
  }, bossSnake.currentSpeed);
}



function moveBossSnake() {
  if (!bossSnake || !bossSnake.alive || isPaused || localGameOverShown || selectedLevel !== 6) {
    return;
  }

  const now = Date.now();
  if (now - bossSnake.lastMoveTime < bossSnake.currentSpeed) {
    return;
  }
  bossSnake.lastMoveTime = now;

  const head = bossSnake.snake[0];

  // Get best target (head or tail of player)
  const bestTarget = getBestBossTarget();

  const distance = Math.abs(head.x - bestTarget.x) + Math.abs(head.y - bestTarget.y);

  // If player is near, chase; otherwise patrol
  if (distance < 30) {
    const newDir = getBossChaseDirectionWithAvoidance(head, bestTarget);
    if (newDir) {
      bossSnake.nextDir = newDir;
    }
    // Reset patrol target when chasing
    bossSnake.patrolTarget = null;
  } else {
    // Patrol: move toward patrol target
    if (!bossSnake.patrolTarget) {
      bossSnake.patrolTarget = getRandomPatrolTarget();
    }

    // If reached patrol target, pick new one
    const patrolHead = bossSnake.snake[0];
    const patrolDist =
      Math.abs(patrolHead.x - bossSnake.patrolTarget.x) +
      Math.abs(patrolHead.y - bossSnake.patrolTarget.y);

    if (patrolDist < 2) {
      bossSnake.patrolTarget = getRandomPatrolTarget();
    }

    const newDir = getBossPatrolDirection(patrolHead, bossSnake.patrolTarget);
    if (newDir) {
      bossSnake.nextDir = newDir;
    }
  }

  // Apply direction (no 180° turns)
  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
  if (bossSnake.nextDir && bossSnake.nextDir !== opposite[bossSnake.dir]) {
    bossSnake.dir = bossSnake.nextDir;
  }

  const newHead = { ...head };
  if (bossSnake.dir === 'up') newHead.y--;
  if (bossSnake.dir === 'down') newHead.y++;
  if (bossSnake.dir === 'left') newHead.x--;
  if (bossSnake.dir === 'right') newHead.x++;

  // If next step hits border, try to find any safe direction
  if (newHead.x < 0 || newHead.x >= gridWidth || newHead.y < 0 || newHead.y >= gridHeight) {
    const safeDir = findAnySafeDirection(head);
    if (safeDir) {
      bossSnake.dir = safeDir;
      newHead.x = head.x;
      newHead.y = head.y;
      if (bossSnake.dir === 'up') newHead.y--;
      if (bossSnake.dir === 'down') newHead.y++;
      if (bossSnake.dir === 'left') newHead.x--;
      if (bossSnake.dir === 'right') newHead.x++;
    } else {
      // Truly trapped → die
      bossSnake.alive = false;
      stopBossTimers();
      return;
    }
  }

  bossSnake.snake.unshift(newHead);

  // BOSS does not eat apples, just trim tail
  if (bossSnake.grow > 0) {
    bossSnake.grow--;
  } else {
    bossSnake.snake.pop();
  }
}

function getBestBossTarget() {
  // For now, only one player in single-player
  const playerSegments = localSnake;
  if (!playerSegments || playerSegments.length === 0) {
    return localSnake[0]; // fallback to head
  }

  const head = playerSegments[0];
  const tail = playerSegments[playerSegments.length - 1];
  const bossHead = bossSnake.snake[0];

  const distHead = Math.abs(bossHead.x - head.x) + Math.abs(bossHead.y - head.y);
  const distTail = Math.abs(bossHead.x - tail.x) + Math.abs(bossHead.y - tail.y);

  return distTail < distHead ? tail : head;
}

function getRandomPatrolTarget() {
  // Choose one of the four corners as patrol target
  const corners = [
    { x: 5, y: 5 },
    { x: gridWidth - 6, y: 5 },
    { x: gridWidth - 6, y: gridHeight - 6 },
    { x: 5, y: gridHeight - 6 }
  ];
  return corners[Math.floor(Math.random() * corners.length)];
}

function getBossPatrolDirection(head, target) {
  const dx = target.x - head.x;
  const dy = target.y - head.y;

  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };

  const candidates = [];

  if (Math.abs(dx) > Math.abs(dy)) {
    candidates.push(dx > 0 ? 'right' : 'left');
    candidates.push(dy > 0 ? 'down' : 'up');
  } else {
    candidates.push(dy > 0 ? 'down' : 'up');
    candidates.push(dx > 0 ? 'right' : 'left');
  }

  for (const dir of candidates) {
    if (dir === opposite[bossSnake.dir]) continue;
    if (isBossDirectionSafe(head, dir)) return dir;
  }

  return findAnySafeDirection(head);
}

function getBossWanderDirection(head) {
  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };

  // Prefer continuing current direction if safe
  if (isBossDirectionSafe(head, bossSnake.dir)) {
    return bossSnake.dir;
  }

  // Try to turn left/right relative to current direction
  const leftTurn = {
    up: 'left',
    left: 'down',
    down: 'right',
    right: 'up'
  }[bossSnake.dir];

  const rightTurn = {
    up: 'right',
    right: 'down',
    down: 'left',
    left: 'up'
  }[bossSnake.dir];

  if (isBossDirectionSafe(head, leftTurn)) return leftTurn;
  if (isBossDirectionSafe(head, rightTurn)) return rightTurn;

  // Last resort: any safe direction (even opposite)
  return findAnySafeDirection(head);
}

function isBossDirectionSafe(head, dir) {
  const next = { ...head };
  if (dir === 'up') next.y--;
  if (dir === 'down') next.y++;
  if (dir === 'left') next.x--;
  if (dir === 'right') next.x++;

  // Check borders
  if (next.x < 0 || next.x >= gridWidth || next.y < 0 || next.y >= gridHeight) {
    return false;
  }

  // Check level obstacles (walls)
  const levelObstacles = createLevelObstacles(selectedLevel || 1);
  for (let i = 0; i < levelObstacles.length; i++) {
    if (levelObstacles[i].x === next.x && levelObstacles[i].y === next.y) {
      return false;
    }
  }

  // Avoid self-collision
  for (let i = 0; i < bossSnake.snake.length - 1; i++) {
    if (bossSnake.snake[i].x === next.x && bossSnake.snake[i].y === next.y) {
      return false;
    }
  }

  return true;
}

function findAnySafeDirection(head) {
  const dirs = ['up', 'down', 'left', 'right'];
  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };

  for (const dir of dirs) {
    if (dir === opposite[bossSnake.dir]) continue;
    if (isBossDirectionSafe(head, dir)) return dir;
  }

  // If all else fails, try opposite too
  for (const dir of dirs) {
    if (isBossDirectionSafe(head, dir)) return dir;
  }

  return null;
}

function getBossChaseDirectionWithAvoidance(head, target) {
  const dx = target.x - head.x;
  const dy = target.y - head.y;

  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };

  // Prefer axis with larger distance
  const candidates = [];

  if (Math.abs(dx) > Math.abs(dy)) {
    candidates.push(dx > 0 ? 'right' : 'left');
    candidates.push(dy > 0 ? 'down' : 'up');
  } else {
    candidates.push(dy > 0 ? 'down' : 'up');
    candidates.push(dx > 0 ? 'right' : 'left');
  }

  // Pick first safe direction (not opposite, not into border)
  for (const dir of candidates) {
    if (dir === opposite[bossSnake.dir]) continue;
    if (isBossDirectionSafe(head, dir)) return dir;
  }

  // Fallback: any safe direction
  return findAnySafeDirection(head);
}

function getBossChaseDirection(head, target) {
  const dx = target.x - head.x;
  const dy = target.y - head.y;

  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };

  // Prefer horizontal or vertical based on distance
  if (Math.abs(dx) > Math.abs(dy)) {
    const dir = dx > 0 ? 'right' : 'left';
    if (dir !== opposite[bossSnake.dir]) return dir;
  }

  if (dy !== 0) {
    const dir = dy > 0 ? 'down' : 'up';
    if (dir !== opposite[bossSnake.dir]) return dir;
  }

  // Fallback: try perpendicular
  if (bossSnake.dir === 'up' || bossSnake.dir === 'down') {
    return dx > 0 ? 'right' : 'left';
  } else {
    return dy > 0 ? 'down' : 'up';
  }
}

function checkBossPlayerCollision() {
  if (!bossSnake || !bossSnake.alive || selectedLevel !== 6) {
    return;
  }

  const bossSegments = bossSnake.snake;
  const playerSegments = localSnake;

  for (let i = 0; i < bossSegments.length; i++) {
    const bossPart = bossSegments[i];

    for (let j = 0; j < playerSegments.length; j++) {
      const playerPart = playerSegments[j];

      if (bossPart.x === playerPart.x && bossPart.y === playerPart.y) {
        // Collision detected
        if (j === 0) {
          // Player head hit → player dies
          showOfflineGameOver();
          return;
        }

        // BOSS grows by 2 per pixel
        bossSnake.grow += 2;

        // Player damage based on where bitten
        const playerLength = playerSegments.length;
        const bitePositionRatio = j / playerLength; // 0 = head, 1 = tail

        if (bitePositionRatio < 0.3) {
          // Bitten near head → die
          showOfflineGameOver();
          return;
        } else if (bitePositionRatio < 0.7) {
          // Bitten in middle → cut to half
          localSnake = localSnake.slice(0, Math.ceil(playerLength / 2));
        } else {
          // Bitten near tail → reduce length by 1
          if (localSnake.length > 3) {
            localSnake.pop();
          }
        }

        return;
      }
    }
  }
}

function drawRemoteBoss() {
  if (!remoteBoss || !remoteBoss.alive || selectedLevel !== 6) {
    return;
  }

  const bossConfig = window.GAME_CONFIG?.boss || {};
  const baseColor = bossConfig.baseColor || '#8b5cf6';
  const rageColor = bossConfig.rageColor || '#ef4444';
  const highlightColor = bossConfig.highlightColor || '#ef4444';

  let drawColor = baseColor;

  // Blink color during rage
  if (remoteBoss.rageActive) {
    const now = Date.now();
    // Toggle every 100ms → 10 times per second
    if (Math.floor(now / 100) % 2 === 0) {
      drawColor = rageColor;
    } else {
      drawColor = baseColor;
    }
  }

  ctx.strokeStyle = drawColor;
  ctx.lineWidth = drawSize * 0.85;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  for (let i = remoteBoss.snake.length - 1; i >= 0; i--) {
    const segment = remoteBoss.snake[i];
    const x = segment.x * drawSize + drawSize / 2;
    const y = segment.y * drawSize + drawSize / 2;

    if (i === remoteBoss.snake.length - 1) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  const head = remoteBoss.snake[0];
  const hx = head.x * drawSize + drawSize / 2;
  const hy = head.y * drawSize + drawSize / 2;

  ctx.fillStyle = drawColor;
  ctx.beginPath();
  ctx.arc(hx, hy, drawSize * 0.42, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = highlightColor;
  ctx.lineWidth = 2;
  for (let i = 1; i < remoteBoss.snake.length - 1; i++) {
    const segment = remoteBoss.snake[i];
    const x = segment.x * drawSize;
    const y = segment.y * drawSize;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + drawSize, y);
    ctx.stroke();
  }
}


function drawBossSnake() {
  if (!bossSnake || !bossSnake.alive || selectedLevel !== 6) {
    return;
  }

  const bossConfig = window.GAME_CONFIG?.boss || {};
  const baseColor = bossConfig.baseColor || '#8b5cf6';
  const rageColor = bossConfig.rageColor || '#ef4444';
  const highlightColor = bossConfig.highlightColor || '#ef4444';

  // Blink during rage
  let drawColor = baseColor;
  if (bossRageActive) {
    const now = Date.now();
    if (now < bossRageEndTime) {
      // Fast blink: toggle every 100ms
      if (Math.floor(now / 100) % 2 === 0) {
        drawColor = rageColor;
      }
    } else {
      bossRageActive = false;
    }
  }

  // Draw body with highlights
  ctx.strokeStyle = drawColor;
  ctx.lineWidth = drawSize * 0.85;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  for (let i = bossSnake.snake.length - 1; i >= 0; i--) {
    const segment = bossSnake.snake[i];
    const x = segment.x * drawSize + drawSize / 2;
    const y = segment.y * drawSize + drawSize / 2;

    if (i === bossSnake.snake.length - 1) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  // Draw head
  const head = bossSnake.snake[0];
  const hx = head.x * drawSize + drawSize / 2;
  const hy = head.y * drawSize + drawSize / 2;

  ctx.fillStyle = drawColor;
  ctx.beginPath();
  ctx.arc(hx, hy, drawSize * 0.42, 0, Math.PI * 2);
  ctx.fill();

  // Draw red highlights on sides
  ctx.strokeStyle = highlightColor;
  ctx.lineWidth = 2;
  for (let i = 1; i < bossSnake.snake.length - 1; i++) {
    const segment = bossSnake.snake[i];
    const x = segment.x * drawSize;
    const y = segment.y * drawSize;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + drawSize, y);
    ctx.stroke();
  }
}

function stopBossTimers() {
  clearInterval(bossTimers.rage);
  clearInterval(bossTimers.blink);
  clearInterval(bossMoveTimer);

  bossTimers.rage = null;
  bossTimers.blink = null;
  bossMoveTimer = null;
  bossRageActive = false;
}

function activateBossRage(durationMs) {
  if (!bossSnake || !bossSnake.alive) return;

  const speedConfig = window.GAME_CONFIG?.speed?.boss || { normal: 60, rage: 20 };
  const rageSpeed = speedConfig.rage || 20;

  bossSnake.rageActive = true;
  bossSnake.currentSpeed = rageSpeed;
  bossRageActive = true;
  bossRageEndTime = Date.now() + durationMs;

  // Restart boss move timer with rage speed
  clearInterval(bossMoveTimer);
  bossMoveTimer = setInterval(() => {
    if (!bossSnake || !bossSnake.alive || isPaused || localGameOverShown || selectedLevel !== 6) {
      return;
    }

    moveBossSnake();
    checkBossPlayerCollision();
    draw();
  }, rageSpeed);

  // End rage after duration
  setTimeout(() => {
    if (!bossSnake || !bossSnake.alive) return;

    bossSnake.rageActive = false;
    bossSnake.currentSpeed = bossSnake.baseSpeed;
    bossRageActive = false;

    // Restart boss move timer with normal speed
    clearInterval(bossMoveTimer);
    bossMoveTimer = setInterval(() => {
      if (!bossSnake || !bossSnake.alive || isPaused || localGameOverShown || selectedLevel !== 6) {
        return;
      }

      moveBossSnake();
      checkBossPlayerCollision();
      draw();
    }, bossSnake.baseSpeed);
  }, durationMs);
}
function getNextEnemyPosition(position, direction) {
  const next = {
    x: position.x,
    y: position.y
  };

  if (direction === 'up') next.y--;
  if (direction === 'down') next.y++;
  if (direction === 'left') next.x--;
  if (direction === 'right') next.x++;

  return next;
}

function getNearestEnemyApple(enemy) {
  if (!food.length) {
    return null;
  }

  const head = enemy.snake[0];

  return food.reduce((nearest, apple) => {
    const currentDistance =
      Math.abs(head.x - apple.x) +
      Math.abs(head.y - apple.y);

    if (
      !nearest ||
      currentDistance < nearest.distance
    ) {
      return {
        apple,
        distance: currentDistance
      };
    }

    return nearest;
  }, null).apple;
}

function enemyMoveIsDangerous(position, enemy) {
  if (
    position.x < 0 ||
    position.x >= gridWidth ||
    position.y < 0 ||
    position.y >= gridHeight
  ) {
    return true;
  }

  const hitsObstacle = obstacles.some((block) =>
    block.x === position.x &&
    block.y === position.y
  );

  if (hitsObstacle) {
    return true;
  }

  const hitsOwnBody = enemy.snake
    .slice(1)
    .some((part) =>
      part.x === position.x &&
      part.y === position.y
    );

  if (hitsOwnBody) {
    return true;
  }

  const hitsPlayer = localSnake.some((part) =>
    part.x === position.x &&
    part.y === position.y
  );

  if (hitsPlayer) {
    return true;
  }

  const hitsAnotherEnemy = enemies.some((other) =>
    other !== enemy &&
    other.alive &&
    other.snake.some((part) =>
      part.x === position.x &&
      part.y === position.y
    )
  );

  return hitsAnotherEnemy;
}
function isBlockedForEnemy(position, enemy) {
  if (
    position.x < 0 ||
    position.x >= gridWidth ||
    position.y < 0 ||
    position.y >= gridHeight
  ) {
    return true;
  }

  const hitsObstacle = obstacles.some((block) =>
    block.x === position.x &&
    block.y === position.y
  );

  if (hitsObstacle) {
    return true;
  }

  const hitsOwnBody = enemy.snake
    .slice(1)
    .some((part) =>
      part.x === position.x &&
      part.y === position.y
    );

  if (hitsOwnBody) {
    return true;
  }

  const hitsPlayer = localSnake.some((part) =>
    part.x === position.x &&
    part.y === position.y
  );

  if (hitsPlayer) {
    return true;
  }

  const hitsAnotherEnemy = enemies.some((other) =>
    other !== enemy &&
    other.alive &&
    other.snake.some((part) =>
      part.x === position.x &&
      part.y === position.y
    )
  );

  return hitsAnotherEnemy;
}

function findEnemyPath(enemy, target) {
  const start = enemy.snake[0];

  const directions = [
    { name: 'up', dx: 0, dy: -1 },
    { name: 'down', dx: 0, dy: 1 },
    { name: 'left', dx: -1, dy: 0 },
    { name: 'right', dx: 1, dy: 0 }
  ];

  const queue = [
    {
      x: start.x,
      y: start.y,
      firstDirection: null
    }
  ];

  const visited = new Set([
    `${start.x},${start.y}`
  ]);

  while (queue.length > 0) {
    const current = queue.shift();

    if (
      current.x === target.x &&
      current.y === target.y
    ) {
      return current.firstDirection;
    }

    for (const direction of directions) {
      const next = {
        x: current.x + direction.dx,
        y: current.y + direction.dy
      };

      const key = `${next.x},${next.y}`;

      if (visited.has(key)) {
        continue;
      }

      if (
        isBlockedForEnemy(next, enemy) &&
        !(
          next.x === target.x &&
          next.y === target.y
        )
      ) {
        continue;
      }

      visited.add(key);

      queue.push({
        x: next.x,
        y: next.y,
        firstDirection:
          current.firstDirection || direction.name
      });
    }
  }

  return null;
}
function chooseEnemyDirection(enemy) {
  const target = getNearestEnemyApple(enemy);

  if (!target) {
    return enemy.dir;
  }

  const pathDirection =
    findEnemyPath(enemy, target);

  if (pathDirection) {
    return pathDirection;
  }

  const opposite = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left'
  };

  const directions = [
    'up',
    'down',
    'left',
    'right'
  ];

  const safeDirections = directions.filter((direction) => {
    if (direction === opposite[enemy.dir]) {
      return false;
    }

    const nextPosition = getNextEnemyPosition(
      enemy.snake[0],
      direction
    );

    return !isBlockedForEnemy(
      nextPosition,
      enemy
    );
  });

  return safeDirections[0] || null;
}

function moveEnemy(enemy) {
  if (
    !enemy.alive ||
    isPaused ||
    localGameOverShown
  ) {
    return;
  }

  const newDirection =
    chooseEnemyDirection(enemy);

  if (!newDirection) {
    enemy.alive = false;
    return;
  }

  enemy.dir = newDirection;

  const head = getNextEnemyPosition(
    enemy.snake[0],
    enemy.dir
  );

  if (
    enemyMoveIsDangerous(head, enemy)
  ) {
    enemy.alive = false;
    return;
  }

  enemy.snake.unshift(head);

  const foodIndex = food.findIndex((apple) =>
    apple.x === head.x &&
    apple.y === head.y
  );

  if (foodIndex !== -1) {
    const apple = food[foodIndex];

    enemy.score++;

const growth = window.GAME_CONFIG?.foodGrowth || { red: 2, blue: 8, green: 15 };
if (apple.type === 'blue') {
  enemy.grow += growth.blue;
} else if (apple.type === 'green') {
  enemy.grow += growth.green;
} else {
  enemy.grow += growth.red;
}

    if (apple.type === 'red') {
      food[foodIndex] = randomFood('red');
    } else {
      food.splice(foodIndex, 1);
    }
  }

  if (enemy.grow > 0) {
    enemy.grow--;
  } else {
    enemy.snake.pop();
  }
}

function startOfflineAppleTimers() {
  stopOfflineAppleTimers();

  const timings = window.GAME_CONFIG?.timings || {
    blueAppleSpawn: 8000,
    greenAppleSpawn: 16000,
    enemySpawn: 20000
  };

  const speedConfig = window.GAME_CONFIG?.speed || {
    player: 120,
    enemy: 120,
    boss: { normal: 60, rage: 20 }
  };

  offlineBlueTimer = setInterval(() => {
    if (mode === 'offline' && !isPaused && !localGameOverShown) {
      food.push(randomFood('blue'));
      draw();
    }
  }, timings.blueAppleSpawn);

  offlineGreenTimer = setInterval(() => {
    if (mode === 'offline' && !isPaused && !localGameOverShown) {
      food.push(randomFood('green'));
      draw();
    }
  }, timings.greenAppleSpawn);

  offlineEnemyTimer = setInterval(() => {
    if (
      mode === 'offline' &&
      !isPaused &&
      !localGameOverShown &&
      selectedLevel !== 6
    ) {
      spawnEnemy();
      draw();
    }
  }, timings.enemySpawn);

  // Enemy movement timer (separate from player)
  enemyMoveTimer = setInterval(() => {
    if (
      mode === 'offline' &&
      !isPaused &&
      !localGameOverShown &&
      selectedLevel !== 6
    ) {
      for (const enemy of enemies) {
        moveEnemy(enemy);
      }
      enemies = enemies.filter(enemy => enemy.alive);
      draw();
    }
  }, speedConfig.enemy);

  // Player movement timer (separate from game loop)
  playerMoveTimer = setInterval(() => {
    if (mode === 'offline' && !isPaused && !localGameOverShown) {
      stepLocal();
      draw();
    }
  }, speedConfig.player);

  // Boss movement timer (separate from game loop)
  if (selectedLevel === 6) {
    bossMoveTimer = setInterval(() => {
      if (mode === 'offline' && !isPaused && !localGameOverShown && bossSnake && bossSnake.alive) {
        moveBossSnake();
        checkBossPlayerCollision();
        draw();
      }
    }, speedConfig.boss.normal);
  }
}

function stopOfflineAppleTimers() {
  clearInterval(offlineBlueTimer);
  clearInterval(offlineGreenTimer);
  clearInterval(offlineEnemyTimer);
  clearInterval(enemyMoveTimer);
  clearInterval(playerMoveTimer);
  clearInterval(bossMoveTimer);

  offlineBlueTimer = null;
  offlineGreenTimer = null;
  offlineEnemyTimer = null;
  enemyMoveTimer = null;
  playerMoveTimer = null;
  bossMoveTimer = null;
}

function beginSinglePlayer() {
  mode = 'level-select';
  showScreen(levelScreen);
}
function startSelectedLevel(level) {
  selectedLevel = level;
  mode = 'offline';
  isHost = false;
  currentRoom = '';
  myId = null;
  isPaused = false;
  players = {};

  stopIntroMusic();
  if (level === 6) {
  playBossMusic();
} else {
  playGameMusic();
}

  resetLocalGame();
  startOfflineAppleTimers();
  showScreen(gameScreen);
}
function beginMultiplayerMenu() {
  mode = 'multiplayer-menu';

  playIntroMusic();
  showScreen(multiplayerMenu);
  connectSocket();
}

async function searchRooms() {
  availableRooms.textContent =
    'Searching for rooms...';

  if (!ws) {
    connectSocket();
  }

  try {
    if (socketReadyPromise) {
      await socketReadyPromise;
    }

    if (!send({ type: 'listRooms' })) {
      availableRooms.textContent =
        'Not connected to server.';
      return;
    }

    setRoomMessage('Searching for rooms...');
  } catch (error) {
    availableRooms.textContent =
      'Could not connect to server.';
  }
}

async function createRoom() {
  const name = playerNameInput.value.trim();
  const room = createRoomNameInput.value.trim();

  if (!name || !room) {
    setRoomMessage('Enter your name and a room name.');
    return;
  }

  if (!ws) {
    connectSocket();
  }

  try {
    if (socketReadyPromise) {
      await socketReadyPromise;
    }

    setRoomMessage('Creating room...');

    send({
      type: 'createRoom',
      name,
      room
    });
  } catch (error) {
    setRoomMessage('Could not connect to server.');
  }
}

async function joinRoom() {
  const name = playerNameInput.value.trim();
  const room = searchRoomNameInput.value.trim();

  if (!name || !room) {
    setRoomMessage('Enter your name and the room name.');
    return;
  }

  if (!ws) {
    connectSocket();
  }

  try {
    if (socketReadyPromise) {
      await socketReadyPromise;
    }

    setRoomMessage('Joining room...');

    send({
      type: 'joinRoom',
      name,
      room
    });
  } catch (error) {
    setRoomMessage('Could not connect to server.');
  }
}

function leaveRoom() {
  if (ws) {
    ws.close();
  }

  mode = 'multiplayer-menu';
  isHost = false;
  currentRoom = '';
  myId = null;
  isReady = false;
  isPaused = false;
  players = {};

  setRoomMessage('');
  showScreen(multiplayerMenu);
  
}

singlePlayerBtn.addEventListener('click', beginSinglePlayer);
level1Btn.addEventListener('click', () => {
  startSelectedLevel(1);
});

level2Btn.addEventListener('click', () => {
  startSelectedLevel(2);
});
level3Btn.addEventListener('click', () => {
  startSelectedLevel(3);
});
level4Btn.addEventListener('click', () => {
  startSelectedLevel(4);
});
level5Btn.addEventListener('click', () => {
  startSelectedLevel(5);
});

level6Btn.addEventListener('click', () => {
  startSelectedLevel(6);
});
backFromLevelBtn.addEventListener('click', () => {
  showScreen(mainMenu);
  mode = 'menu';
});
multiplayerBtn.addEventListener('click', beginMultiplayerMenu);

backToMenuBtn.addEventListener('click', () => {
  stopIntroMusic();
  stopGameMusic();
  stopBossMusic();

  mode = 'menu';
  showScreen(mainMenu);
  playIntroMusic();
});

createRoomBtn.addEventListener('click', createRoom);
searchRoomsBtn.addEventListener('click', searchRooms);
joinRoomBtn.addEventListener('click', joinRoom);

readyBtn.addEventListener('click', () => {
  if (!isHost) {
    send({ type: 'ready' });
  }
});

startRoomBtn.addEventListener('click', () => {
  if (isHost) {
    send({ type: 'startRoom' });
  }
});

leaveRoomBtn.addEventListener('click', leaveRoom);

roomLevelButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (!isHost) {
      return;
    }

    const level = Number(button.dataset.level);

    multiplayerLevel = level;
    selectedLevel = level;

    send({
      type: 'selectLevel',
      level
    });

    updateRoomLevelButtons();
  });
});


function updatePauseButton() {
  pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
}

function setDirection(current, next) {
  const opposite = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left'
  };

  if (next && next !== opposite[current]) {
    return next;
  }

  return current;
}

function resetLocalGame() {
  const cfgInitPos = (window.GAME_CONFIG && window.GAME_CONFIG.initialPosition) || { x: 10, y: 8 };
  const cfgInitLen = (window.GAME_CONFIG && window.GAME_CONFIG.initialLength) || 3;

  localSnake = [];
  for (let i = 0; i < cfgInitLen; i++) {
    localSnake.push({ x: cfgInitPos.x - i, y: cfgInitPos.y });
  }

  localDir = 'right';
  localNextDir = 'right';
  localGrow = 0;
  localScore = 0;
  localAlive = true;
  localGameOverShown = false;
  isPaused = false;
  enemies = [];
  obstacles = createLevelObstacles();

  // Spawn BOSS in Level 6 only (single-player)
  if (selectedLevel === 6) {
    bossSnake = createBossSnake();
    startBossTimers();
  } else {
    bossSnake = null;
    stopBossTimers();
  }

  food = [randomFood('red')];

  gameOverLogo.classList.remove('show');
  hideWinnerMessage(); // Hide winner message on restart

  if (gameOverSound) {
    gameOverSound.pause();
    gameOverSound.currentTime = 0;
  }

  updatePauseButton();
  setStatus('Offline');
  draw();
}
function createLevelObstacles(level = selectedLevel) {
  if (level === 1) {
    return [];
  }

  const result = [];
  const middleY = Math.floor(gridHeight / 2);
  const middleX = Math.floor(gridWidth / 2);

  if (
    level === 2 ||
    level === 3 ||
    level === 4
  ) {
    for (let x = 18; x < gridWidth - 18; x++) {
      result.push({
        x,
        y: middleY
      });
    }
  }

  if (level === 3) {
    for (let y = 10; y < gridHeight - 10; y++) {
      result.push({
        x: middleX,
        y
      });
    }
  }

  if (level === 4) {
    const horizontalGapStart =
      Math.floor(gridWidth / 2) - 4;
    const horizontalGapEnd =
      Math.floor(gridWidth / 2) + 4;
    const verticalGapStart =
      Math.floor(gridHeight / 2) - 4;
    const verticalGapEnd =
      Math.floor(gridHeight / 2) + 4;

    result.length = 0;

    for (let x = 12; x < gridWidth - 12; x++) {
      if (
        x < horizontalGapStart ||
        x > horizontalGapEnd
      ) {
        result.push({
          x,
          y: middleY - 10
        });

        result.push({
          x,
          y: middleY + 10
        });
      }
    }

    for (let y = 12; y < gridHeight - 12; y++) {
      if (
        y < verticalGapStart ||
        y > verticalGapEnd
      ) {
        result.push({
          x: middleX - 14,
          y
        });

        result.push({
          x: middleX + 14,
          y
        });
      }
    }
  }

  if (level === 5) {
    const rows = [
      {
        y: 15,
        start: 12,
        end: gridWidth - 14,
        openingSide: 'right'
      },
      {
        y: 30,
        start: 14,
        end: gridWidth - 12,
        openingSide: 'left'
      },
      {
        y: 45,
        start: 12,
        end: gridWidth - 14,
        openingSide: 'right'
      },
      {
        y: 60,
        start: 14,
        end: gridWidth - 12,
        openingSide: 'left'
      }
    ];

    for (const row of rows) {
      for (let x = row.start; x <= row.end; x++) {
        const hasOpening =
          row.openingSide === 'left'
            ? x < row.start + 8
            : x > row.end - 8;

        if (!hasOpening) {
          result.push({
            x,
            y: row.y
          });
        }
      }
    }
  }

  if (level === 6) {
    const addBox = (x1, y1, x2, y2, openings = []) => {
      for (let x = x1; x <= x2; x++) {
        for (let y = y1; y <= y2; y++) {
          const isEdge =
            x === x1 ||
            x === x2 ||
            y === y1 ||
            y === y2;

          if (!isEdge) continue;

          const openLeft =
            openings.includes('left') &&
            x === x1 &&
            y >= y1 + 3 &&
            y <= y2 - 3;

          const openRight =
            openings.includes('right') &&
            x === x2 &&
            y >= y1 + 3 &&
            y <= y2 - 3;

          const openTop =
            openings.includes('top') &&
            y === y1 &&
            x >= x1 + 3 &&
            x <= x2 - 3;

          const openBottom =
            openings.includes('bottom') &&
            y === y2 &&
            x >= x1 + 3 &&
            x <= x2 - 3;

          if (
            openLeft ||
            openRight ||
            openTop ||
            openBottom
          ) {
            continue;
          }

          result.push({ x, y });
        }
      }
    };

    const midX = Math.floor(gridWidth / 2);
    const midY = Math.floor(gridHeight / 2);

    addBox(18, 18, 31, 30, ['left', 'right']);
    addBox(40, 18, 53, 30, ['left', 'right']);
    addBox(18, 48, 31, 60, ['left', 'right']);
    addBox(40, 48, 53, 60, ['left', 'right']);

    addBox(0, 0, 12, 12, ['bottom', 'right']);
    addBox(gridWidth - 13, 0, gridWidth - 1, 12, ['bottom', 'left']);
    addBox(0, gridHeight - 13, 12, gridHeight - 1, ['top', 'right']);
    addBox(gridWidth - 13, gridHeight - 13, gridWidth - 1, gridHeight - 1, ['top', 'left']);

    for (let x = 24; x <= 47; x++) {
      if (x < 33 || x > 38) {
        result.push({ x, y: midY - 6 });
        result.push({ x, y: midY + 6 });
      }
    }

    for (let y = 24; y <= 55; y++) {
      if (y < 34 || y > 45) {
        result.push({ x: midX - 10, y });
        result.push({ x: midX + 10, y });
      }
    }
  }

  return result;
}
function showOfflineGameOver() {
  if (localGameOverShown) return;

  localGameOverShown = true;
  localAlive = false;

  stopOfflineAppleTimers();
  stopGameMusic();
  playGameOverSound();

  setStatus('Game Over');
  gameOverLogo.classList.add('show');
  draw();
}

function sendDirection(direction) {
  if (isPaused) {
    return;
  }

  if (mode === 'online') {
    send({
      type: 'dir',
      dir: direction
    });
    return;
  }

  if (mode === 'offline' && !localGameOverShown) {
    localNextDir = direction;
  }
}

function togglePause() {
  if (mode === 'online') {
    if (!isHost) {
      setStatus('Only the host can pause or resume.');
      return;
    }

    send({
      type: 'pause'
    });

    return;
  }

  if (mode !== 'offline') {
    return;
  }

  isPaused = !isPaused;
  updatePauseButton();
  setStatus(isPaused ? 'Paused' : 'Offline');
  draw();
}

pauseBtn.addEventListener('click', togglePause);

restartBtn.addEventListener('click', () => {
  if (mode === 'online') {
    if (isHost) {
      send({ type: 'restart' });
    }

    return;
  }

  if (mode !== 'offline') {
    return;
  }

  stopGameMusic();
  stopIntroMusic();
  stopBossMusic();

  // Stop winner/noWinner music
  const winnerAudio = document.getElementById('winnerMusic');
  const noWinnerAudio = document.getElementById('noWinnerMusic');

  if (winnerAudio) {
    winnerAudio.pause();
    winnerAudio.currentTime = 0;
  }

  if (noWinnerAudio) {
    noWinnerAudio.pause();
    noWinnerAudio.currentTime = 0;
  }

  hideWinnerMessage(); // Hide winner message
  stopCountdown(); // Stop countdown

  resetLocalGame();
  startOfflineAppleTimers();

  if (selectedLevel === 6) {
    playBossMusic();
  } else {
    playGameMusic();
  }
});

menuBtn.addEventListener('click', () => {
  if (ws) {
    ws.close();
    ws = null;
  }

  stopOfflineAppleTimers();
  stopGameMusic();
  stopBossMusic();
  stopIntroMusic();

  // Stop winner/noWinner music
  const winnerAudio = document.getElementById('winnerMusic');
  const noWinnerAudio = document.getElementById('noWinnerMusic');

  if (winnerAudio) {
    winnerAudio.pause();
    winnerAudio.currentTime = 0;
  }

  if (noWinnerAudio) {
    noWinnerAudio.pause();
    noWinnerAudio.currentTime = 0;
  }

  if (gameOverSound) {
    gameOverSound.pause();
    gameOverSound.currentTime = 0;
  }

  gameOverLogo.classList.remove('show');
  hideWinnerMessage(); // Hide winner message
  stopCountdown(); // Stop countdown

  mode = 'menu';
  isHost = false;
  myId = null;
  currentRoom = '';
  isReady = false;
  isPaused = false;
  players = {};
  enemies = [];

  localGameOverShown = false;
  localAlive = true;
  localGrow = 0;
  localScore = 0;
  localDir = 'right';
  localNextDir = 'right';

  bossSnake = null;
  remoteBoss = null;

  setStatus('Ready');
  showScreen(mainMenu);
  playIntroMusic();
});

document.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();

  if (
    mode !== 'offline' &&
    mode !== 'online'
  ) {
    return;
  }

  if (key === 'p') {
    togglePause();
    return;
  }

  if (key === 'arrowup' || key === 'w') {
    sendDirection('up');
  }

  if (key === 'arrowdown' || key === 's') {
    sendDirection('down');
  }

  if (key === 'arrowleft' || key === 'a') {
    sendDirection('left');
  }

  if (key === 'arrowright' || key === 'd') {
    sendDirection('right');
  }
});

controlButtons.forEach((button) => {
  const direction = button.dataset.dir;

  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();

    button.classList.add('pressed');

if (
  mode === 'offline' ||
  mode === 'online'
) {
  if (mode === 'offline') {
    if (selectedLevel === 6) {
      playBossMusic();
    } else {
      playGameMusic();
    }
  }

  sendDirection(direction);
}
  });

  button.addEventListener('pointerup', () => {
    button.classList.remove('pressed');
  });

  button.addEventListener('pointercancel', () => {
    button.classList.remove('pressed');
  });
});

function drawSnake(snake, color) {
  if (!snake || snake.length === 0) {
    return;
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = drawSize * 0.85;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();

  for (let i = snake.length - 1; i >= 0; i--) {
    const segment = snake[i];

    const x = segment.x * drawSize + drawSize / 2;
    const y = segment.y * drawSize + drawSize / 2;

    if (i === snake.length - 1) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();

  const head = snake[0];
  const hx = head.x * drawSize + drawSize / 2;
  const hy = head.y * drawSize + drawSize / 2;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(
    hx,
    hy,
    drawSize * 0.42,
    0,
    Math.PI * 2
  );
  ctx.fill();
}

function drawRemoteBoss() {
  if (!remoteBoss || !remoteBoss.alive || selectedLevel !== 6) {
    return;
  }

  const bossConfig = window.GAME_CONFIG?.boss || {};
  const baseColor = bossConfig.baseColor || '#8b5cf6';
  const rageColor = bossConfig.rageColor || '#ef4444';
  const highlightColor = bossConfig.highlightColor || '#ef4444';

  let drawColor = baseColor;
  if (remoteBoss.rageActive) {
    const now = Date.now();
    if (Math.floor(now / 100) % 2 === 0) {
      drawColor = rageColor;
    }
  }

  ctx.strokeStyle = drawColor;
  ctx.lineWidth = drawSize * 0.85;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  for (let i = remoteBoss.snake.length - 1; i >= 0; i--) {
    const segment = remoteBoss.snake[i];
    const x = segment.x * drawSize + drawSize / 2;
    const y = segment.y * drawSize + drawSize / 2;

    if (i === remoteBoss.snake.length - 1) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  const head = remoteBoss.snake[0];
  const hx = head.x * drawSize + drawSize / 2;
  const hy = head.y * drawSize + drawSize / 2;

  ctx.fillStyle = drawColor;
  ctx.beginPath();
  ctx.arc(hx, hy, drawSize * 0.42, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = highlightColor;
  ctx.lineWidth = 2;
  for (let i = 1; i < remoteBoss.snake.length - 1; i++) {
    const segment = remoteBoss.snake[i];
    const x = segment.x * drawSize;
    const y = segment.y * drawSize;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + drawSize, y);
    ctx.stroke();
  }
}


function drawApple() {
  for (const apple of food) {
    if (apple.type === 'blue') {
      ctx.fillStyle = '#2583ff';
    } else if (apple.type === 'green') {
      ctx.fillStyle = '#22c55e';
    } else {
      ctx.fillStyle = '#ef4444';
    }

    ctx.beginPath();
    ctx.arc(
      apple.x * drawSize + drawSize / 2,
      apple.y * drawSize + drawSize / 2,
      drawSize * 0.35,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
}

function drawObstacles() {
  ctx.fillStyle = '#64748b';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;

  for (const block of obstacles) {
    const x = block.x * drawSize;
    const y = block.y * drawSize;

    ctx.fillRect(
      x,
      y,
      drawSize,
      drawSize
    );

    ctx.strokeRect(
      x,
      y,
      drawSize,
      drawSize
    );
  }
}

function drawLocal() {
  drawObstacles();
  drawApple();
  drawSnake(localSnake, '#008cff');

  if (selectedLevel === 6) {
    drawBossSnake();
  } else {
    for (const enemy of enemies) {
      drawSnake(enemy.snake, '#d4af37');
    }
  }

  ctx.fillStyle = '#fff';
  ctx.font = '14px Arial';
  ctx.fillText(`Score ${localScore}`, 10, 20);
}

function drawOnline() {
  drawObstacles();
  drawApple();

  for (const player of Object.values(players)) {
  if (!player.snake || !player.snake.length) {
    continue;
  }

  const isBlinking =
    player.dying &&
    Math.floor(Date.now() / 100) % 2 === 0;

  if (!isBlinking) {
    drawSnake(
      player.snake,
      player.color || '#22c55e'
    );
  }

    if (
      player.snake &&
      player.snake[0]
    ) {
      ctx.fillStyle = '#fff';
      ctx.font = '14px Arial';

      ctx.fillText(
        `${player.name} ${player.score}`,
        player.snake[0].x * size,
        player.snake[0].y * size - 5
      );
    }
  }

  if (remoteBoss && remoteBoss.alive && selectedLevel === 6) {
    drawRemoteBoss();
  }
}

function draw() {
  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  if (gameBackground.complete) {
    ctx.drawImage(
      gameBackground,
      0,
      0,
      canvas.width,
      canvas.height
    );
  } else {
    ctx.fillStyle = '#000';
    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );
  }

  if (
    mode === 'online' &&
    Object.keys(players).length > 0
  ) {
    drawOnline();
  } else {
    drawLocal();
  }

  if (isPaused) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'center';

    ctx.fillText(
      'PAUSED',
      canvas.width / 2,
      canvas.height / 2
    );

    ctx.textAlign = 'left';
  }
}

function stepLocal() {
  if (
    isPaused ||
    !localAlive ||
    localGameOverShown
  ) {
    return;
  }

  localDir = setDirection(
    localDir,
    localNextDir
  );

  const head = {
    ...localSnake[0]
  };

  if (localDir === 'up') head.y--;
  if (localDir === 'down') head.y++;
  if (localDir === 'left') head.x--;
  if (localDir === 'right') head.x++;

  const outside =
    head.x < 0 ||
    head.x >= gridWidth ||
    head.y < 0 ||
    head.y >= gridHeight;

  const hitsSelf = localSnake
    .slice(1)
    .some((segment) =>
      segment.x === head.x &&
      segment.y === head.y
    );

  const hitsEnemy = enemies.some((enemy) =>
    enemy.alive &&
    enemy.snake.some((part) =>
      part.x === head.x &&
      part.y === head.y
    )
  );
  const hitsObstacle = obstacles.some((block) =>
    block.x === head.x &&
    block.y === head.y
  );
  if (
    outside ||
    hitsSelf ||
    hitsEnemy ||
    hitsObstacle
  ) {
    showOfflineGameOver();
    return;
  }

  localSnake.unshift(head);

  const foodIndex = food.findIndex((apple) =>
    head.x === apple.x &&
    head.y === apple.y
  );

  if (foodIndex !== -1) {
    const eatenApple = food[foodIndex];

    localScore++;

    const growth = window.GAME_CONFIG?.foodGrowth || { red: 2, blue: 8, green: 15 };
if (eatenApple.type === 'blue') {
  localGrow += growth.blue;
} else if (eatenApple.type === 'green') {
  localGrow += growth.green;
} else {
  localGrow += growth.red;
}

    if (eatenApple.type === 'red') {
      food[foodIndex] = randomFood('red');
    } else {
      food.splice(foodIndex, 1);
    }
  }

  if (localGrow > 0) {
    localGrow--;
  } else {
    localSnake.pop();
  }
}

function gameLoop() {
  if (mode === 'offline') {
    // Player movement is now on separate timer (playerMoveTimer)
    // Enemy movement is now on separate timer (enemyMoveTimer)
    // Boss movement is now on separate timer (bossMoveTimer)
  }

  draw();
}

setInterval(() => {
  if (
    mode === 'online' &&
    remoteBoss &&
    remoteBoss.alive &&
    remoteBoss.rageActive
  ) {
    draw();
  }
}, 100);

singlePlayerBtn.focus();
showScreen(mainMenu);
playIntroMusic();


canvas.width = 360;
canvas.height = 400;

const gameSpeed = window.GAME_CONFIG?.timings?.gameLoop || 60;
setInterval(gameLoop, gameSpeed);