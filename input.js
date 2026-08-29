// input.js - Client-side input handling for Snake game

let currentDir = 'right';
let nextDir = 'right';
let onDirectionChange = null;

const OPPOSITE_DIRS = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left'
};

function setupInput(initialDir = 'right', directionCallback = null) {
  currentDir = initialDir;
  nextDir = initialDir;
  onDirectionChange = directionCallback;

  document.addEventListener('keydown', handleKeyDown);

  // Touch controls (swipe)
  let touchStartX = 0;
  let touchStartY = 0;

  document.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;

    const dx = touchEndX - touchStartX;
    const dy = touchEndY - touchStartY;

    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal swipe
      if (dx > 0 && currentDir !== 'left') {
        setDirection('right');
      } else if (dx < 0 && currentDir !== 'right') {
        setDirection('left');
      }
    } else {
      // Vertical swipe
      if (dy > 0 && currentDir !== 'up') {
        setDirection('down');
      } else if (dy < 0 && currentDir !== 'down') {
        setDirection('up');
      }
    }
  }, { passive: true });
}

function handleKeyDown(e) {
  const key = e.key;

  if (key === 'ArrowUp' || key === 'w' || key === 'W') {
    if (currentDir !== 'down') {
      setDirection('up');
    }
  } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
    if (currentDir !== 'up') {
      setDirection('down');
    }
  } else if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
    if (currentDir !== 'right') {
      setDirection('left');
    }
  } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
    if (currentDir !== 'left') {
      setDirection('right');
    }
  }
}

function setDirection(newDir) {
  if (!newDir || !OPPOSITE_DIRS[newDir]) {
    return;
  }

  // Prevent 180-degree turns
  if (newDir === OPPOSITE_DIRS[currentDir]) {
    return;
  }

  nextDir = newDir;

  if (onDirectionChange) {
    onDirectionChange(newDir);
  }
}

function getCurrentDir() {
  return currentDir;
}

function getNextDir() {
  return nextDir;
}

function updateCurrentDir() {
  currentDir = nextDir;
  return currentDir;
}

function resetInput(initialDir = 'right') {
  currentDir = initialDir;
  nextDir = initialDir;
}

function cleanupInput() {
  document.removeEventListener('keydown', handleKeyDown);
}

module.exports = {
  setupInput,
  setDirection,
  getCurrentDir,
  getNextDir,
  updateCurrentDir,
  resetInput,
  cleanupInput
};