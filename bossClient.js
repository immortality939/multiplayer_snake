// bossClient.js - Client-side boss snake logic

const CONFIG = require('./config.js');

let WIDTH = 72;
let HEIGHT = 80;
let createLevelObstaclesForLevel = null;

function setupBossClientModule({
  width,
  height,
  obstaclesFn
}) {
  WIDTH = width;
  HEIGHT = height;
  createLevelObstaclesForLevel = obstaclesFn;
}

function createBossSnake(room) {
  const margin = 15;

  const boss = {
    snake: [
      { x: Math.floor(WIDTH / 2), y: margin },
      { x: Math.floor(WIDTH / 2) + 1, y: margin },
      { x: Math.floor(WIDTH / 2) + 2, y: margin },
      { x: Math.floor(WIDTH / 2) + 3, y: margin },
      { x: Math.floor(WIDTH / 2) + 4, y: margin }
    ],
    dir: 'right',
    nextDir: 'right',
    alive: true,
    grow: 0,
    lastMoveTime: 0,
    baseSpeed: CONFIG.boss?.baseSpeedMs || 120,
    currentSpeed: CONFIG.boss?.baseSpeedMs || 120,
    rageActive: false,
    rageTimer: null,
    rageEndTimer: null
  };

  return boss;
}

function moveBossSnakeClient(boss, now = Date.now()) {
  if (!boss || !boss.alive || !boss.snake || !boss.snake.length) {
    return;
  }

  const bossSpeed = boss.currentSpeed || CONFIG.boss?.baseSpeedMs || 120;

  if (now - boss.lastMoveTime < bossSpeed) {
    return;
  }

  boss.lastMoveTime = now;

  // Simple patrol pattern for client-side prediction
  const head = boss.snake[0];

  // Change direction at edges
  if (boss.dir === 'right' && head.x >= WIDTH - 2) {
    boss.nextDir = 'down';
  } else if (boss.dir === 'down' && head.y >= HEIGHT - 2) {
    boss.nextDir = 'left';
  } else if (boss.dir === 'left' && head.x <= 1) {
    boss.nextDir = 'down';
  } else if (boss.dir === 'down' && head.y >= HEIGHT - 2) {
    boss.nextDir = 'right';
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

  boss.snake.unshift(newHead);

  if (boss.grow > 0) {
    boss.grow--;
  } else {
    boss.snake.pop();
  }
}

module.exports = {
  setupBossClientModule,
  createBossSnake,
  moveBossSnakeClient
};