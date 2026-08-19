const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const wss = new WebSocket.Server({ server });
const GRID = 20;
const SIZE = 30;
const TICK = 120;

const COLORS = ['#ff4d4d', '#4dd2ff', '#7dff4d', '#ffd24d', '#d64dff', '#ff7fbf'];
let nextId = 1;
let players = {};
let food = randomFood();

function randomFood() {
  return { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
}

function spawnSnake(id) {
  const x = Math.floor(Math.random() * GRID);
  const y = Math.floor(Math.random() * GRID);
  return {
    id,
    color: COLORS[(id - 1) % COLORS.length],
    dir: 'right',
    nextDir: 'right',
    alive: true,
    score: 0,
    grow: 0,
    snake: [
      { x, y },
      { x: Math.max(0, x - 1), y },
      { x: Math.max(0, x - 2), y }
    ]
  };
}

function cloneState() {
  const out = {};
  for (const [id, p] of Object.entries(players)) {
    out[id] = {
      id: p.id,
      color: p.color,
      alive: p.alive,
      score: p.score,
      snake: p.snake,
      dir: p.dir
    };
  }
  return out;
}

function broadcast() {
  const payload = JSON.stringify({ type: 'state', players: cloneState(), food });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

function setDir(current, next) {
  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
  if (next && next !== opposite[current]) return next;
  return current;
}

function step() {
  for (const p of Object.values(players)) {
    if (!p.alive) continue;
    p.dir = setDir(p.dir, p.nextDir);
    const head = { ...p.snake[0] };

    if (p.dir === 'up') head.y--;
    if (p.dir === 'down') head.y++;
    if (p.dir === 'left') head.x--;
    if (p.dir === 'right') head.x++;

    if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
      p.alive = false;
      continue;
    }

    const hitsSelf = p.snake.slice(1).some(s => s.x === head.x && s.y === head.y);
    const hitsOther = Object.values(players).some(other =>
      other !== p && other.snake.some(s => s.x === head.x && s.y === head.y)
    );

    if (hitsSelf || hitsOther) {
      p.alive = false;
      continue;
    }

    p.snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
      p.score += 1;
      p.grow += 2;
      food = randomFood();
    }

    if (p.grow > 0) p.grow--;
    else p.snake.pop();
  }

  broadcast();
}

wss.on('connection', (ws) => {
  const id = nextId++;
  players[id] = spawnSnake(id);

  ws.send(JSON.stringify({ type: 'init', id, grid: GRID, size: SIZE }));
  broadcast();

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === 'dir' && players[id]) players[id].nextDir = data.dir;
      if (data.type === 'restart') players[id] = spawnSnake(id);
    } catch {}
  });

  ws.on('close', () => {
    delete players[id];
    broadcast();
  });
});

setInterval(step, TICK);

server.listen(PORT, () => console.log(`Listening on ${PORT}`));
