// rooms.js - Room management helpers
const foodModule = require('./food.js');
const bossModule = require('./boss.js');
const playerModule = require('./player.js');
const enemyModule = require('./enemy.js');

const CONFIG = require('./config.js');

let rooms = null;
let bossState = null;
let createSnakeFn = null;
let getSpawnDirectionFn = null;
let getPublicBossFn = null;
let broadcastRoomFn = null;
let broadcastRoomStateFn = null;
let sendRoomListFn = null;
let startFoodTimersFn = null;
let stopFoodTimersFn = null;
let resetRoomGameFn = null;
let checkAllPlayersDeadFn = null;
let startRoomFn = null;
let finishRoomCountdownFn = null;
let createLevelObstaclesForLevelFn = null;
let startPlayerDeathFn = null;
let publicPlayersFn = null;
let normalizeRoomNameFn = null;
let cleanTextFn = null;

let WIDTH = 72;
let HEIGHT = 80;
let MAX_PLAYERS = 4;

function setupRoomsModule({
  roomsRef,
  bossStateRef,
  createSnake,
  getSpawnDirection,
  getPublicBoss,
  broadcastRoom,
  broadcastRoomState,
  sendRoomList,
  startFoodTimers,
  stopFoodTimers,
  resetRoomGame,
  checkAllPlayersDead,
  startRoom,
  finishRoomCountdown,
  createLevelObstaclesForLevel,
  startPlayerDeath,
  publicPlayers,
  normalizeRoomName,
  cleanText,
  width,
  height,
  maxPlayers
}) {
  rooms = roomsRef;
  bossState = bossStateRef;
  createSnakeFn = createSnake;
  getSpawnDirectionFn = getSpawnDirection;
  getPublicBossFn = getPublicBoss;
  broadcastRoomFn = broadcastRoom;
  broadcastRoomStateFn = broadcastRoomState;
  sendRoomListFn = sendRoomList;
  startFoodTimersFn = startFoodTimers;
  stopFoodTimersFn = stopFoodTimers;
  resetRoomGameFn = resetRoomGame;
  checkAllPlayersDeadFn = checkAllPlayersDead;
  startRoomFn = startRoom;
  finishRoomCountdownFn = finishRoomCountdown;
  createLevelObstaclesForLevelFn = createLevelObstaclesForLevel;
  startPlayerDeathFn = startPlayerDeath;
  publicPlayersFn = publicPlayers;
  normalizeRoomNameFn = normalizeRoomName;
  cleanTextFn = cleanText;

  WIDTH = width;
  HEIGHT = height;
  MAX_PLAYERS = maxPlayers;
}

function createRoom(roomName, player) {
  const room = {
    name: roomName,
    hostId: player.id,
    started: false,
    paused: false,
    level: 1,
    food: [],
    introTimer: null,
    countdownTimer: null,
    startTime: 0,
    countdownEndsAt: 0,
    winnerShown: false,
    blueTimer: null,
    greenTimer: null,
    enemy: null,
    players: new Map()
  };

  room.players.set(player.id, player);
  player.roomName = roomName;

  rooms.set(roomName, room);
  room.food = [foodModule.randomFood('red', room)].filter(Boolean);
  return room;
}

function getRoom(roomName) {
  if (!roomName) {
    return null;
  }

  return rooms.get(normalizeRoomNameFn(roomName));
}

function roomState(room) {
  return {
    type: 'roomState',
    room: room.name,
    hostId: room.hostId,
    started: room.started,
    paused: room.paused,
    level: room.level,
    players: publicPlayersFn(room)
  };
}

function allJoinersReady(room) {
  return Array.from(room.players.values())
    .every((player) =>
      player.host || player.ready
    );
}

function removePlayer(player) {
  const room = getRoom(player.roomName);

  if (!room) {
    return;
  }

  room.players.delete(player.id);

  if (room.players.size === 0) {
    stopFoodTimersFn(room);

    clearTimeout(room.introTimer);
    clearTimeout(room.countdownTimer);

    bossState.delete(room.name);
    rooms.delete(room.name);
    return;
  }

  if (room.hostId === player.id) {
    const newHost = room.players.values().next().value;

    if (newHost) {
      room.hostId = newHost.id;

      for (const other of room.players.values()) {
        other.host = other.id === room.hostId;

        if (other.host) {
          other.ready = true;
        }
      }
    }
  }

  broadcastRoomStateFn(room);
}

function createAndJoinRoom(roomName, player) {
  const room = createRoom(roomName, player);
  broadcastRoomStateFn(room);
  return room;
}

function playerJoinRoom(roomName, player) {
  const room = getRoom(roomName);

  if (!room) {
    return { success: false, error: 'Room not found.' };
  }

  if (room.started) {
    return { success: false, error: 'That game has already started.' };
  }

  if (room.players.size >= MAX_PLAYERS) {
    return { success: false, error: 'That room is full. Maximum is four players.' };
  }

  player.ready = false;
  player.roomName = room.name;

  room.players.set(player.id, player);
  broadcastRoomStateFn(room);

  return { success: true, room };
}

function selectLevelForRoom(room, level) {
  if (![1, 2, 3, 4, 5, 6].includes(level)) {
    return false;
  }

  room.level = level;
  broadcastRoomStateFn(room);
  return true;
}

function toggleReady(player) {
  const room = getRoom(player.roomName);

  if (!room || player.host) {
    return false;
  }

  player.ready = !player.ready;
  broadcastRoomStateFn(room);
  return true;
}

function tryStartRoom(room) {
  if (room.players.size < 1) {
    return { success: false, error: 'Not enough players.' };
  }

  if (!allJoinersReady(room)) {
    return { success: false, error: 'Every player must be ready before starting.' };
  }

  startRoomFn(room);
  return { success: true };
}

function togglePause(room, player) {
  if (!room || !room.started || !player.host) {
    return false;
  }

  room.paused = !room.paused;

  broadcastRoomFn(room, {
    type: 'state',
    players: publicPlayersFn(room),
    food: room.food,
    paused: room.paused,
    level: room.level,
    boss: getPublicBossFn(room)
  });

  return true;
}

function restartRoom(room, WIDTH, HEIGHT, cellSize) {
  if (!room || !room.started) {
    return false;
  }

  stopFoodTimersFn(room);

  clearTimeout(room.introTimer);
  clearTimeout(room.countdownTimer);

  room.introTimer = null;
  room.countdownTimer = null;
  room.startTime = 0;
  room.countdownEndsAt = 0;
  room.winnerShown = false;

  bossState.delete(room.name);

  resetRoomGameFn(room);

  if (room.level === CONFIG.boss.enabledInLevel) {
    bossState.set(
      room.name,
      bossModule.createBossSnakeServer(room)
    );
  } else {
    bossState.delete(room.name);
  }

  if (room.level === CONFIG.enemy?.enabledInLevel) {
    room.enemy = enemyModule.createEnemySnakeServer(room);
  } else {
    room.enemy = null;
  }

  startFoodTimersFn(room);

  const boss = bossState.get(room.name);

  broadcastRoomFn(room, {
    type: 'gameStart',
    width: WIDTH,
    height: HEIGHT,
    size: cellSize,
    players: publicPlayersFn(room),
    food: room.food,
    paused: room.level === 6,
    level: room.level,
    boss: boss
      ? {
          snake: boss.snake,
          alive: boss.alive,
          rageActive: boss.rageActive
        }
      : null,
    introMessage: room.level === 6 ? 'SNAKE SURVIVAL LAST SNAKE ALIVE<br>AVOID BOSS SNAKE' : '',
    introDuration: 4000
  });

  clearTimeout(room.introTimer);

  if (room.level === 6) {
    room.introTimer = setTimeout(() => {
      if (!room.started) {
        return;
      }

      room.paused = false;

      room.startTime = Date.now();
      room.countdownEndsAt = room.startTime + 60000;

      broadcastRoomFn(room, {
        type: 'countdownStart',
        countdownEndsAt: room.countdownEndsAt
      });

      clearTimeout(room.countdownTimer);

      room.countdownTimer = setTimeout(() => {
        finishRoomCountdownFn(room);
      }, 60000);
    }, 4000);
  } else {
    room.paused = false;
  }

  return true;
}

function getActiveRooms() {
  return Array.from(rooms.values())
    .filter((room) =>
      !room.started &&
      room.players.size < MAX_PLAYERS
    )
    .map((room) => ({
      name: room.name,
      players: room.players.size
    }));
}

module.exports = {
  setupRoomsModule,
  createRoom,
  getRoom,
  roomState,
  allJoinersReady,
  removePlayer,
  createAndJoinRoom,
  playerJoinRoom,
  selectLevelForRoom,
  toggleReady,
  tryStartRoom,
  togglePause,
  restartRoom,
  getActiveRooms
};