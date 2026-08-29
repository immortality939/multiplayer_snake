// playerClient.js - Client-side player snake logic

const CONFIG = require('./config.js');

let WIDTH = 72;
let HEIGHT = 80;
let createLevelObstaclesForLevel = null;

function setupPlayerClientModule({
  width,
  height,
  obstaclesFn
}) {
  WIDTH = width;
  HEIGHT = height;
  createLevelObstaclesForLevel = obstaclesFn;
}

function createSnake(playerId, initialLen = 3) {
  const margin = 8;

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

function movePlayerSnake(player, now = Date.now()) {
  if (!player.alive || !player.snake || !player.snake.length) {
    return false;
  }

  const moveInterval = player.moveInterval || CONFIG.speed?.player || 120;

  if (now - player.lastMoveTime < moveInterval) {
    return false;
  }

  player.lastMoveTime = now;

  // Update direction
  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };

  if (player.nextDir && player.nextDir !== opposite[player.dir]) {
    player.dir = player.nextDir;
  }

  const head = player.snake[0];
  const newHead = { ...head };

  if (player.dir === 'up') newHead.y--;
  if (player.dir === 'down') newHead.y++;
  if (player.dir === 'left') newHead.x--;
  if (player.dir === 'right') newHead.x++;

  // Check wall collision
  if (
    newHead.x < 0 ||
    newHead.x >= WIDTH ||
    newHead.y < 0 ||
    newHead.y >= HEIGHT
  ) {
    return 'dead';
  }

  // Check obstacle collision
  const obstacles = createLevelObstaclesForLevel ? createLevelObstaclesForLevel(player.level || 1) : [];

  for (const obstacle of obstacles) {
    if (obstacle.x === newHead.x && obstacle.y === newHead.y) {
      return 'dead';
    }
  }

  // Check self collision
  for (let i = 0; i < player.snake.length - 1; i++) {
    const segment = player.snake[i];
    if (segment.x === newHead.x && segment.y === newHead.y) {
      return 'dead';
    }
  }

  // Move snake
  player.snake.unshift(newHead);

  if (player.grow > 0) {
    player.grow--;
  } else {
    player.snake.pop();
  }

  return true;
}

function checkPlayerFoodCollision(player, foodList) {
  if (!player.alive || !player.snake || !player.snake.length || !foodList || !foodList.length) {
    return null;
  }

  const head = player.snake[0];

  for (let i = 0; i < foodList.length; i++) {
    const food = foodList[i];

    if (food.x === head.x && food.y === head.y) {
      return { food, index: i };
    }
  }

  return null;
}

module.exports = {
  setupPlayerClientModule,
  createSnake,
  getSpawnDirection,
  movePlayerSnake,
  checkPlayerFoodCollision
};