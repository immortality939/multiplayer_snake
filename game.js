const WS_URL = 'wss://multiplayer-snake-9g07.onrender.com';

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

let food = [
  {
    x: 10,
    y: 10,
    type: 'red'
  }
];

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

let offlineBlueTimer = null;
let offlineGreenTimer = null;
let offlineEnemyTimer = null;

let enemies = [];

function showScreen(screen) {
  mainMenu.classList.add('hidden');
  levelScreen.classList.add('hidden');
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

function setStatus(text) {
  statusEl.textContent = text;
}

function playIntroMusic() {
  if (!introMusic) return;

  introMusic.volume = 0.35;

  const attempt = introMusic.play();

  if (attempt !== undefined) {
    attempt.catch(() => {
      console.log('Intro music requires user interaction.');
    });
  }
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
    isPaused = Boolean(data.paused);

    multiplayerLevel = data.level || 1;
    selectedLevel = multiplayerLevel;
    obstacles = createLevelObstacles();

    players = convertPlayers(data.players);
    food = normalizeFood(data.food);

    gridWidth = data.width || gridWidth;
    gridHeight = data.height || gridHeight;
    size = data.size || size;

    stopOfflineAppleTimers();
    stopIntroMusic();
    playGameMusic();
    showScreen(gameScreen);
    updatePauseButton();
    setStatus('Connected');
    draw();
    return;
  }

  if (data.type === 'state') {
    mode = 'online';
    isPaused = Boolean(data.paused);
    players = convertPlayers(data.players);
    food = normalizeFood(data.food);

    updatePauseButton();
    setStatus(isPaused ? 'Paused' : 'Connected');
    draw();
  }
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
  startRoomBtn.disabled =
    !isHost ||
    !allReady ||
    !multiplayerLevel;

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

  updateRoomLevelButtons();
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
    const level =
      Number(button.dataset.level);

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

    if (apple.type === 'blue') {
      enemy.grow += 8;
    } else if (apple.type === 'green') {
      enemy.grow += 15;
    } else {
      enemy.grow += 2;
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

  offlineBlueTimer = setInterval(() => {
    if (
      mode === 'offline' &&
      !isPaused &&
      !localGameOverShown
    ) {
      food.push(randomFood('blue'));
      draw();
    }
  }, 8000);

  offlineGreenTimer = setInterval(() => {
    if (
      mode === 'offline' &&
      !isPaused &&
      !localGameOverShown
    ) {
      food.push(randomFood('green'));
      draw();
    }
  }, 16000);

  offlineEnemyTimer = setInterval(() => {
    if (
      mode === 'offline' &&
      !isPaused &&
      !localGameOverShown
    ) {
      spawnEnemy();
      draw();
    }
  }, 20000);
}

function stopOfflineAppleTimers() {
  clearInterval(offlineBlueTimer);
  clearInterval(offlineGreenTimer);
  clearInterval(offlineEnemyTimer);

  offlineBlueTimer = null;
  offlineGreenTimer = null;
  offlineEnemyTimer = null;
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
  playGameMusic();

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
  connectSocket();
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
backFromLevelBtn.addEventListener('click', () => {
  showScreen(mainMenu);
  mode = 'menu';
});
multiplayerBtn.addEventListener('click', beginMultiplayerMenu);

backToMenuBtn.addEventListener('click', () => {
  stopIntroMusic();
  showScreen(mainMenu);
  mode = 'menu';
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

    const level =
      Number(button.dataset.level);

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
  isPaused = false;
  enemies = [];
  obstacles = createLevelObstacles();
  food = [randomFood('red')];

  gameOverLogo.classList.remove('show');

  if (gameOverSound) {
    gameOverSound.pause();
    gameOverSound.currentTime = 0;
  }

  updatePauseButton();
  setStatus('Offline');
  draw();
}
function createLevelObstacles() {
  if (selectedLevel === 1) {
    return [];
  }

  const result = [];
  const middleY = Math.floor(gridHeight / 2);

  if (
    selectedLevel === 2 ||
    selectedLevel === 3 ||
    selectedLevel === 4
  ) {
    for (let x = 18; x < gridWidth - 18; x++) {
      result.push({
        x,
        y: middleY
      });
    }
  }

  if (selectedLevel === 3) {
    const middleX = Math.floor(gridWidth / 2);

    for (let y = 10; y < gridHeight - 10; y++) {
      result.push({
        x: middleX,
        y
      });
    }
  }

  if (selectedLevel === 4) {
    const middleX = Math.floor(gridWidth / 2);

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
  if (selectedLevel === 5) {
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
  if (
    isPaused ||
    localGameOverShown
  ) {
    return;
  }

  if (mode === 'online') {
    send({
      type: 'dir',
      dir: direction
    });
  } else if (mode === 'offline') {
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

  resetLocalGame();
  startOfflineAppleTimers();
  playGameMusic();
});

menuBtn.addEventListener('click', () => {
  if (ws) {
    ws.close();
    ws = null;
  }

  stopOfflineAppleTimers();
  stopGameMusic();

  if (gameOverSound) {
    gameOverSound.pause();
    gameOverSound.currentTime = 0;
  }

  gameOverLogo.classList.remove('show');

  mode = 'menu';
  isHost = false;
  myId = null;
  currentRoom = '';
  isReady = false;
  isPaused = false;
  players = {};
  enemies = [];

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

  for (const enemy of enemies) {
    drawSnake(enemy.snake, '#d4af37');
  }

  ctx.fillStyle = '#fff';
  ctx.font = '14px Arial';
  ctx.fillText(`Score ${localScore}`, 10, 20);
}

function drawOnline() {
  drawObstacles();
  drawApple();

  for (const player of Object.values(players)) {
    drawSnake(
      player.snake,
      player.color || '#22c55e'
    );

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

    if (eatenApple.type === 'blue') {
      localGrow += 8;
    } else if (eatenApple.type === 'green') {
      localGrow += 15;
    } else {
      localGrow += 2;
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
    stepLocal();

    for (const enemy of enemies) {
      moveEnemy(enemy);
    }

    enemies = enemies.filter((enemy) =>
      enemy.alive
    );
  }

  draw();
}

singlePlayerBtn.focus();
showScreen(mainMenu);
playIntroMusic();
connectSocket();

canvas.width = 360;
canvas.height = 400;

setInterval(gameLoop, 120);