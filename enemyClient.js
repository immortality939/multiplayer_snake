// enemyClient.js - Client-side enemy snake logic

const CONFIG = require('./config.js');

let WIDTH = 72;
let HEIGHT = 80;
let createLevelObstaclesForLevel = null;

function setupEnemyClientModule({
  width,
  height,
  obstaclesFn
}) {
  WIDTH = width;
  HEIGHT = height;
  createLevelObstaclesForLevel = obstaclesFn;
}

function createEnemySnake(room) {
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

function moveEnemySnakeClient(enemy, now = Date.now()) {
  if (!enemy || !enemy.alive || !enemy.snake || !enemy.snake.length) {
    return;
  }

  const enemySpeed = enemy.currentSpeed || CONFIG.speed?.enemy?.normal || 140;

  if (now - enemy.lastMoveTime < enemySpeed) {
    return;
  }

  enemy.lastMoveTime = now;

  // Simple patrol pattern for client-side prediction
  const head = enemy.snake[0];

  // Change direction at edges
  if (enemy.dir === 'right' && head.x >= WIDTH - 2) {
    enemy.nextDir = 'down';
  } else if (enemy.dir === 'down' && head.y >= HEIGHT - 2) {
    enemy.nextDir = 'left';
  } else if (enemy.dir === 'left' && head.x <= 1) {
    enemy.nextDir = 'down';
  } else if (enemy.dir === 'down' && head.y >= HEIGHT - 2) {
    enemy.nextDir = 'right';
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

  enemy.snake.unshift(newHead);

  if (enemy.grow > 0) {
    enemy.grow--;
  } else {
    enemy.snake.pop();
  }
}

module.exports = {
  setupEnemyClientModule,
  createEnemySnake,
  moveEnemySnakeClient
};