const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const restartBtn = document.getElementById('restart');
const controlButtons = document.querySelectorAll('.controls button');

const WS_URL = 'wss://multiplayer-snake-9g07.onrender.com';

let ws = null;
let mode = 'offline';
let myId = null;

let grid = 20;
let size = 30;
let players = {};
let food = { x: 0, y: 0 };

let localSnake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
let localDir = 'right';
let localNextDir = 'right';
let localGrow = 0;
let localScore = 0;
let localAlive = true;

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function randomFood() {
  return { x: Math.floor(Math.random() * grid), y: Math.floor(Math.random() * grid) };
}

function setDir(current, next) {
  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
  if (next && next !== opposite[current]) return next;
  return current;
}

function resetLocalGame() {
  localSnake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
  localDir = 'right';
  localNextDir = 'right';
  localGrow = 0;
  localScore = 0;
  localAlive = true;
  food = randomFood();
  draw();
}

function connectSocket() {
  try {
    ws = new WebSocket(WS_URL);
  } catch (e) {
    startOffline();
    return;
  }

  ws.onopen = () => {
    mode = 'online';
    setStatus('Connected');
  };

  ws.onmessage = (ev) => {
    const data = JSON.parse(ev.data);
    if (data.type === 'init') {
      myId = data.id;
      grid = data.grid;
      size = data.size;
      mode = 'online';
      setStatus('Connected');
    }
    if (data.type === 'state') {
      players = data.players;
      food = data.food;
      draw();
    }
  };

  ws.onerror = () => {
    startOffline();
  };

  ws.onclose = () => {
    if (mode === 'online') startOffline();
  };
}

function startOffline() {
  mode = 'offline';
  setStatus('Offline');
  resetLocalGame();
}

function sendDir(dir) {
  if (mode === 'online' && ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'dir', dir }));
  } else {
    localNextDir = dir;
  }
}

document.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'arrowup' || key === 'w') sendDir('up');
  if (key === 'arrowdown' || key === 's') sendDir('down');
  if (key === 'arrowleft' || key === 'a') sendDir('left');
  if (key === 'arrowright' || key === 'd') sendDir('right');
});

controlButtons.forEach((btn) => {
  const dir = btn.dataset.dir;
  btn.addEventListener('click', () => sendDir(dir));
  btn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    sendDir(dir);
  }, { passive: false });
});

restartBtn.onclick = () => {
  if (mode === 'online' && ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'restart' }));
  } else {
    resetLocalGame();
  }
};

function drawGrid() {
  ctx.strokeStyle = '#1f2937';
  for (let i = 0; i <= grid; i++) {
    ctx.beginPath();
    ctx.moveTo(i * size, 0);
    ctx.lineTo(i * size, grid * size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i * size);
    ctx.lineTo(grid * size, i * size);
    ctx.stroke();
  }
}

function drawLocal() {
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(food.x * size, food.y * size, size, size);

  ctx.fillStyle = '#22c55e';
  for (const seg of localSnake) {
    ctx.fillRect(seg.x * size + 2, seg.y * size + 2, size - 4, size - 4);
  }

  ctx.fillStyle = '#fff';
  ctx.font = '12px Arial';
  ctx.fillText(`Score ${localScore}`, 8, 16);
}

function drawOnline() {
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(food.x * size, food.y * size, size, size);

  for (const p of Object.values(players)) {
    ctx.fillStyle = p.color || '#22c55e';
    for (const seg of p.snake) {
      ctx.fillRect(seg.x * size + 2, seg.y * size + 2, size - 4, size - 4);
    }
    if (p.snake[0]) {
      ctx.fillStyle = '#fff';
      ctx.font = '12px Arial';
      ctx.fillText(`P${p.id} ${p.score}`, p.snake[0].x * size + 2, p.snake[0].y * size + 14);
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  if (mode === 'online' && Object.keys(players).length) drawOnline();
  else drawLocal();
}

function stepLocal() {
  if (!localAlive) return;

  localDir = setDir(localDir, localNextDir);
  const head = { ...localSnake[0] };

  if (localDir === 'up') head.y--;
  if (localDir === 'down') head.y++;
  if (localDir === 'left') head.x--;
  if (localDir === 'right') head.x++;

  if (head.x < 0 || head.x >= grid || head.y < 0 || head.y >= grid) {
    localAlive = false;
    setStatus('Game Over');
    draw();
    return;
  }

  const selfHit = localSnake.slice(1).some(s => s.x === head.x && s.y === head.y);
  if (selfHit) {
    localAlive = false;
    setStatus('Game Over');
    draw();
    return;
  }

  localSnake.unshift(head);

  if (head.x === food.x && head.y === food.y) {
    localScore += 1;
    localGrow += 2;
    food = randomFood();
  }

  if (localGrow > 0) localGrow--;
  else localSnake.pop();
}

function gameLoop() {
  if (mode === 'offline') stepLocal();
  draw();
}

function init() {
  food = randomFood();
  draw();
  connectSocket();
  setInterval(gameLoop, 120);
}

init();