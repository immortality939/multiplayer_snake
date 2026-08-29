// boss.js - Server-side boss snake logic
const CONFIG = require('./config.js');

// These will be set by server.js
let WIDTH = 72;
let HEIGHT = 80;
let bossState = null;
let createLevelObstaclesForLevel = null;
let broadcastRoom = null;
let checkAllPlayersDead = null;

function setupBossModule({
  width,
  height,
  bossStateRef,
  obstaclesFn,
  broadcastFn,
  checkAllDeadFn
}) {
  WIDTH = width;
  HEIGHT = height;
  bossState = bossStateRef;
  createLevelObstaclesForLevel = obstaclesFn;
  broadcastRoom = broadcastFn;
  checkAllPlayersDead = checkAllDeadFn;
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
        const eatenLength = player.snake.length - hitIndex;
        boss.grow += eatenLength;

        if (hitIndex === 0) {
          player.alive = false;
          player.snake = [];
          checkAllPlayersDead(room);
        } else {
          player.snake = player.snake.slice(0, hitIndex);
          player.score = Math.max(0, player.score - 5);
        }

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

module.exports = {
  setupBossModule,
  createBossSnakeServer,
  moveBossSnakeServer,
  checkBossPlayerCollision
};