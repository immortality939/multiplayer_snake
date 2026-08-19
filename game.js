const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const restartBtn = document.getElementById("restart");
const controlButtons = document.querySelectorAll(".controls button");

canvas.width = 360;
canvas.height = 400;

const block = 5;
const cols = canvas.width / block;
const rows = canvas.height / block;
const gameSpeed = 120;
const wsUrl = "wss://multiplayer-snake-9g07.onrender.com";

let player = [];
let enemies = [];
let onlinePlayers = {};
let redApple = null;
let greenApple = null;
let blueApple = null;

let direction = "right";
let nextDirection = "right";
let gameRunning = true;
let gameOverState = false;
let score = 0;

let greenTimer = null;
let blueTimer = null;
let enemyTimer = null;
let ws = null;
let myPlayerId = null;
let mode = "offline";

const bgMusic = document.getElementById("bgMusic");
const gameOverSound = document.getElementById("gameOverSound");

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function clonePos(p) {
  return { x: p.x, y: p.y };
}

function randomPosition() {
  return {
    x: Math.floor(Math.random() * cols),
    y: Math.floor(Math.random() * rows)
  };
}

function spawnRedApple() {
  redApple = randomPosition();
}

function spawnGreenApple() {
  if (!greenApple) greenApple = randomPosition();
}

function spawnBlueApple() {
  if (!blueApple) blueApple = randomPosition();
}

function spawnEnemy() {
  const e = [{ x: 2, y: 2 }, { x: 1, y: 2 }, { x: 0, y: 2 }];
  enemies.push(e);
}

function changeDirection(dir) {
  if (dir === "up" && direction !== "down") nextDirection = "up";
  if (dir === "down" && direction !== "up") nextDirection = "down";
  if (dir === "left" && direction !== "right") nextDirection = "left";
  if (dir === "right" && direction !== "left") nextDirection = "right";
}

function getNextPosition(pos, dir) {
  const next = { x: pos.x, y: pos.y };
  if (dir === "up") next.y--;
  if (dir === "down") next.y++;
  if (dir === "left") next.x--;
  if (dir === "right") next.x++;
  return next;
}

function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function isDanger(pos, snake) {
  if (pos.x < 0 || pos.y < 0 || pos.x >= cols || pos.y >= rows) return true;

  for (let part of snake) {
    if (pos.x === part.x && pos.y === part.y) return true;
  }

  for (let part of player) {
    if (pos.x === part.x && pos.y === part.y) return true;
  }

  return false;
}

function getNearestApple(enemy) {
  const apples = [];
  if (redApple) apples.push(redApple);
  if (greenApple) apples.push(greenApple);
  if (blueApple) apples.push(blueApple);
  if (!apples.length) return null;

  let nearest = apples[0];
  let best = distance(enemy[0], apples[0]);

  for (let apple of apples) {
    const d = distance(enemy[0], apple);
    if (d < best) {
      best = d;
      nearest = apple;
    }
  }

  return nearest;
}

function findEnemyDirection(enemy) {
  const target = getNearestApple(enemy);
  if (!target) return "right";

  const moves = ["up", "down", "left", "right"];
  moves.sort((a, b) => {
    const A = getNextPosition(enemy[0], a);
    const B = getNextPosition(enemy[0], b);
    return distance(A, target) - distance(B, target);
  });

  for (let dir of moves) {
    const next = getNextPosition(enemy[0], dir);
    if (!isDanger(next, enemy)) return dir;
  }

  return null;
}

function enemyEatApple(enemy) {
  const head = enemy[0];

  if (redApple && head.x === redApple.x && head.y === redApple.y) {
    spawnRedApple();
    return true;
  }

  if (greenApple && head.x === greenApple.x && head.y === greenApple.y) {
    for (let i = 0; i < 15; i++) {
      enemy.push(clonePos(enemy[enemy.length - 1]));
    }
    greenApple = null;
    return true;
  }

  if (blueApple && head.x === blueApple.x && head.y === blueApple.y) {
    for (let i = 0; i < 8; i++) {
      enemy.push(clonePos(enemy[enemy.length - 1]));
    }
    blueApple = null;
    return true;
  }

  return false;
}

function eatApple() {
  const head = player[0];

  if (redApple && head.x === redApple.x && head.y === redApple.y) {
    score += 5;
    if (document.getElementById("score")) {
      document.getElementById("score").innerHTML = "Score: " + score;
    }
    player.push(clonePos(player[player.length - 1]));
    spawnRedApple();
    return true;
  }

  if (greenApple && head.x === greenApple.x && head.y === greenApple.y) {
    score += 15;
    if (document.getElementById("score")) {
      document.getElementById("score").innerHTML = "Score: " + score;
    }
    for (let i = 0; i < 15; i++) player.push(clonePos(player[player.length - 1]));
    greenApple = null;
    return true;
  }

  if (blueApple && head.x === blueApple.x && head.y === blueApple.y) {
    score += 10;
    if (document.getElementById("score")) {
      document.getElementById("score").innerHTML = "Score: " + score;
    }
    for (let i = 0; i < 8; i++) player.push(clonePos(player[player.length - 1]));
    blueApple = null;
    return true;
  }

  return false;
}

function movePlayer() {
  direction = nextDirection;

  const head = { x: player[0].x, y: player[0].y };
  if (direction === "up") head.y--;
  if (direction === "down") head.y++;
  if (direction === "left") head.x--;
  if (direction === "right") head.x++;

  player.unshift(head);

  if (typeof send === "function" && myPlayerId != null) {
    send({ type: "snakeUpdate", id: myPlayerId, snake: player });
  }

  if (!eatApple()) player.pop();
}

function moveEnemy(enemy) {
  if (!enemy.length) return;

  const dir = findEnemyDirection(enemy);
  if (!dir) return;

  const head = { x: enemy[0].x, y: enemy[0].y };
  if (dir === "up") head.y--;
  if (dir === "down") head.y++;
  if (dir === "left") head.x--;
  if (dir === "right") head.x++;

  if (isDanger(head, enemy)) {
    enemy.splice(0, enemy.length);
    return;
  }

  enemy.unshift(head);

  if (!enemyEatApple(enemy)) enemy.pop();
}

function checkCollision() {
  const head = player[0];

  if (head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows) {
    gameOver();
    return;
  }

  for (let i = 1; i < player.length; i++) {
    if (head.x === player[i].x && head.y === player[i].y) {
      gameOver();
      return;
    }
  }

  for (let enemy of enemies) {
    for (let part of enemy) {
      if (head.x === part.x && head.y === part.y) {
        gameOver();
        return;
      }
    }
  }
}

function checkEnemyCollision() {
  for (let e = 0; e < enemies.length; e++) {
    const enemy = enemies[e];
    if (enemy.length < 1) continue;

    const head = enemy[0];

    for (let i = 1; i < enemy.length; i++) {
      if (head.x === enemy[i].x && head.y === enemy[i].y) {
        enemies.splice(e, 1);
        e--;
        break;
      }
    }

    if (head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows) {
      enemies.splice(e, 1);
      e--;
      continue;
    }

    for (let part of player) {
      if (head.x === part.x && head.y === part.y) {
        enemies.splice(e, 1);
        e--;
        break;
      }
    }

    for (let other of enemies) {
      if (other === enemy) continue;
      for (let part of other) {
        if (head.x === part.x && head.y === part.y) {
          enemies.splice(e, 1);
          e--;
          break;
        }
      }
    }
  }
}

function drawSnake(snake, color) {
  if (!snake || !snake.length) return;

  ctx.fillStyle = color;

  for (let i = 0; i < snake.length; i++) {
    const part = snake[i];
    const x = part.x * block;
    const y = part.y * block;

    if (i === 0) {
      ctx.beginPath();
      ctx.arc(x + block / 2, y + block / 2, block / 2 + 0.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, block, block);
    }
  }
}

function drawApple(apple, color) {
  if (!apple) return;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(apple.x * block + block / 2, apple.y * block + block / 2, block / 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawBorder() {
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, canvas.width, canvas.height);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawBorder();

  drawSnake(player, "#008cff");

  for (let id in onlinePlayers) {
    drawSnake(onlinePlayers[id], "lime");
  }

  for (let enemy of enemies) {
    drawSnake(enemy, "orange");
  }

  drawApple(redApple, "red");
  drawApple(greenApple, "lime");
  drawApple(blueApple, "cyan");
}

function gameOver() {
  gameRunning = false;
  gameOverState = true;

  if (bgMusic) bgMusic.pause();
  if (gameOverSound) gameOverSound.play();

  const gif = document.getElementById("gameOverGif");
  const text = document.getElementById("gameOverText");

  if (gif) gif.style.display = "block";
  if (text) text.style.display = "block";
}

function gameLoop() {
  if (!gameRunning) return;

  movePlayer();

  for (let e of enemies) {
    moveEnemy(e);
  }

  checkEnemyCollision();
  checkCollision();
  draw();

  setTimeout(gameLoop, gameSpeed);
}

function startGame() {
  if (localStorage.getItem("playerId") === localStorage.getItem("hostId")) {
    player = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
  } else {
    player = [{ x: 50, y: 10 }, { x: 49, y: 10 }, { x: 48, y: 10 }];
  }

  score = 0;
  const scoreEl = document.getElementById("score");
  if (scoreEl) scoreEl.innerHTML = "Score: 0";

  enemies = [];
  setTimeout(spawnEnemy, 100);

  direction = "right";
  nextDirection = "right";

  spawnRedApple();
  greenApple = null;
  blueApple = null;

  gameRunning = true;
  gameOverState = false;

  const gif = document.getElementById("gameOverGif");
  const text = document.getElementById("gameOverText");
  if (gif) gif.style.display = "none";
  if (text) text.style.display = "none";

  if (bgMusic) {
    bgMusic.currentTime = 0;
    bgMusic.play();
  }

  clearInterval(greenTimer);
  clearInterval(blueTimer);
  clearInterval(enemyTimer);

  greenTimer = setInterval(spawnGreenApple, 15000);
  blueTimer = setInterval(spawnBlueApple, 8000);
  enemyTimer = setInterval(spawnEnemy, 10000);

  gameLoop();
}

function restartGame() {
  startGame();
}

function pauseGame() {
  if (gameOverState) return;
  gameRunning = !gameRunning;
  if (gameRunning) gameLoop();
}

document.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "arrowup" || k === "w") changeDirection("up");
  if (k === "arrowdown" || k === "s") changeDirection("down");
  if (k === "arrowleft" || k === "a") changeDirection("left");
  if (k === "arrowright" || k === "d") changeDirection("right");
});

controlButtons.forEach((btn) => {
  const dir = btn.dataset.dir;
  btn.addEventListener("click", () => changeDirection(dir));
  btn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    changeDirection(dir);
  }, { passive: false });
});

if (restartBtn) {
  restartBtn.onclick = restartGame;
}

startGame();