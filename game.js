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
  // cleaner border only (no small grid lines)
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
}

function drawSnake(snake, color) {
  if (!snake) return;

  ctx.fillStyle = color;

  for (let i = 0; i < snake.length; i++) {
    const seg = snake[i];

    // convert server grid position to visual position
    const x = seg.x * size;
    const y = seg.y * size;

    if (i === 0) {
      // round head
      ctx.beginPath();
      ctx.arc(
        x + size / 2,
        y + size / 2,
        size / 2 - 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    } else {
      // smaller body blocks
      ctx.fillRect(
        x + 3,
        y + 3,
        size - 6,
        size - 6
      );
    }
  }
}

function drawApple() {
  if (!food) return;

  ctx.fillStyle = "#ef4444";

  ctx.beginPath();
  ctx.arc(
    food.x * size + size / 2,
    food.y * size + size / 2,
    size / 3,
    0,
    Math.PI * 2
  );
  ctx.fill();
}

function drawLocal() {
  drawApple();

  drawSnake(localSnake, "#008cff");

  ctx.fillStyle = "#ffffff";
  ctx.font = "14px Arial";
  ctx.fillText(`Score ${localScore}`, 10, 20);
}

function drawOnline() {
  drawApple();

  for (const p of Object.values(players)) {
    drawSnake(p.snake, p.color || "#22c55e");

    if (p.snake[0]) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "14px Arial";
      ctx.fillText(
        `P${p.id} ${p.score}`,
        p.snake[0].x * size,
        p.snake[0].y * size - 5
      );
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawGrid();

  if (mode === "online" && Object.keys(players).length) {
    drawOnline();
  } else {
    drawLocal();
  }
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