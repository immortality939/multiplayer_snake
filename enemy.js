// enemy.js - Server-side enemy snake logic
const CONFIG = require('./config.js');

// These will be set by server.js
let WIDTH = 72;
let HEIGHT = 80;
let createLevelObstaclesForLevel = null;
let startPlayerDeathFn = null;
let broadcastRoomFn = null;
let publicPlayersFn = null;
let getPublicBossFn = null;

function setupEnemyModule({
  width,
  height,
  obstaclesFn,
  startPlayerDeath,
  broadcastFn,
  publicPlayers,
  getPublicBoss
}) {
  WIDTH = width;
  HEIGHT = height;
  createLevelObstaclesForLevel = obstaclesFn;
  startPlayerDeathFn = startPlayerDeath;
  broadcastRoomFn = broadcastFn;
  publicPlayersFn = publicPlayers;
  getPublicBossFn = getPublicBoss;
}

function createEnemySnakeServer(room) {
  const margin = 12;

  const spawns = [
    { x: margin, y: margin },
    { x: WIDTH - margin - 1, y: margin },
    { x: WIDTH - margin - 1, y: HEIGHT - margin - 1 },
    { x: margin, y: HEIGHT - margin - 1 }
  ];

  const spawn = spawns[room.level % spawns.length];

  return {
    snake: [
      { ...spawn },
      { x: spawn.x + 1, y: spawn.y },
      { x: spawn.x + 2, y: spawn.y }
    ],
    dir: 'right',
    nextDir: 'right',
    alive: true,
    grow: 0,
    lastMoveTime: 0,
    patrolTarget: null,
    baseSpeed: CONFIG.speed?.enemy?.normal || 140,
    currentSpeed: CONFIG.speed?.enemy?.normal || 140
  };
}

function getBestEnemyTarget(room) {
  const boss = require('./server.js').bossStateForFood?.get(room.name);

  const allThreats = [];

  for (const player of room.players.values()) {
    if (!player.alive || !player.snake || !player.snake.length) {
      continue;
    }

    allThreats.push({
      x: player.snake[0].x,
      y: player.snake[0].y,
      isBoss: false
    });
  }

  if (boss && boss.alive && boss.snake && boss.snake.length) {
    allThreats.push({
      x: boss.snake[0].x,
      y: boss.snake[0].y,
      isBoss: true
    });
  }

  if (allThreats.length === 0) {
    return null;
  }

  const enemyHead = room.enemy?.snake?.[0];

  if (!enemyHead) {
    return allThreats[0];
  }

  let closest = null;
  let minDist = Infinity;

  for (const threat of allThreats) {
    const dist =
      Math.abs(enemyHead.x - threat.x) +
      Math.abs(enemyHead.y - threat.y);

    if (dist < minDist) {
      minDist = dist;
      closest = threat;
    }
  }

  return closest;
}

function getRandomPatrolTarget() {
  return {
    x: Math.floor(Math.random() * (WIDTH - 16)) + 8,
    y: Math.floor(Math.random() * (HEIGHT - 16)) + 8
  };
}

function getEnemyPatrolDirection(head, patrolTarget, room) {
  const obstacles = createLevelObstaclesForLevel(room.level || 1);
  const blocked = new Set();

  for (const obstacle of obstacles) {
    blocked.add(`${obstacle.x},${obstacle.y}`);
  }

  if (room.enemy && room.enemy.snake) {
    for (const segment of room.enemy.snake) {
      blocked.add(`${segment.x},${segment.y}`);
    }
  }

  for (const player of room.players.values()) {
    if (player.alive && player.snake) {
      for (const segment of player.snake) {
        blocked.add(`${segment.x},${segment.y}`);
      }
    }
  }

  const boss = require('./server.js').bossStateForFood?.get(room.name);

  if (boss && boss.alive && boss.snake) {
    for (const segment of boss.snake) {
      blocked.add(`${segment.x},${segment.y}`);
    }
  }

  const dx = patrolTarget.x - head.x;
  const dy = patrolTarget.y - head.y;

  const candidates = [];

  if (dx > 0) candidates.push('right');
  else if (dx < 0) candidates.push('left');

  if (dy > 0) candidates.push('down');
  else if (dy < 0) candidates.push('up');

  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };

  for (const dir of candidates) {
    if (dir === opposite[room.enemy.dir]) {
      continue;
    }

    const next = { ...head };

    if (dir === 'up') next.y--;
    else if (dir === 'down') next.y++;
    else if (dir === 'left') next.x--;
    else if (dir === 'right') next.x++;

    if (
      next.x < 0 ||
      next.x >= WIDTH ||
      next.y < 0 ||
      next.y >= HEIGHT ||
      blocked.has(`${next.x},${next.y}`)
    ) {
      continue;
    }

    return dir;
  }

  const allDirs = ['up', 'down', 'left', 'right'];

  for (const dir of allDirs) {
    if (dir === opposite[room.enemy.dir]) {
      continue;
    }

    const next = { ...head };

    if (dir === 'up') next.y--;
    else if (dir === 'down') next.y++;
    else if (dir === 'left') next.x--;
    else if (dir === 'right') next.x++;

    if (
      next.x < 0 ||
      next.x >= WIDTH ||
      next.y < 0 ||
      next.y >= HEIGHT ||
      blocked.has(`${next.x},${next.y}`)
    ) {
      continue;
    }

    return dir;
  }

  return null;
}

function getEnemyChaseDirectionWithAvoidance(head, target, room) {
  const obstacles = createLevelObstaclesForLevel(room.level || 1);
  const blocked = new Set();

  for (const obstacle of obstacles) {
    blocked.add(`${obstacle.x},${obstacle.y}`);
  }

  if (room.enemy && room.enemy.snake) {
    for (const segment of room.enemy.snake) {
      blocked.add(`${segment.x},${segment.y}`);
    }
  }

  for (const player of room.players.values()) {
    if (player.alive && player.snake) {
      for (const segment of player.snake) {
        blocked.add(`${segment.x},${segment.y}`);
      }
    }
  }

  const boss = require('./server.js').bossStateForFood?.get(room.name);

  if (boss && boss.alive && boss.snake) {
    for (const segment of boss.snake) {
      blocked.add(`${segment.x},${segment.y}`);
    }
  }

  const dx = target.x - head.x;
  const dy = target.y - head.y;

  const primary =
    Math.abs(dx) > Math.abs(dy)
      ? dx > 0 ? 'right' : 'left'
      : dy > 0 ? 'down' : 'up';

  const secondary =
    Math.abs(dx) > Math.abs(dy)
      ? dy > 0 ? 'down' : 'up'
      : dx > 0 ? 'right' : 'left';

  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };

  const tryDir = (dir) => {
    if (dir === opposite[room.enemy.dir]) {
      return false;
    }

    const next = { ...head };

    if (dir === 'up') next.y--;
    else if (dir === 'down') next.y++;
    else if (dir === 'left') next.x--;
    else if (dir === 'right') next.x++;

    if (
      next.x < 0 ||
      next.x >= WIDTH ||
      next.y < 0 ||
      next.y >= HEIGHT ||
      blocked.has(`${next.x},${next.y}`)
    ) {
      return false;
    }

    return true;
  };

  if (tryDir(primary)) {
    return primary;
  }

  if (tryDir(secondary)) {
    return secondary;
  }

  const allDirs = ['up', 'down', 'left', 'right'];

  for (const dir of allDirs) {
    if (tryDir(dir)) {
      return dir;
    }
  }

  return null;
}

function findAnySafeDirection(head, room) {
  const obstacles = createLevelObstaclesForLevel(room.level || 1);
  const blocked = new Set();

  for (const obstacle of obstacles) {
    blocked.add(`${obstacle.x},${obstacle.y}`);
  }

  if (room.enemy && room.enemy.snake) {
    for (const segment of room.enemy.snake) {
      blocked.add(`${segment.x},${segment.y}`);
    }
  }

  for (const player of room.players.values()) {
    if (player.alive && player.snake) {
      for (const segment of player.snake) {
        blocked.add(`${segment.x},${segment.y}`);
      }
    }
  }

  const boss = require('./server.js').bossStateForFood?.get(room.name);

  if (boss && boss.alive && boss.snake) {
    for (const segment of boss.snake) {
      blocked.add(`${segment.x},${segment.y}`);
    }
  }

  const allDirs = ['up', 'down', 'left', 'right'];
  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };

  for (const dir of allDirs) {
    if (dir === opposite[room.enemy.dir]) {
      continue;
    }

    const next = { ...head };

    if (dir === 'up') next.y--;
    else if (dir === 'down') next.y++;
    else if (dir === 'left') next.x--;
    else if (dir === 'right') next.x++;

    if (
      next.x >= 0 &&
      next.x < WIDTH &&
      next.y >= 0 &&
      next.y < HEIGHT &&
      !blocked.has(`${next.x},${next.y}`)
    ) {
      return dir;
    }
  }

  return null;
}

function checkEnemyPlayerCollision(room) {
  const enemy = room.enemy;

  if (!enemy || !enemy.alive || !enemy.snake || !enemy.snake.length) {
    return;
  }

  for (const enemyPart of enemy.snake) {
    for (const player of room.players.values()) {
      if (!player.alive || !player.snake || !player.snake.length) {
        continue;
      }

      let hitIndex = -1;

      for (let i = 0; i < player.snake.length; i++) {
        const part = player.snake[i];

        if (part.x === enemyPart.x && part.y === enemyPart.y) {
          hitIndex = i;
          break;
        }
      }

      if (hitIndex !== -1) {
        const eatenLength = player.snake.length - hitIndex;
        enemy.grow += eatenLength;

        if (hitIndex === 0) {
          player.alive = false;
          player.snake = [];

          const checkAllDead = require('./server.js').checkAllPlayersDeadForEnemy;

          if (checkAllDead) {
            checkAllDead(room);
          }
        } else {
          player.snake = player.snake.slice(0, hitIndex);
          player.score = Math.max(0, player.score - 5);
        }

        break;
      }
    }
  }
}

function moveEnemySnake(room, now = Date.now()) {
  const enemy = room.enemy;

  if (
    !enemy ||
    !enemy.alive ||
    room.paused ||
    room.level !== CONFIG.enemy?.enabledInLevel
  ) {
    return;
  }

  const enemySpeed =
    enemy.currentSpeed ||
    CONFIG.speed?.enemy?.normal ||
    140;

  if (now - enemy.lastMoveTime < enemySpeed) {
    return;
  }

  enemy.lastMoveTime = now;

  const head = enemy.snake[0];
  const bestTarget = getBestEnemyTarget(room);

  if (!bestTarget) {
    if (!enemy.patrolTarget) {
      enemy.patrolTarget = getRandomPatrolTarget();
    }

    const patrolHead = enemy.snake[0];
    const patrolDist =
      Math.abs(patrolHead.x - enemy.patrolTarget.x) +
      Math.abs(patrolHead.y - enemy.patrolTarget.y);

    if (patrolDist < 2) {
      enemy.patrolTarget = getRandomPatrolTarget();
    }

    const newDir = getEnemyPatrolDirection(patrolHead, enemy.patrolTarget, room);

    if (newDir) {
      enemy.nextDir = newDir;
    }
  } else {
    const distance =
      Math.abs(head.x - bestTarget.x) +
      Math.abs(head.y - bestTarget.y);

    if (distance < 20) {
      const newDir = getEnemyChaseDirectionWithAvoidance(head, bestTarget, room);

      if (newDir) {
        enemy.nextDir = newDir;
      }

      enemy.patrolTarget = null;
    } else {
      if (!enemy.patrolTarget) {
        enemy.patrolTarget = getRandomPatrolTarget();
      }

      const patrolHead = enemy.snake[0];
      const patrolDist =
        Math.abs(patrolHead.x - enemy.patrolTarget.x) +
        Math.abs(patrolHead.y - enemy.patrolTarget.y);

      if (patrolDist < 2) {
        enemy.patrolTarget = getRandomPatrolTarget();
      }

      const newDir = getEnemyPatrolDirection(patrolHead, enemy.patrolTarget, room);

      if (newDir) {
        enemy.nextDir = newDir;
      }
    }
  }

  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };

  if (enemy.nextDir && enemy.nextDir !== opposite[enemy.dir]) {
    enemy.dir = enemy.nextDir;
  }

  const newHead = { ...head };

  if (enemy.dir === 'up') newHead.y--;
  if (enemy.dir === 'down') newHead.y++;
  if (enemy.dir === 'left') newHead.x--;
  if (enemy.dir === 'right') newHead.x++;

  if (
    newHead.x < 0 ||
    newHead.x >= WIDTH ||
    newHead.y < 0 ||
    newHead.y >= HEIGHT
  ) {
    const safeDir = findAnySafeDirection(head, room);

    if (safeDir) {
      enemy.dir = safeDir;
      newHead.x = head.x;
      newHead.y = head.y;

      if (enemy.dir === 'up') newHead.y--;
      else if (enemy.dir === 'down') newHead.y++;
      else if (enemy.dir === 'left') newHead.x--;
      else if (enemy.dir === 'right') newHead.x++;
    } else {
      enemy.alive = false;
      room.enemy = null;

      broadcastRoomFn(room, {
        type: 'enemyDied'
      });

      return;
    }
  }

  enemy.snake.unshift(newHead);

  if (enemy.grow > 0) {
    enemy.grow--;
  } else {
    enemy.snake.pop();
  }
}

module.exports = {
  setupEnemyModule,
  createEnemySnakeServer,
  moveEnemySnake,
  checkEnemyPlayerCollision
};