// food.js - Server-side food (apple) logic
const CONFIG = require('./config.js');

// These will be set by server.js
let WIDTH = 72;
let HEIGHT = 80;
let createLevelObstaclesForLevel = null;

function setupFoodModule({
  width,
  height,
  obstaclesFn
}) {
  WIDTH = width;
  HEIGHT = height;
  createLevelObstaclesForLevel = obstaclesFn;
}

function randomFood(type = 'red', room = null) {
  const obstacles = createLevelObstaclesForLevel(room?.level || 1);

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

    const bossState = require('./server.js').bossStateForFood;
    const boss = bossState?.get(room.name);

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

module.exports = {
  setupFoodModule,
  randomFood
};