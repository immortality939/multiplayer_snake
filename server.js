const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const wss = new WebSocket.Server({ server });

const WIDTH = 72;
const HEIGHT = 80;
const SIZE = 5;
const TICK = 120;

const COLORS = [
  '#ff4d4d',
  '#4dd2ff',
  '#7dff4d',
  '#ffd24d',
  '#d64dff',
  '#ff7fbf'
];

let nextId = 1;
let players = {};
let food = randomFood();
let gamePaused = false;

function randomFood() {
  return {
    x: Math.floor(Math.random() * WIDTH),
    y: Math.floor(Math.random() * HEIGHT)
  };
}

function spawnSnake(id) {
  const x = Math.floor(WIDTH / 2);
  const y = Math.floor(HEIGHT / 2);

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
      { x: x - 1, y },
      { x: x - 2, y }
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
  const payload = JSON.stringify({
    type: 'state',
    players: cloneState(),
    food,
    paused: gamePaused
  });

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function setDir(current, next) {
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

function step() {
  if (gamePaused) {
    broadcast();
    return;
  }

  for (const p of Object.values(players)) {
    if (!p.alive) continue;

    p.dir = setDir(p.dir, p.nextDir);
    const head = { ...p.snake[0] };

    if (p.dir === 'up') head.y--;
    if (p.dir === 'down') head.y++;
    if (p.dir === 'left') head.x--;
    if (p.dir === 'right') head.x++;

    if (
      head.x < 0 ||
      head.x >= WIDTH ||
      head.y < 0 ||
      head.y >= HEIGHT
    ) {
      p.alive = false;
      continue;
    }

    const hitsSelf = p.snake
      .slice(1)
      .some((s) => s.x === head.x && s.y === head.y);

    const hitsOther = Object.values(players).some((other) =>
      other !== p &&
      other.alive &&
      other.snake.some((s) => s.x === head.x && s.y === head.y)
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

    if (p.grow > 0) {
      p.grow--;
    } else {
      p.snake.pop();
    }
  }

  broadcast();
}

wss.on('connection', (ws) => {
  const id = nextId++;
  players[id] = spawnSnake(id);

  ws.send(JSON.stringify({
    type: 'init',
    id,
    width: WIDTH,
    height: HEIGHT,
    size: SIZE,
    paused: gamePaused
  }));

  broadcast();

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      if (data.type === 'dir' && players[id] && !gamePaused) {
        players[id].nextDir = data.dir;
      }

      if (data.type === 'pause') {
        gamePaused = !gamePaused;
        broadcast();
      }

      if (data.type === 'restart' && players[id]) {
        players[id] = spawnSnake(id);
        gamePaused = false;
        broadcast();
      }
    } catch (error) {
      console.error('Message error:', error.message);
    }
  });

  ws.on('close', () => {
    delete players[id];
    broadcast();
  });
});

setInterval(step, TICK);

server.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});
