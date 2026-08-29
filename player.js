// player.js - Server-side player snake logic
const CONFIG = require('./config.js');

// These will be set by server.js
let WIDTH = 72;
let HEIGHT = 72;
let createLevelObstaclesForLevel = null;
let startPlayerDeathFn = null;

function setupPlayerModule({
  width,
  height,
  obstaclesFn,
  startPlayerDeath
}) {
  WIDTH = width;
  HEIGHT = height;
  createLevelObstaclesForLevel = obstaclesFn;
  startPlayerDeathFn = startPlayerDeath;
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
    startPlayerDeathFn(room, player);
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
      const replacementFood = require('./food.js').randomFood('red', room);

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

module.exports = {
  setupPlayerModule,
  setDirection,
  movePlayer
};