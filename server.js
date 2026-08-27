const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const CONFIG = require('./config.js');
// Config validation – will crash server if boss config is wrong
if (!CONFIG.boss || typeof CONFIG.boss.baseSpeedMs !== 'number') {
  throw new Error(
    'Invalid config: CONFIG.boss.baseSpeedMs must be a number. Current value: ' +
    JSON.stringify(CONFIG.boss)
  );
}

if (typeof CONFIG.timings?.gameLoop !== 'number') {
  throw new Error(
    'Invalid config: CONFIG.timings.gameLoop must be a number. Current value: ' +
    JSON.stringify(CONFIG.timings)
  );
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Use config values
const WIDTH = CONFIG.grid.width;
const HEIGHT = CONFIG.grid.height;
const SIZE = CONFIG.grid.cellSize;
const TICK = 20;
const MAX_PLAYERS = CONFIG.multiplayer.maxPlayersPerRoom;

const COLORS = [
  '#ff4d4d',
  '#4dd2ff',
  '#7dff4d',
  '#ffd24d'
];

let nextId = 1;
const rooms = new Map();
const bossState = new Map();
function cleanText(value, fallback) {
  const text = String(value || '').trim();

  if (!text) {
    return fallback;
  }

  return text.slice(0, 18);
}

function normalizeRoomName(value) {
  return cleanText(value, 'Room').toLowerCase();
}

function randomFood(type = 'red', room = null) {
  const obstacles =
    createLevelObstaclesForLevel(room?.level || 1);

  const blocked = new Set();

  for (const obstacle of obstacles) {
    blocked.add(`${obstacle.x},${obstacle.y}`);
  }

  if (room) {
    for (const player of room.players.values()) {
      for (const segment of player.snake || []) {
        blocked.add(`${segment.x},${segment.y}`);
      }
    }

    for (const apple of room.food || []) {
      blocked.add(`${apple.x},${apple.y}`);
    }

    const boss = bossState.get(room.name);

    if (boss) {
      for (const segment of boss.snake || []) {
        blocked.add(`${segment.x},${segment.y}`);
      }
    }
  }

  const availableCells = [];

  for (let x = 1; x < WIDTH - 1; x++) {
    for (let y = 1; y < HEIGHT - 1; y++) {
      if (!blocked.has(`${x},${y}`)) {
        availableCells.push({ x, y });
      }
    }
  }

  if (availableCells.length === 0) {
    return null;
  }

  const position =
    availableCells[
      Math.floor(Math.random() * availableCells.length)
    ];

  return {
    x: position.x,
    y: position.y,
    type
  };
}

function createSnake(playerId) {
  const margin = 8;
  const initialLen = CONFIG.initialLength || 3;

  const spawns = {
    1: { x: margin, y: margin, dir: 'right' },
    2: { x: WIDTH - margin - 1, y: margin, dir: 'down' },
    3: { x: WIDTH - margin - 1, y: HEIGHT - margin - 1, dir: 'left' },
    4: { x: margin, y: HEIGHT - margin - 1, dir: 'up' }
  };

  const spawn = spawns[((playerId - 1) % 4) + 1];

  const snake = [];
  for (let i = 0; i < initialLen; i++) {
    if (spawn.dir === 'left') {
      snake.push({ x: spawn.x + i, y: spawn.y });
    } else if (spawn.dir === 'right') {
      snake.push({ x: spawn.x - i, y: spawn.y });
    } else if (spawn.dir === 'down') {
      snake.push({ x: spawn.x, y: spawn.y - i });
    } else if (spawn.dir === 'up') {
      snake.push({ x: spawn.x, y: spawn.y + i });
    }
  }

  return snake;
}

function getSpawnDirection(playerId) {
  const directions = {
    1: 'right',
    2: 'down',
    3: 'left',
    4: 'up'
  };

  return directions[((playerId - 1) % 4) + 1];
}

function createPlayer(ws, name, host) {
  const id = nextId++;

  return {
    id,
    ws,
    name,
    host,
    ready: host,
    color: COLORS[(id - 1) % COLORS.length],
    dir: getSpawnDirection(id),
    nextDir: getSpawnDirection(id),
    alive: true,
dying: false,
deathTimer: null,
score: 0,
grow: 0,
snake: createSnake(id),
    roomName: '',
    moveInterval: CONFIG.speed?.player || 120,
    lastMoveTime: 0
    
  };
}

function createRoom(roomName, player) {
  const room = {
    name: roomName,
    hostId: player.id,
    started: false,
    paused: false,
    level: 1,
    food: [],
    introTimer: null,
    countdownTimer: null,
    startTime: 0,
    countdownEndsAt: 0,
    winnerShown: false,
    blueTimer: null,
    greenTimer: null,
    players: new Map()
  };

  room.players.set(player.id, player);
  player.roomName = roomName;

  rooms.set(roomName, room);
room.food = [randomFood('red', room)].filter(Boolean);
  return room;
}

function getRoom(roomName) {
  if (!roomName) {
    return null;
  }

  return rooms.get(normalizeRoomName(roomName));
}

function publicPlayers(room) {
  return Array.from(room.players.values()).map((player) => ({
    id: player.id,
    name: player.name,
    host: player.host,
    ready: player.ready,
    alive: player.alive,
dying: player.dying,
color: player.color,
    score: player.score,
    snake: player.snake
  }));
}

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function roomState(room) {
  return {
    type: 'roomState',
    room: room.name,
    hostId: room.hostId,
    started: room.started,
    paused: room.paused,
    level: room.level,
    players: publicPlayers(room)
  };
}

function broadcastRoom(room, data) {
  const message = JSON.stringify(data);

  for (const player of room.players.values()) {
    if (player.ws && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(message);
    }
  }
}

function broadcastRoomState(room) {
  broadcastRoom(room, roomState(room));
}

function sendRoomList(ws) {
  const list = Array.from(rooms.values())
    .filter((room) =>
      !room.started &&
      room.players.size < MAX_PLAYERS
    )
    .map((room) => ({
      name: room.name,
      players: room.players.size
    }));

  send(ws, {
    type: 'roomList',
    rooms: list
  });
}

function allJoinersReady(room) {
  return Array.from(room.players.values())
    .every((player) =>
      player.host || player.ready
    );
}

function setDirection(player, direction) {
  const allowed = ['up', 'down', 'left', 'right'];

  if (!allowed.includes(direction)) {
    return;
  }

  const opposite = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left'
  };

  if (direction !== opposite[player.dir]) {
    player.nextDir = direction;
  }
}

function resetRoomGame(room) {
  room.food = [randomFood('red', room)].filter(Boolean);
  room.paused = true; // Keep paused during intro
  room.winnerShown = false;
  room.startTime = 0;
  room.countdownEndsAt = 0;

  clearTimeout(room.countdownTimer);
  room.countdownTimer = null;

  for (const player of room.players.values()) {
    player.dir = getSpawnDirection(player.id);
    player.nextDir = getSpawnDirection(player.id);
    if (player.deathTimer) {
      clearTimeout(player.deathTimer);
      player.deathTimer = null;
    }

    player.alive = true;
    player.dying = false;
    player.score = 0;
    player.grow = 0;
    player.snake = createSnake(player.id);
    player.moveInterval = CONFIG.speed?.player || 120;
    player.lastMoveTime = 0;
  }
}

function stopFoodTimers(room) {
  clearInterval(room.blueTimer);
  clearInterval(room.greenTimer);

  room.blueTimer = null;
  room.greenTimer = null;

  const boss = bossState.get(room.name);

  if (boss) {
    clearInterval(boss.rageTimer);
    clearTimeout(boss.rageEndTimer);

    boss.rageTimer = null;
    boss.rageEndTimer = null;
    boss.rageActive = false;
  }
}

function getPublicBoss(room) {
  const boss = bossState.get(room.name);

  if (!boss) {
    return null;
  }

  return {
    snake: boss.snake,
    alive: boss.alive,
    rageActive: boss.rageActive
  };
}

function startFoodTimers(room) {
  stopFoodTimers(room);

  if (room.level === CONFIG.boss.enabledInLevel) {
    const boss = bossState.get(room.name);

    if (boss) {
      const speedConfig = CONFIG.speed?.boss || {
        normal: 120,
        rage: 60
      };

      const bossConfig = CONFIG.boss || {};
      const baseSpeed =
        speedConfig.normal ||
        bossConfig.baseSpeedMs ||
        CONFIG.timings.gameLoop;

      const rageSpeed =
        speedConfig.rage ||
        bossConfig.rageSpeedMs ||
        baseSpeed;

      const rageInterval =
        bossConfig.rageIntervalMs || 5000;

      const rageDuration =
        bossConfig.rageDurationMs || 3000;

      boss.baseSpeed = baseSpeed;
      boss.currentSpeed = baseSpeed;

      boss.rageTimer = setInterval(() => {
        if (
          !room.started ||
          room.paused ||
          !boss.alive
        ) {
          return;
        }

        boss.rageActive = true;
        boss.currentSpeed = rageSpeed;
        boss.lastMoveTime = Date.now();

        broadcastRoom(room, {
          type: 'state',
          players: publicPlayers(room),
          food: room.food,
          paused: room.paused,
          level: room.level,
          boss: {
            snake: boss.snake,
            alive: boss.alive,
            rageActive: true
          }
        });

        clearTimeout(boss.rageEndTimer);

        boss.rageEndTimer = setTimeout(() => {
          if (!boss.alive) {
            return;
          }

          boss.rageActive = false;
          boss.currentSpeed = boss.baseSpeed;
          boss.lastMoveTime = Date.now();

          broadcastRoom(room, {
            type: 'state',
            players: publicPlayers(room),
            food: room.food,
            paused: room.paused,
            level: room.level,
            boss: {
              snake: boss.snake,
              alive: boss.alive,
              rageActive: false
            }
          });
        }, rageDuration);
      }, rageInterval);
    }
  }

  room.blueTimer = setInterval(() => {
    if (!room.started || room.paused) {
      return;
    }

    const blueFood = randomFood('blue', room);

if (blueFood) {
  room.food.push(blueFood);
}

    broadcastRoom(room, {
      type: 'state',
      players: publicPlayers(room),
      food: room.food,
      paused: room.paused,
      level: room.level,
      boss: getPublicBoss(room)
    });
  }, CONFIG.timings.blueAppleSpawn);

  room.greenTimer = setInterval(() => {
    if (!room.started || room.paused) {
      return;
    }

    const greenFood = randomFood('green', room);

if (greenFood) {
  room.food.push(greenFood);
}

    broadcastRoom(room, {
      type: 'state',
      players: publicPlayers(room),
      food: room.food,
      paused: room.paused,
      level: room.level,
      boss: getPublicBoss(room)
    });
  }, CONFIG.timings.greenAppleSpawn);
}

function startRoom(room) {
  if (room.players.size < 1) {
    return;
  }

  if (!allJoinersReady(room)) {
    return;
  }

  room.started = true;
  room.paused = true; // Keep paused during intro message
  room.winnerShown = false;

  resetRoomGame(room);

  if (room.level === CONFIG.boss.enabledInLevel) {
    bossState.set(
      room.name,
      createBossSnakeServer(room)
    );
  } else {
    bossState.delete(room.name);
  }

  startFoodTimers(room);

  const boss = bossState.get(room.name);

  broadcastRoom(room, {
    type: 'gameStart',
    width: WIDTH,
    height: HEIGHT,
    size: SIZE,
    players: publicPlayers(room),
    food: room.food,
    paused: true,
    level: room.level,
    boss: boss
      ? {
          snake: boss.snake,
          alive: boss.alive,
          rageActive: boss.rageActive
        }
      : null,
    introMessage: room.level === 6 ? 'SNAKE SURVIVAL LAST SNAKE ALIVE<br>AVOID BOSS SNAKE' : '',
    introDuration: 4000
  });

  clearTimeout(room.introTimer);

  room.introTimer = setTimeout(() => {
    if (!room.started) {
      return;
    }

    room.paused = false; // Now allow players to control

    // Only start countdown in Level 6
    if (room.level === 6) {
      room.startTime = Date.now();
      room.countdownEndsAt = room.startTime + 60000;

      broadcastRoom(room, {
        type: 'countdownStart',
        countdownEndsAt: room.countdownEndsAt
      });

      clearTimeout(room.countdownTimer);

      room.countdownTimer = setTimeout(() => {
        finishRoomCountdown(room);
      }, 60000);
    }
  }, 4000);
}

function finishRoomCountdown(room) {
  if (!room.started || room.winnerShown) {
    return;
  }

  // Only show winner/noWinner in Level 6
  if (room.level !== 6) {
    return;
  }

  room.winnerShown = true;
  room.paused = true;

  clearTimeout(room.countdownTimer);
  room.countdownTimer = null;

  // Stop all timers (including boss rage timer)
  stopFoodTimers(room);

  const alivePlayers = Array.from(room.players.values())
    .filter((player) =>
      player.alive &&
      player.snake &&
      player.snake.length > 0
    );

  if (alivePlayers.length === 0) {
    // No winner - all players dead before countdown finished
    broadcastRoom(room, {
      type: 'noWinner',
      winnerName: 'NO WINNER'
    });
  } else {
    // There is winner(s) - send names joined by ' & ' for client to split
    const winnerName =
      alivePlayers.length === 1
        ? alivePlayers[0].name
        : alivePlayers.map((player) => player.name).join(' & ');

    broadcastRoom(room, {
      type: 'winner',
      winnerName
    });
  }
}

function createBossSnakeServer(room) {
  const bossConfig = CONFIG.boss;
  const speedConfig = CONFIG.speed?.boss || { normal: 120, rage: 60 };
  const baseSpeed = speedConfig.normal || bossConfig.baseSpeedMs || 120;

  const startX = Math.floor(WIDTH / 2);
const startY = Math.floor(HEIGHT / 2);
const initialLen = bossConfig.initialLength || 20;

const levelObstacles = createLevelObstaclesForLevel(room.level);

let safeStartY = startY;

while (
  levelObstacles.some(
    block => block.x === startX && block.y === safeStartY
  )
) {
  safeStartY++;
}

const snake = [];

for (let i = 0; i < initialLen; i++) {
  snake.push({
    x: startX - i,
    y: safeStartY
  });
}

  return {
    snake,
    dir: 'right',
    nextDir: 'right',
    alive: true,
    grow: 0,
    baseSpeed,
    currentSpeed: baseSpeed,
    lastMoveTime: 0,
    rageActive: false,
    patrolTarget: getRandomPatrolTargetServer()
  };
}

function getRandomPatrolTargetServer() {
  const corners = [
    { x: 5, y: 5 },
    { x: WIDTH - 6, y: 5 },
    { x: WIDTH - 6, y: HEIGHT - 6 },
    { x: 5, y: HEIGHT - 6 }
  ];
  return corners[Math.floor(Math.random() * corners.length)];
}

function isBossDirectionSafeServer(head, dir, room) {
  const next = { ...head };
  if (dir === 'up') next.y--;
  if (dir === 'down') next.y++;
  if (dir === 'left') next.x--;
  if (dir === 'right') next.x++;

  if (
    next.x < 0 ||
    next.x >= WIDTH ||
    next.y < 0 ||
    next.y >= HEIGHT
  ) {
    return false;
  }

  const levelObstacles = createLevelObstaclesForLevel(room.level || 1);
  for (let i = 0; i < levelObstacles.length; i++) {
    if (levelObstacles[i].x === next.x && levelObstacles[i].y === next.y) {
      return false;
    }
  }

  const boss = bossState.get(room.name);
  if (boss && boss.snake) {
    for (let i = 0; i < boss.snake.length - 1; i++) {
      if (boss.snake[i].x === next.x && boss.snake[i].y === next.y) {
        return false;
      }
    }
  }

  return true;
}

function findAnySafeDirectionServer(head, room) {
  const dirs = ['up', 'down', 'left', 'right'];
  const boss = bossState.get(room.name);
  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const currentDir = boss?.dir || 'right';

  for (const dir of dirs) {
    if (dir === opposite[currentDir]) continue;
    if (isBossDirectionSafeServer(head, dir, room)) return dir;
  }

  for (const dir of dirs) {
    if (isBossDirectionSafeServer(head, dir, room)) return dir;
  }

  return null;
}

function getBestBossTargetServer(room) {
  const boss = bossState.get(room.name);
  if (!boss || !boss.snake.length) return null;

  const bossHead = boss.snake[0];
  let bestTarget = null;
  let bestDist = Infinity;

  const playerArray = Array.from(room.players.values());

  for (const player of playerArray) {
    if (!player.alive || !player.snake?.length) continue;

    const head = player.snake[0];
    const tail = player.snake[player.snake.length - 1];

    for (const target of [head, tail]) {
      const dist =
        Math.abs(bossHead.x - target.x) +
        Math.abs(bossHead.y - target.y);

      if (dist < bestDist) {
        bestDist = dist;
        bestTarget = target;
      }
    }
  }

  if (!bestTarget && playerArray.length) {
    const p = playerArray.find(pl => pl.alive && pl.snake?.length);
    if (p) bestTarget = p.snake[0];
  }

  return bestTarget;
}

function getBossPatrolDirectionServer(head, target, room) {
  const dx = target.x - head.x;
  const dy = target.y - head.y;

  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const boss = bossState.get(room.name);
  const currentDir = boss?.dir || 'right';

  const candidates = [];
  if (Math.abs(dx) > Math.abs(dy)) {
    candidates.push(dx > 0 ? 'right' : 'left');
    candidates.push(dy > 0 ? 'down' : 'up');
  } else {
    candidates.push(dy > 0 ? 'down' : 'up');
    candidates.push(dx > 0 ? 'right' : 'left');
  }

  for (const dir of candidates) {
    if (dir === opposite[currentDir]) continue;
    if (isBossDirectionSafeServer(head, dir, room)) return dir;
  }

  return findAnySafeDirectionServer(head, room);
}

function getBossChaseDirectionWithAvoidanceServer(head, target, room) {
  const dx = target.x - head.x;
  const dy = target.y - head.y;

  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const boss = bossState.get(room.name);
  const currentDir = boss?.dir || 'right';

  const candidates = [];
  if (Math.abs(dx) > Math.abs(dy)) {
    candidates.push(dx > 0 ? 'right' : 'left');
    candidates.push(dy > 0 ? 'down' : 'up');
  } else {
    candidates.push(dy > 0 ? 'down' : 'up');
    candidates.push(dx > 0 ? 'right' : 'left');
  }

  for (const dir of candidates) {
    if (dir === opposite[currentDir]) continue;
    if (isBossDirectionSafeServer(head, dir, room)) return dir;
  }

  return findAnySafeDirectionServer(head, room);
}

function checkBossPlayerCollision(room) {
  const boss = bossState.get(room.name);

  if (!boss || !boss.alive || !boss.snake.length) {
    return;
  }

  // Check every boss segment against every player segment
  for (const bossPart of boss.snake) {
    for (const player of room.players.values()) {
      if (!player.alive || !player.snake || !player.snake.length) {
        continue;
      }

      let hitIndex = -1;

      for (let i = 0; i < player.snake.length; i++) {
        const part = player.snake[i];

        if (part.x === bossPart.x && part.y === bossPart.y) {
          hitIndex = i;
          break;
        }
      }

      if (hitIndex !== -1) {
        // How many body parts boss "eats"
        const eatenLength = player.snake.length - hitIndex;

        // Add growth to boss
        boss.grow += eatenLength;

        // Player head bitten = death
        if (hitIndex === 0) {
          player.alive = false;
          player.snake = [];
          
          // Check if all players are dead
          checkAllPlayersDead(room);
        }
        // Player body bitten = cut snake
        else {
          player.snake = player.snake.slice(0, hitIndex);
          player.score = Math.max(0, player.score - 5);
        }

        // Only handle one collision per boss segment per tick
        break;
      }
    }
  }
}

function moveBossSnakeServer(room, now = Date.now()) {
  const boss = bossState.get(room.name);

  if (
    !boss ||
    !boss.alive ||
    room.level !== CONFIG.boss.enabledInLevel ||
    room.paused
  ) {
    return;
  }

  const bossSpeed =
    boss.currentSpeed ||
    CONFIG.speed?.boss?.normal ||
    CONFIG.boss.baseSpeedMs ||
    CONFIG.timings.gameLoop;

  if (now - boss.lastMoveTime < bossSpeed) {
    return;
  }

  boss.lastMoveTime = now;

  const head = boss.snake[0];
  const bestTarget = getBestBossTargetServer(room);

  if (!bestTarget) {
    if (!boss.patrolTarget) {
      boss.patrolTarget = getRandomPatrolTargetServer();
    }

    const patrolHead = boss.snake[0];
    const patrolDist =
      Math.abs(patrolHead.x - boss.patrolTarget.x) +
      Math.abs(patrolHead.y - boss.patrolTarget.y);

    if (patrolDist < 2) {
      boss.patrolTarget = getRandomPatrolTargetServer();
    }

    const newDir = getBossPatrolDirectionServer(patrolHead, boss.patrolTarget, room);
    if (newDir) {
      boss.nextDir = newDir;
    }
  } else {
    const distance =
      Math.abs(head.x - bestTarget.x) +
      Math.abs(head.y - bestTarget.y);

    if (distance < 20) {
      const newDir = getBossChaseDirectionWithAvoidanceServer(head, bestTarget, room);
      if (newDir) {
        boss.nextDir = newDir;
      }
      boss.patrolTarget = null;
    } else {
      if (!boss.patrolTarget) {
        boss.patrolTarget = getRandomPatrolTargetServer();
      }

      const patrolHead = boss.snake[0];
      const patrolDist =
        Math.abs(patrolHead.x - boss.patrolTarget.x) +
        Math.abs(patrolHead.y - boss.patrolTarget.y);

      if (patrolDist < 2) {
        boss.patrolTarget = getRandomPatrolTargetServer();
      }

      const newDir = getBossPatrolDirectionServer(patrolHead, boss.patrolTarget, room);
      if (newDir) {
        boss.nextDir = newDir;
      }
    }
  }

  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
  if (boss.nextDir && boss.nextDir !== opposite[boss.dir]) {
    boss.dir = boss.nextDir;
  }

  const newHead = { ...head };
  if (boss.dir === 'up') newHead.y--;
  if (boss.dir === 'down') newHead.y++;
  if (boss.dir === 'left') newHead.x--;
  if (boss.dir === 'right') newHead.x++;

  if (
    newHead.x < 0 ||
    newHead.x >= WIDTH ||
    newHead.y < 0 ||
    newHead.y >= HEIGHT
  ) {
    const safeDir = findAnySafeDirectionServer(head, room);
    if (safeDir) {
      boss.dir = safeDir;
      newHead.x = head.x;
      newHead.y = head.y;
      if (boss.dir === 'up') newHead.y--;
      if (boss.dir === 'down') newHead.y++;
      if (boss.dir === 'left') newHead.x--;
      if (boss.dir === 'right') newHead.x++;
    } else {
      boss.alive = false;
      bossState.delete(room.name);
      broadcastRoom(room, {
        type: 'bossDied'
      });
      return;
    }
  }

  boss.snake.unshift(newHead);

  if (boss.grow > 0) {
    boss.grow--;
  } else {
    boss.snake.pop();
  }
}

function createLevelObstaclesForLevel(level) {
  const result = [];
  const middleY = Math.floor(HEIGHT / 2);
  const middleX = Math.floor(WIDTH / 2);

  if (level === 2 || level === 3) {
    for (let x = 18; x < WIDTH - 18; x++) {
      result.push({ x, y: middleY });
    }
  }

  if (level === 3) {
    for (let y = 10; y < HEIGHT - 10; y++) {
      result.push({ x: middleX, y });
    }
  }

  if (level === 4) {
    const horizontalGapStart = Math.floor(WIDTH / 2) - 4;
    const horizontalGapEnd = Math.floor(WIDTH / 2) + 4;
    const verticalGapStart = Math.floor(HEIGHT / 2) - 4;
    const verticalGapEnd = Math.floor(HEIGHT / 2) + 4;

    for (let x = 12; x < WIDTH - 12; x++) {
      if (x < horizontalGapStart || x > horizontalGapEnd) {
        result.push({ x, y: middleY - 10 });
        result.push({ x, y: middleY + 10 });
      }
    }

    for (let y = 12; y < HEIGHT - 12; y++) {
      if (y < verticalGapStart || y > verticalGapEnd) {
        result.push({ x: middleX - 14, y });
        result.push({ x: middleX + 14, y });
      }
    }
  }

  if (level === 5) {
    const rows = [
      { y: 15, start: 12, end: WIDTH - 14, openingSide: 'right' },
      { y: 30, start: 14, end: WIDTH - 12, openingSide: 'left' },
      { y: 45, start: 12, end: WIDTH - 14, openingSide: 'right' },
      { y: 60, start: 14, end: WIDTH - 12, openingSide: 'left' }
    ];

    for (const row of rows) {
      for (let x = row.start; x <= row.end; x++) {
        const hasOpening =
          row.openingSide === 'left'
            ? x < row.start + 8
            : x > row.end - 8;

        if (!hasOpening) {
          result.push({ x, y: row.y });
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

          if (openLeft || openRight || openTop || openBottom) {
            continue;
          }

          result.push({ x, y });
        }
      }
    };

    const midX = Math.floor(WIDTH / 2);
    const midY = Math.floor(HEIGHT / 2);

    addBox(18, 18, 31, 30, ['left', 'right']);
    addBox(40, 18, 53, 30, ['left', 'right']);
    addBox(18, 48, 31, 60, ['left', 'right']);
    addBox(40, 48, 53, 60, ['left', 'right']);

    addBox(0, 0, 12, 12, ['bottom', 'right']);
    addBox(WIDTH - 13, 0, WIDTH - 1, 12, ['bottom', 'left']);
    addBox(0, HEIGHT - 13, 12, HEIGHT - 1, ['top', 'right']);
    addBox(WIDTH - 13, HEIGHT - 13, WIDTH - 1, HEIGHT - 1, ['top', 'left']);

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

function startPlayerDeath(room, player) {
  if (!player.alive || player.dying) {
    return;
  }

  player.dying = true;

  broadcastRoom(room, {
    type: 'state',
    players: publicPlayers(room),
    food: room.food,
    paused: room.paused,
    level: room.level,
    boss: getPublicBoss(room)
  });

  player.deathTimer = setTimeout(() => {
    player.alive = false;
    player.dying = false;
    player.deathTimer = null;
    player.snake = [];

    broadcastRoom(room, {
      type: 'state',
      players: publicPlayers(room),
      food: room.food,
      paused: room.paused,
      level: room.level,
      boss: getPublicBoss(room)
    });
  }, 1000);
}

function movePlayer(room, player, now) {
  if (!player.alive || player.dying) {
  return;
}

  const playerSpeed =
    player.moveInterval ||
    CONFIG.speed?.player ||
    CONFIG.timings.gameLoop;

  if (now - player.lastMoveTime < playerSpeed) {
    return;
  }

  player.lastMoveTime = now;

  const opposite = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left'
  };

  if (player.nextDir && player.nextDir !== opposite[player.dir]) {
    player.dir = player.nextDir;
  }

  const head = {
    ...player.snake[0]
  };

  if (player.dir === 'up') head.y--;
  if (player.dir === 'down') head.y++;
  if (player.dir === 'left') head.x--;
  if (player.dir === 'right') head.x++;

  const outside =
    head.x < 0 ||
    head.x >= WIDTH ||
    head.y < 0 ||
    head.y >= HEIGHT;

  const levelObstacles = createLevelObstaclesForLevel(room.level || 1);

  const hitsObstacle = levelObstacles.some((block) =>
    block.x === head.x &&
    block.y === head.y
  );

  const hitsSelf = player.snake
    .slice(1)
    .some((segment) =>
      segment.x === head.x &&
      segment.y === head.y
    );

  const hitsOther = Array.from(room.players.values())
    .filter((other) =>
      other.id !== player.id &&
      other.alive
    )
    .some((other) =>
      other.snake.some((segment) =>
        segment.x === head.x &&
        segment.y === head.y
      )
    );

if (outside || hitsObstacle || hitsSelf || hitsOther) {
  startPlayerDeath(room, player);
  return;
}

  player.snake.unshift(head);

  const foodIndex = room.food.findIndex((apple) =>
    head.x === apple.x &&
    head.y === apple.y
  );

  if (foodIndex !== -1) {
    const eatenApple = room.food[foodIndex];

    player.score++;

    const growth = CONFIG.foodGrowth || { red: 2, blue: 8, green: 15 };
    if (eatenApple.type === 'blue') {
      player.grow += growth.blue;
    } else if (eatenApple.type === 'green') {
      player.grow += growth.green;
    } else {
      player.grow += growth.red;
    }

    if (eatenApple.type === 'red') {
      const replacementFood = randomFood('red', room);

if (replacementFood) {
  room.food[foodIndex] = replacementFood;
} else {
  room.food.splice(foodIndex, 1);
}
    } else {
      room.food.splice(foodIndex, 1);
    }
  }

  if (player.grow > 0) {
    player.grow--;
  } else {
    player.snake.pop();
  }
}


function startPlayerDeath(room, player) {
  if (!player.alive || player.dying) {
    return;
  }

  player.dying = true;

  broadcastRoom(room, {
    type: 'state',
    players: publicPlayers(room),
    food: room.food,
    paused: room.paused,
    level: room.level,
    boss: getPublicBoss(room)
  });

  player.deathTimer = setTimeout(() => {
    player.alive = false;
    player.dying = false;
    player.deathTimer = null;
    player.snake = [];

    broadcastRoom(room, {
      type: 'state',
      players: publicPlayers(room),
      food: room.food,
      paused: room.paused,
      level: room.level,
      boss: getPublicBoss(room)
    });

    // Check if all players are dead
    checkAllPlayersDead(room);
  }, 1000);
}

function checkAllPlayersDead(room) {
  if (!room.started || room.winnerShown) {
    return;
  }

  const alivePlayers = Array.from(room.players.values())
    .filter((player) =>
      player.alive &&
      player.snake &&
      player.snake.length > 0
    );

  if (alivePlayers.length === 0) {
    // All players dead - end game immediately
    room.winnerShown = true;
    room.paused = true;

    clearTimeout(room.countdownTimer);
    room.countdownTimer = null;

    stopFoodTimers(room);

    broadcastRoom(room, {
      type: 'noWinner',
      winnerName: 'NO WINNER'
    });
  }
}

function gameStep(room) {
  if (
    !room.started ||
    room.paused ||
    room.winnerShown
  ) {
    return;
  }

  // For Level 6, also check countdown timing
  if (room.level === 6 && (!room.startTime || Date.now() < room.startTime)) {
    return;
  }

  const now = Date.now();

  for (const player of room.players.values()) {
    movePlayer(room, player, now);
  }

  if (room.level === CONFIG.boss.enabledInLevel) {
    moveBossSnakeServer(room, now);
    checkBossPlayerCollision(room);
  }

  broadcastRoom(room, {
    type: 'state',
    players: publicPlayers(room),
    food: room.food,
    paused: room.paused,
    level: room.level,
    boss: getPublicBoss(room)
  });
}

function removePlayer(player) {
  const room = getRoom(player.roomName);

  if (!room) {
    return;
  }

  room.players.delete(player.id);

  if (room.players.size === 0) {
    stopFoodTimers(room);

    clearTimeout(room.introTimer);
    clearTimeout(room.countdownTimer);

    bossState.delete(room.name);
    rooms.delete(room.name);
    return;
  }

  if (room.hostId === player.id) {
    const newHost = room.players.values().next().value;

    if (newHost) {
      room.hostId = newHost.id;

      for (const other of room.players.values()) {
        other.host = other.id === room.hostId;

        if (other.host) {
          other.ready = true;
        }
      }
    }
  }

  broadcastRoomState(room);
}

wss.on('connection', (ws) => {
  const client = {
    ws,
    player: null
  };

  send(ws, {
    type: 'connected'
  });

  ws.on('message', (rawMessage) => {
    let data;

    try {
      data = JSON.parse(rawMessage.toString());
    } catch (error) {
      console.error('Invalid JSON from client:', rawMessage.toString());

      send(ws, {
        type: 'error',
        message: 'Invalid JSON message.'
      });

      return;
    }

    try {
      if (!data || typeof data.type !== 'string') {
        send(ws, {
          type: 'error',
          message: 'Message type is required.'
        });

        return;
      }

      if (data.type === 'createRoom') {
        const name = cleanText(data.name, 'Player');
        const roomName = normalizeRoomName(data.room);

        if (getRoom(roomName)) {
          send(ws, {
            type: 'error',
            message: 'That room already exists.'
          });

          return;
        }

        const player = createPlayer(ws, name, true);
        const room = createRoom(roomName, player);

        client.player = player;

        send(ws, {
          type: 'roomJoined',
          room: room.name,
          host: true,
          playerId: player.id
        });

        broadcastRoomState(room);
        return;
      }

      if (data.type === 'listRooms') {
        sendRoomList(ws);
        return;
      }

      if (data.type === 'joinRoom') {
        const name = cleanText(data.name, 'Player');
        const roomName = normalizeRoomName(data.room);
        const room = getRoom(roomName);

        if (!room) {
          send(ws, {
            type: 'error',
            message: 'Room not found.'
          });

          return;
        }

        if (room.started) {
          send(ws, {
            type: 'error',
            message: 'That game has already started.'
          });

          return;
        }

        if (room.players.size >= MAX_PLAYERS) {
          send(ws, {
            type: 'error',
            message: 'That room is full. Maximum is four players.'
          });

          return;
        }

        const player = createPlayer(ws, name, false);

        player.ready = false;
        player.roomName = room.name;

        room.players.set(player.id, player);
        client.player = player;

        send(ws, {
          type: 'roomJoined',
          room: room.name,
          host: false,
          playerId: player.id
        });

        broadcastRoomState(room);
        return;
      }

      if (data.type === 'selectLevel') {
        const player = client.player;
        const room = player && getRoom(player.roomName);

        if (!room || room.started || !player.host) {
          return;
        }

        const level = Number(data.level);

        if (![1, 2, 3, 4, 5, 6].includes(level)) {
          return;
        }

        room.level = level;
        broadcastRoomState(room);
        return;
      }

      if (data.type === 'ready') {
        const player = client.player;
        const room = player && getRoom(player.roomName);

        if (!room || player.host) {
          return;
        }

        player.ready = !player.ready;
        broadcastRoomState(room);
        return;
      }

      if (data.type === 'startRoom') {
        const player = client.player;
        const room = player && getRoom(player.roomName);

        if (!room || !player.host) {
          return;
        }

        if (!allJoinersReady(room)) {
          send(ws, {
            type: 'error',
            message: 'Every player must be ready before starting.'
          });

          return;
        }

        startRoom(room);
        return;
      }

      if (data.type === 'pause') {
        const player = client.player;
        const room = player && getRoom(player.roomName);

        if (!room || !room.started || !player.host) {
          return;
        }

        room.paused = !room.paused;

                broadcastRoom(room, {
          type: 'state',
          players: publicPlayers(room),
          food: room.food,
          paused: room.paused,
          level: room.level,
          boss: getPublicBoss(room)
        });

        return;
      }

      if (data.type === 'restart') {
  const player = client.player;
  const room = player && getRoom(player.roomName);

  if (!room || !room.started || !player.host) {
    return;
  }

  stopFoodTimers(room);

  clearTimeout(room.introTimer);
  clearTimeout(room.countdownTimer);

  room.introTimer = null;
  room.countdownTimer = null;
  room.startTime = 0;
  room.countdownEndsAt = 0;
  room.winnerShown = false;

  bossState.delete(room.name);

  resetRoomGame(room);

  if (room.level === CONFIG.boss.enabledInLevel) {
    bossState.set(
      room.name,
      createBossSnakeServer(room)
    );
  }

  startFoodTimers(room);

  const boss = bossState.get(room.name);

  // Send gameStart again to show intro message
  broadcastRoom(room, {
    type: 'gameStart',
    width: WIDTH,
    height: HEIGHT,
    size: SIZE,
    players: publicPlayers(room),
    food: room.food,
    paused: true,
    level: room.level,
    boss: boss
      ? {
          snake: boss.snake,
          alive: boss.alive,
          rageActive: boss.rageActive
        }
      : null,
    introMessage: room.level === 6 ? 'SNAKE SURVIVAL LAST SNAKE ALIVE<br>AVOID BOSS SNAKE' : '',
    introDuration: 4000
  });

  // Start intro timer again
  clearTimeout(room.introTimer);

  room.introTimer = setTimeout(() => {
    if (!room.started) {
      return;
    }

    room.paused = false;

    // Only start countdown in Level 6
    if (room.level === 6) {
      room.startTime = Date.now();
      room.countdownEndsAt = room.startTime + 60000;

      broadcastRoom(room, {
        type: 'countdownStart',
        countdownEndsAt: room.countdownEndsAt
      });

      clearTimeout(room.countdownTimer);

      room.countdownTimer = setTimeout(() => {
        finishRoomCountdown(room);
      }, 60000);
    }
  }, 4000);

  return;
}

      if (data.type === 'dir') {
        const player = client.player;
        const room = player && getRoom(player.roomName);

        if (!room || !room.started || room.paused) {
          return;
        }

        setDirection(player, data.dir);
      }
      if (data.type === 'dir') {
  const player = client.player;
  const room = player && getRoom(player.roomName);

  if (!room || !room.started || room.paused) {
    return;
  }

  setDirection(player, data.dir);
}

// Winner and noWinner messages don't need client handling - they're server-to-client only
    } catch (error) {
      console.error('Server game error:', error);

      send(ws, {
        type: 'error',
        message: 'Server could not process that action.'
      });
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  ws.on('close', () => {
    if (client.player) {
      removePlayer(client.player);
    }
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    gameStep(room);
  }
}, TICK);

server.listen(PORT, () => {
  console.log(`Snake server listening on port ${PORT}`);
});