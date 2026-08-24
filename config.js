// =========================
// config.js - Shared Game Configuration
// Edit these values to change game behavior for both single-player and multiplayer
// =========================

const GAME_CONFIG = {
  // Initial snake settings
  initialLength: 30,
  initialPosition: { x: 10, y: 5 },

  // Movement & speed
  speedMs: 120,

  // Grid & board
  grid: {
    width: 72,
    height: 80,
    cellSize: 5,
    drawSize: 5
  },

  // Colors
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

  // Timings
  timings: {
    gameLoop: 120,
    blueAppleSpawn: 8000,
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

  // Levels
  levels: {
    1: { name: 'Plain board', obstacles: 'none' },
    2: { name: 'Middle block', obstacles: 'horizontal' },
    3: { name: 'Cross blocks', obstacles: 'cross' },
    4: { name: 'The Four Gates', obstacles: 'fourGates' },
    5: { name: 'The Maze Runner', obstacles: 'maze' },
    6: { name: 'BOSS SURVIVAL', obstacles: 'boss' }
  },

  // BOSS snake settings
  boss: {
    enabledInLevel: 6,
    length: 3,
    baseSpeedMs: 10,
    rageSpeedMs: 90,
    rageIntervalMs: 5000,
    rageDurationMs: 3000,
    baseColor: '#8b5cf6',
    rageColor: '#ef4444',
    highlightColor: '#ef4444'
  },

  // Audio volumes
  audio: {
    introVolume: 0.35,
    bgVolume: 0.35,
    gameOverVolume: 1.0
  }
};

// For browser
if (typeof window !== 'undefined') {
  window.GAME_CONFIG = GAME_CONFIG;
}

// For Node.js server
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GAME_CONFIG;
}