// =========================
// snake.js - Human-Readable Game Configuration
// Edit these values to change game behavior
// =========================

const SNAKE_CONFIG = {
  // Initial snake settings
  initialLength: 30,              // starting snake length
  initialPosition: { x: 10, y: 5 }, // starting head position

  // Movement & speed
  speedMs: 120,                  // game loop interval in milliseconds (lower = faster)

  // Grid & board
  grid: {
    width: 72,
    height: 80,
    cellSize: 5,
    drawSize: 5
  },

  // Colors (hex)
  colors: {
    snakeBlue: '#008cff',
    snakeEnemy: '#d4af37',
    appleRed: '#ef4444',
    appleBlue: '#2583ff',
    appleGreen: '#22c55e',
    obstacleFill: '#64748b',
    obstacleStroke: '#cbd5e1',
    text: '#fff'
  },

  // Timings (milliseconds)
  timings: {
    gameLoop: 120,
    blueAppleSpawn: 80,
    greenAppleSpawn: 16000,
    enemySpawn: 20000
  },

  // Food growth values
  foodGrowth: {
    red: 2,
    blue: 8,
    green: 15
  },

  // Multiplayer
  multiplayer: {
    wsUrl: 'wss://multiplayer-snake-9g07.onrender.com',
    maxPlayersPerRoom: 4,
    maxNameLength: 18
  },

  // Levels (1–6)
  levels: {
    1: { name: 'Plain board', obstacles: 'none' },
    2: { name: 'Middle block', obstacles: 'horizontal' },
    3: { name: 'Cross blocks', obstacles: 'cross' },
    4: { name: 'The Four Gates', obstacles: 'fourGates' },
    5: { name: 'The Maze Runner', obstacles: 'maze' },
    6: { name: 'BOSS SURVIVAL', obstacles: 'boss' }
  },

  // Audio volumes (0.0 to 1.0)
  audio: {
    introVolume: 0.35,
    bgVolume: 0.35,
    gameOverVolume: 1.0
  }
};

// Export for use in game.js (browser global)
window.SNAKE_CONFIG = SNAKE_CONFIG;