// foodClient.js - Client-side food logic

const CONFIG = require('./config.js');

let WIDTH = 72;
let HEIGHT = 80;
let createLevelObstaclesForLevel = null;

function setupFoodClientModule({
  width,
  height,
  obstaclesFn
}) {
  WIDTH = width;
  HEIGHT = height;
  createLevelObstaclesForLevel = obstaclesFn;
}

function getRandomFoodPosition(excludePositions = []) {
  const obstacles = createLevelObstaclesForLevel ? createLevelObstaclesForLevel(1) : [];
  const blocked = new Set();

  for (const obstacle of obstacles) {
    blocked.add(`${obstacle.x},${obstacle.y}`);
  }

  for (const pos of excludePositions) {
    blocked.add(`${pos.x},${pos.y}`);
  }

  let attempts = 0;
  const maxAttempts = 100;

  while (attempts < maxAttempts) {
    const x = Math.floor(Math.random() * (WIDTH - 4)) + 2;
    const y = Math.floor(Math.random() * (HEIGHT - 4)) + 2;

    if (!blocked.has(`${x},${y}`)) {
      return { x, y };
    }

    attempts++;
  }

  return null;
}

function applyFoodEffect(player, foodType) {
  if (!player) {
    return;
  }

  const effects = CONFIG.foodEffects || {
    red: { score: 1, grow: 2 },
    blue: { score: 0, grow: 8, speed: 0.8 },
    green: { score: 0, grow: 15, speed: 0.6 }
  };

  const effect = effects[foodType] || effects.red;

  if (effect.score) {
    player.score += effect.score;
  }

  if (effect.grow) {
    player.grow += effect.grow;
  }

  if (effect.speed) {
    player.moveInterval = Math.floor((player.moveInterval || 120) * effect.speed);
  }
}

module.exports = {
  setupFoodClientModule,
  getRandomFoodPosition,
  applyFoodEffect
};