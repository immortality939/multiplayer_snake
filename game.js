const WS_URL = 'wss://multiplayer-snake-9g07.onrender.com';

const mainMenu = document.getElementById('mainMenu');
const multiplayerMenu = document.getElementById('multiplayerMenu');
const roomScreen = document.getElementById('roomScreen');
const gameScreen = document.getElementById('gameScreen');

const singlePlayerBtn = document.getElementById('singlePlayerBtn');
const multiplayerBtn = document.getElementById('multiplayerBtn');
const backToMenuBtn = document.getElementById('backToMenuBtn');

const playerNameInput = document.getElementById('playerName');
const createRoomNameInput = document.getElementById('createRoomName');
const searchRoomNameInput = document.getElementById('searchRoomName');

const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');

const roomTitle = document.getElementById('roomTitle');
const playerList = document.getElementById('playerList');
const readyBtn = document.getElementById('readyBtn');
const startRoomBtn = document.getElementById('startRoomBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');

const roomMessage = document.getElementById('roomMessage');
const roomStatus = document.getElementById('roomStatus');

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const statusEl = document.getElementById('status');
const pauseBtn = document.getElementById('pause');
const restartBtn = document.getElementById('restart');
const gameOverLogo = document.getElementById('gameOverLogo');
const controlButtons = document.querySelectorAll('.controls button');

const introMusic = document.getElementById('introMusic');
const bgMusic = document.getElementById('bgMusic');
const gameOverSound = document.getElementById('gameOverSound');

const gameBackground = new Image();
gameBackground.src = 'Sbackground.jpg';

let ws = null;
let mode = 'menu';
let isHost = false;
let myId = null;
let currentRoom = '';
let isReady = false;
let isPaused = false;

let players = {};
let food = { x: 0, y: 0 };

let gridWidth = 72;
let gridHeight = 80;
let size = 5;
const drawSize = 5;

let localSnake = [
  { x: 10, y: 10 },
  { x: 9, y: 10 },
  { x: 8, y: 10 }
];

let localDir = 'right';
let localNextDir = 'right';
let localGrow = 0;
let localScore = 0;
let localAlive = true;
let localGameOverShown = false;

function showScreen(screen) {
  mainMenu.classList.add('hidden');
  multiplayerMenu.classList.add('hidden');
  roomScreen.classList.add('hidden');
  gameScreen.classList.add('hidden');

  screen.classList.remove('hidden');
}

function setRoomMessage(message) {
  roomMessage.textContent = message || '';
}

function setRoomStatus(message) {
  roomStatus.textContent = message || '';
}

function playIntroMusic() {
  if (!introMusic) return;

  introMusic.volume = 0.35;
  introMusic.play().catch(() => {});
}

function stopIntroMusic() {
  if (!introMusic) return;

  introMusic.pause();
  introMusic.currentTime = 0;
}

function playGameMusic() {
  if (!bgMusic) return;

  bgMusic.volume = 0.35;
  bgMusic.loop = true;
  bgMusic.play().catch(() => {});
}

function stopGameMusic() {
  if (!bgMusic) return;

  bgMusic.pause();
  bgMusic.currentTime = 0;
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

  ws.onopen = () => {
    if (mode === 'menu' || mode === 'multiplayer-menu') {
      setRoomMessage('Connected.');
    }
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleServerMessage(data);
  };

  ws.onerror = () => {
    setRoomMessage('Server connection error.');
  };

  ws.onclose = () => {
    ws = null;

    if (
      mode === 'room' ||
      mode === 'online'
    ) {
      setRoomStatus('Disconnected from server.');
    }
  };
}

function handleServerMessage(data) {
  if (data.type === 'error') {
    setRoomMessage(data.message || 'Something went wrong.');
    setRoomStatus(data.message || 'Something went wrong.');
    return;
  }

  if (data.type === 'connected') {
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

    renderRoom(data);
    return;
  }

  if (data.type === 'gameStart') {
    mode = 'online';
    isPaused = Boolean(data.paused);
    players = convertPlayers(data.players);
    food = data.food;
    gridWidth = data.width || gridWidth;
    gridHeight = data.height || gridHeight;
    size = data.size || size;

    stopIntroMusic();
    playGameMusic();
    showScreen(gameScreen);
    setStatus('Connected');
    draw();
    return;
  }

  if (data.type === 'state') {
    mode = 'online';
    isPaused = Boolean(data.paused);
    players = convertPlayers(data.players);
    food = data.food;

    updatePauseButton();
    setStatus(isPaused ? 'Paused' : 'Connected');
    draw();
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

function beginSinglePlayer() {
  mode = 'offline';
  isHost = false;
  currentRoom = '';
  myId = null;
  isPaused = false;

  stopIntroMusic();
  playGameMusic();

  resetLocalGame();
  showScreen(gameScreen);
}

function beginMultiplayerMenu() {
  mode = 'multiplayer-menu';

  playIntroMusic();
  showScreen(multiplayerMenu);
  connectSocket();
}

function createRoom() {
  const name = playerNameInput.value.trim();
  const room = createRoomNameInput.value.trim();

  if (!name || !room) {
    setRoomMessage('Enter your name and a room name.');
    return;
  }

  setRoomMessage('Creating room...');

  send({
    type: 'createRoom',
    name,
    room
  });
}

function joinRoom() {
  const name = playerNameInput.value.trim();
  const room = searchRoomNameInput.value.trim();

  if (!name || !room) {
    setRoomMessage('Enter your name and the room name.');
    return;
  }

  setRoomMessage('Joining room...');

  send({
    type: 'joinRoom',
    name,
    room
  });
}

function leaveRoom() {
  if (ws) {
    ws.close();
  }

  mode = 'multiplayer-menu';
  isHost = false;
  currentRoom = '';
  myId = null;

  setRoomMessage('');
  showScreen(multiplayerMenu);
  connectSocket();
}

singlePlayerBtn.addEventListener('click', beginSinglePlayer);
multiplayerBtn.addEventListener('click', beginMultiplayerMenu);

backToMenuBtn.addEventListener('click', () => {
  stopIntroMusic();
  showScreen(mainMenu);
  mode = 'menu';
});

createRoomBtn.addEventListener('click', createRoom);
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

function setStatus(text) {
  statusEl.textContent = text;
}

function updatePauseButton() {
  pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
}

function randomFood() {
  return {
    x: Math.floor(Math.random() * gridWidth),
    y: Math.floor(Math.random() * gridHeight)
  };
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
  localSnake = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 }
  ];

  localDir = 'right';
  localNextDir = 'right';
  localGrow = 0;
  localScore = 0;
  localAlive = true;
  localGameOverShown = false;
  food = randomFood();

  gameOverLogo.classList.remove('show');

  if (gameOverSound) {
    gameOverSound.pause();
    gameOverSound.currentTime = 0;
  }

  setStatus('Offline');
  draw();
}

function showOfflineGameOver() {
  if (localGameOverShown) return;

  localGameOverShown = true;
  setStatus('Game Over');

  stopGameMusic();
  playGameOverSound();

  gameOverLogo.classList.add('show');
  draw();
}

function sendDirection(direction) {
  if (isPaused || localGameOverShown) return;

  if (mode === 'online') {
    send({
      type: 'dir',
      dir: direction
    });
  } else {
    localNextDir = direction;
  }
}

function togglePause() {
  if (mode === 'online') {
    if (!isHost) {
      setStatus('Only the host can pause.');
      return;
    }

    send({ type: 'pause' });
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

  resetLocalGame();
  playGameMusic();
});

document.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();

  if (mode !== 'offline' && mode !== 'online') {
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

    if (mode === 'offline' || mode === 'online') {
      if (mode === 'offline') {
        playGameMusic();
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
  if (!snake || snake.length === 0) return;

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
  ctx.arc(hx, hy, drawSize * 0.42, 0, Math.PI * 2);
  ctx.fill();
}

function drawApple() {
  if (!food) return;

  ctx.fillStyle = '#ef4444';

  ctx.beginPath();
  ctx.arc(
    food.x * drawSize + drawSize / 2,
    food.y * drawSize + drawSize / 2,
    drawSize * 0.35,
    0,
    Math.PI * 2
  );
  ctx.fill();
}

function drawLocal() {
  drawApple();
  drawSnake(localSnake, '#008cff');

  ctx.fillStyle = '#fff';
  ctx.font = '14px Arial';
  ctx.fillText(`Score ${localScore}`, 10, 20);
}

function drawOnline() {
  drawApple();

  for (const player of Object.values(players)) {
    drawSnake(
      player.snake,
      player.color || '#22c55e'
    );

    if (player.snake && player.snake[0]) {
      ctx.fillStyle = '#fff';
      ctx.font = '14px Arial';

      ctx.fillText(
        `${player.name} ${player.score}`,
        player.snake[0].x * size,
        player.snake[0].y * size - 5
      );
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

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

  if (outside || hitsSelf) {
    localAlive = false;
    showOfflineGameOver();
    return;
  }

  localSnake.unshift(head);

  if (
    head.x === food.x &&
    head.y === food.y
  ) {
    localScore++;
    localGrow += 2;
    food = randomFood();
  }

  if (localGrow > 0) {
    localGrow--;
  } else {
    localSnake.pop();
  }
}

function gameLoop() {
  if (mode === 'offline') {
    stepLocal();
  }

  draw();
}

singlePlayerBtn.focus();
showScreen(mainMenu);
connectSocket();

canvas.width = 360;
canvas.height = 400;

setInterval(gameLoop, 120);