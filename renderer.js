// renderer.js - Client-side rendering for Snake game

let canvas = null;
let ctx = null;
let cellSize = 20;
let width = 72;
let height = 80;

// Colors
const COLORS = {
  background: '#1a1a2e',
  grid: '#16213e',
  snake: ['#ff4d4d', '#4dd2ff', '#7dff4d', '#ffd24d'],
  food: {
    red: '#ff3333',
    blue: '#3333ff',
    green: '#33ff33'
  },
  boss: '#9b59b6',
  enemy: '#e67e22',
  obstacle: '#34495e',
  text: '#ffffff'
};

function setupRenderer(canvasElement, cellSizeVal, gridWidth, gridHeight) {
  canvas = canvasElement;
  ctx = canvas.getContext('2d');
  cellSize = cellSizeVal;
  width = gridWidth;
  height = gridHeight;

  canvas.width = width * cellSize;
  canvas.height = height * cellSize;
}

function clearCanvas() {
  if (!ctx) return;

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawGrid() {
  if (!ctx) return;

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;

  for (let x = 0; x <= width; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cellSize, 0);
    ctx.lineTo(x * cellSize, height * cellSize);
    ctx.stroke();
  }

  for (let y = 0; y <= height; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * cellSize);
    ctx.lineTo(width * cellSize, y * cellSize);
    ctx.stroke();
  }
}

function drawSnake(snake, colorIndex, isHeadDifferent = false) {
  if (!ctx || !snake || !snake.length) return;

  const color = COLORS.snake[colorIndex % COLORS.snake.length];

  for (let i = 0; i < snake.length; i++) {
    const segment = snake[i];
    const isHead = (i === 0);

    ctx.fillStyle = isHead && isHeadDifferent ? '#ffffff' : color;
    ctx.fillRect(
      segment.x * cellSize + 1,
      segment.y * cellSize + 1,
      cellSize - 2,
      cellSize - 2
    );

    if (isHead && isHeadDifferent) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        segment.x * cellSize + 1,
        segment.y * cellSize + 1,
        cellSize - 2,
        cellSize - 2
      );
    }
  }
}

function drawFood(foodList) {
  if (!ctx || !foodList || !foodList.length) return;

  for (const food of foodList) {
    const color = COLORS.food[food.type] || COLORS.food.red;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(
      food.x * cellSize + cellSize / 2,
      food.y * cellSize + cellSize / 2,
      cellSize / 2 - 2,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
}

function drawBoss(boss) {
  if (!ctx || !boss || !boss.snake || !boss.snake.length) return;

  for (let i = 0; i < boss.snake.length; i++) {
    const segment = boss.snake[i];
    const isHead = (i === 0);

    ctx.fillStyle = boss.rageActive ? '#ff00ff' : COLORS.boss;
    ctx.fillRect(
      segment.x * cellSize + 1,
      segment.y * cellSize + 1,
      cellSize - 2,
      cellSize - 2
    );

    if (isHead) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        segment.x * cellSize + 1,
        segment.y * cellSize + 1,
        cellSize - 2,
        cellSize - 2
      );
    }
  }
}

function drawEnemy(enemy) {
  if (!ctx || !enemy || !enemy.snake || !enemy.snake.length || !enemy.alive) return;

  for (let i = 0; i < enemy.snake.length; i++) {
    const segment = enemy.snake[i];
    const isHead = (i === 0);

    ctx.fillStyle = COLORS.enemy;
    ctx.fillRect(
      segment.x * cellSize + 1,
      segment.y * cellSize + 1,
      cellSize - 2,
      cellSize - 2
    );

    if (isHead) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        segment.x * cellSize + 1,
        segment.y * cellSize + 1,
        cellSize - 2,
        cellSize - 2
      );
    }
  }
}

function drawObstacles(obstacles) {
  if (!ctx || !obstacles || !obstacles.length) return;

  ctx.fillStyle = COLORS.obstacle;

  for (const obstacle of obstacles) {
    ctx.fillRect(
      obstacle.x * cellSize,
      obstacle.y * cellSize,
      cellSize,
      cellSize
    );
  }
}

function drawMessage(text, subtext = '', duration = 3000) {
  if (!ctx) return;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, canvas.height / 2 - 60, canvas.width, 120);

  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 - 10);

  if (subtext) {
    ctx.font = '16px Arial';
    ctx.fillText(subtext, canvas.width / 2, canvas.height / 2 + 20);
  }
}

function drawScore(score, level) {
  if (!ctx) return;

  ctx.fillStyle = COLORS.text;
  ctx.font = '16px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`Score: ${score}`, 10, 25);

  ctx.textAlign = 'right';
  ctx.fillText(`Level: ${level}`, canvas.width - 10, 25);
}

function renderFullState(state, obstacles, playerIndex = 0) {
  clearCanvas();
  drawGrid();

  if (obstacles) {
    drawObstacles(obstacles);
  }

  if (state.food) {
    drawFood(state.food);
  }

  if (state.boss) {
    drawBoss(state.boss);
  }

  if (state.enemy) {
    drawEnemy(state.enemy);
  }

  if (state.players && state.players.length) {
    for (let i = 0; i < state.players.length; i++) {
      const player = state.players[i];
      if (player.alive && player.snake && player.snake.length) {
        drawSnake(player.snake, i, true);
      }
    }
  }

  if (state.score !== undefined && state.level !== undefined) {
    drawScore(state.score, state.level);
  }
}

module.exports = {
  setupRenderer,
  clearCanvas,
  drawGrid,
  drawSnake,
  drawFood,
  drawBoss,
  drawEnemy,
  drawObstacles,
  drawMessage,
  drawScore,
  renderFullState
};