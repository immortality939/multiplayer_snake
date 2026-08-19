const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const restartBtn = document.getElementById('restart');
const controlButtons = document.querySelectorAll('.controls button');

let ws;
let myId = null;
let grid = 20;
let size = 30;
let players = {};
let food = { x: 0, y: 0 };

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}`);

  ws.onopen = () => statusEl.textContent = 'Connected';
  ws.onclose = () => {
    statusEl.textContent = 'Disconnected, reconnecting...';
    setTimeout(connect, 1000);
  };
  ws.onerror = () => statusEl.textContent = 'Connection error';

  ws.onmessage = (ev) => {
    const data = JSON.parse(ev.data);
    if (data.type === 'init') {
      myId = data.id;
      grid = data.grid;
      size = data.size;
    }
    if (data.type === 'state') {
      players = data.players;
      food = data.food;
      draw();
    }
  };
}

function sendDir(dir) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'dir', dir }));
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
  btn.addEventListener('click', () => {
    sendDir(btn.dataset.dir);
  });
  btn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    sendDir(btn.dataset.dir);
  }, { passive: false });
});

restartBtn.onclick = () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'restart' }));
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

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

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

connect();
draw();