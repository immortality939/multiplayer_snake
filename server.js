const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const WIDTH = 72;
const HEIGHT = 80;
const SIZE = 5;
const TICK = 120;
const MAX_PLAYERS = 4;

const COLORS = [
  '#ff4d4d',
  '#4dd2ff',
  '#7dff4d',
  '#ffd24d'
];

let nextId = 1;
const rooms = new Map();

function cleanText(value, fallback) {
  const text = String(value || '').trim();

  if (!text) {
    return fallback;
  }

  return text.slice(0, 18);
}

function normalizeRoomName(value) {
  return cleanText(value, 'Room').toLowerCase();
}

function randomFood(type = 'red') {
  return {
    x: Math.floor(Math.random() * WIDTH),
    y: Math.floor(Math.random() * HEIGHT),
    type
  };
}

function createSnake(playerId) {
  const margin = 8;

  const spawns = {
    1: {
      x: margin,
      y: margin,
      dir: 'right'
    },

    2: {
      x: WIDTH - margin - 1,
      y: margin,
      dir: 'down'
    },

    3: {
      x: WIDTH - margin - 1,
      y: HEIGHT - margin - 1,
      dir: 'left'
    },

    4: {
      x: margin,
      y: HEIGHT - margin - 1,
      dir: 'up'
    }
  };

  const spawn = spawns[((playerId - 1) % 4) + 1];

  if (spawn.dir === 'left') {
    return [
      { x: spawn.x, y: spawn.y },
      { x: spawn.x + 1, y: spawn.y },
      { x: spawn.x + 2, y: spawn.y }
    ];
  }

  if (spawn.dir === 'right') {
    return [
      { x: spawn.x, y: spawn.y },
      { x: spawn.x - 1, y: spawn.y },
      { x: spawn.x - 2, y: spawn.y }
    ];
  }

  if (spawn.dir === 'down') {
    return [
      { x: spawn.x, y: spawn.y },
      { x: spawn.x, y: spawn.y - 1 },
      { x: spawn.x, y: spawn.y - 2 }
    ];
  }

  return [
    { x: spawn.x, y: spawn.y },
    { x: spawn.x, y: spawn.y + 1 },
    { x: spawn.x, y: spawn.y + 2 }
  ];
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
function createPlayer(ws, name, host) {
  const id = nextId++;

  return {
    id,
    ws,
    name,
    host,
    ready: host,
    color: COLORS[(id - 1) % COLORS.length],
dir: getSpawnDirection(id),
nextDir: getSpawnDirection(id),
alive: true,
score: 0,
grow: 0,
snake: createSnake(id),
roomName: ''
  };
}

function createRoom(roomName, player) {
  const room = {
    name: roomName,
    hostId: player.id,
    started: false,
    paused: false,
    level: 1,
    food: [randomFood('red')],
    blueTimer: null,
    greenTimer: null,
    players: new Map()
  };

  room.players.set(player.id, player);
  player.roomName = roomName;

  rooms.set(roomName, room);

  return room;
}

function getRoom(roomName) {
  if (!roomName) {
    return null;
  }

  return rooms.get(normalizeRoomName(roomName));
}

function publicPlayers(room) {
  return Array.from(room.players.values()).map((player) => ({
    id: player.id,
    name: player.name,
    host: player.host,
    ready: player.ready,
    alive: player.alive,
    color: player.color,
    score: player.score,
    snake: player.snake
  }));
}

function send(ws, data) {
  if (
    ws &&
    ws.readyState === WebSocket.OPEN
  ) {
    ws.send(JSON.stringify(data));
  }
}

function roomState(room) {
  return {
    type: 'roomState',
    room: room.name,
    hostId: room.hostId,
    started: room.started,
    paused: room.paused,
    level: room.level,
    players: publicPlayers(room)
  };
}

function broadcastRoom(room, data) {
  const message = JSON.stringify(data);

  for (const player of room.players.values()) {
    if (
      player.ws &&
      player.ws.readyState === WebSocket.OPEN
    ) {
      player.ws.send(message);
    }
  }
}

function broadcastRoomState(room) {
  broadcastRoom(room, roomState(room));
}

function sendRoomList(ws) {
  const list = Array.from(rooms.values())
    .filter((room) =>
      !room.started &&
      room.players.size < MAX_PLAYERS
    )
    .map((room) => ({
      name: room.name,
      players: room.players.size
    }));

  send(ws, {
    type: 'roomList',
    rooms: list
  });
}

function allJoinersReady(room) {
  return Array.from(room.players.values())
    .every((player) =>
      player.host || player.ready
    );
}

function setDirection(player, direction) {
  const allowed = [
    'up',
    'down',
    'left',
    'right'
  ];

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

function resetRoomGame(room) {
  room.food = [randomFood('red')];
  room.paused = false;

  for (const player of room.players.values()) {
    player.dir = getSpawnDirection(player.id);
player.nextDir = getSpawnDirection(player.id);
    player.alive = true;
    player.score = 0;
    player.grow = 0;
    player.snake = createSnake(player.id);
  }
}

function stopFoodTimers(room) {
  clearInterval(room.blueTimer);
  clearInterval(room.greenTimer);

  room.blueTimer = null;
  room.greenTimer = null;
}

function startFoodTimers(room) {
  stopFoodTimers(room);

  room.blueTimer = setInterval(() => {
    if (
      !room.started ||
      room.paused
    ) {
      return;
    }

    room.food.push(randomFood('blue'));

    broadcastRoom(room, {
      type: 'state',
      players: publicPlayers(room),
      food: room.food,
      paused: room.paused
    });
  }, 8000);

  room.greenTimer = setInterval(() => {
    if (
      !room.started ||
      room.paused
    ) {
      return;
    }

    room.food.push(randomFood('green'));

    broadcastRoom(room, {
      type: 'state',
      players: publicPlayers(room),
      food: room.food,
      paused: room.paused
    });
  }, 16000);
}

function startRoom(room) {
  if (room.players.size < 1) {
    return;
  }

  if (!allJoinersReady(room)) {
    return;
  }

  room.started = true;
  resetRoomGame(room);
  startFoodTimers(room);

  broadcastRoom(room, {
    type: 'gameStart',
    width: WIDTH,
    height: HEIGHT,
    size: SIZE,
    players: publicPlayers(room),
    food: room.food,
    paused: room.paused,
    level: room.level
  });
}

function createLevelObstacles(level) {
  const result = [];
  const middleY = Math.floor(HEIGHT / 2);

  if (
    level === 2 ||
    level === 3
  ) {
    for (let x = 18; x < WIDTH - 18; x++) {
      result.push({
        x,
        y: middleY
      });
    }
  }

  if (level === 3) {
    const middleX = Math.floor(WIDTH / 2);

    for (let y = 10; y < HEIGHT - 10; y++) {
      result.push({
        x: middleX,
        y
      });
    }
  }

  if (level === 4) {
    const middleX = Math.floor(WIDTH / 2);

    const horizontalGapStart =
      Math.floor(WIDTH / 2) - 4;

    const horizontalGapEnd =
      Math.floor(WIDTH / 2) + 4;

    const verticalGapStart =
      Math.floor(HEIGHT / 2) - 4;

    const verticalGapEnd =
      Math.floor(HEIGHT / 2) + 4;

    for (let x = 12; x < WIDTH - 12; x++) {
      if (
        x < horizontalGapStart ||
        x > horizontalGapEnd
      ) {
        result.push({
          x,
          y: middleY - 10
        });

        result.push({
          x,
          y: middleY + 10
        });
      }
    }

    for (let y = 12; y < HEIGHT - 12; y++) {
      if (
        y < verticalGapStart ||
        y > verticalGapEnd
      ) {
        result.push({
          x: middleX - 14,
          y
        });

        result.push({
          x: middleX + 14,
          y
        });
      }
    }
  }

  if (level === 5) {
    const rows = [
      {
        y: 15,
        start: 12,
        end: WIDTH - 14,
        openingSide: 'right'
      },
      {
        y: 30,
        start: 14,
        end: WIDTH - 12,
        openingSide: 'left'
      },
      {
        y: 45,
        start: 12,
        end: WIDTH - 14,
        openingSide: 'right'
      },
      {
        y: 60,
        start: 14,
        end: WIDTH - 12,
        openingSide: 'left'
      }
    ];

    for (const row of rows) {
      for (let x = row.start; x <= row.end; x++) {
        const hasOpening =
          row.openingSide === 'left'
            ? x < row.start + 8
            : x > row.end - 8;

        if (!hasOpening) {
          result.push({
            x,
            y: row.y
          });
        }
      }
    }
  }

  return result;
}

function movePlayer(room, player) {
  if (!player.alive) {
    return;
  }

  const opposite = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left'
  };

  if (
    player.nextDir &&
    player.nextDir !== opposite[player.dir]
  ) {
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

  const levelObstacles =
    createLevelObstacles(room.level || 1);

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

  if (
    outside ||
    hitsObstacle ||
    hitsSelf ||
    hitsOther
  ) {
    player.alive = false;
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

    if (eatenApple.type === 'blue') {
      player.grow += 8;
    } else if (eatenApple.type === 'green') {
      player.grow += 15;
    } else {
      player.grow += 2;
    }

    if (eatenApple.type === 'red') {
      room.food[foodIndex] = randomFood('red');
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

function gameStep(room) {
  if (
    !room.started ||
    room.paused
  ) {
    return;
  }

  for (const player of room.players.values()) {
    movePlayer(room, player);
  }

  broadcastRoom(room, {
    type: 'state',
    players: publicPlayers(room),
    food: room.food,
    paused: room.paused,
    level: room.level
  });
}

function removePlayer(player) {
  const room = getRoom(player.roomName);

  if (!room) {
    return;
  }

  room.players.delete(player.id);

  if (room.players.size === 0) {
    stopFoodTimers(room);
    rooms.delete(room.name);
    return;
  }

  if (room.hostId === player.id) {
  const newHost =
    room.players.values().next().value;

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

  broadcastRoomState(room);
}

wss.on('connection', (ws) => {
  const client = {
    ws,
    player: null
  };

  send(ws, {
    type: 'connected'
  });

  ws.on('message', (rawMessage) => {
    let data;

    try {
      data = JSON.parse(rawMessage.toString());
    } catch (error) {
      console.error('Invalid JSON from client:', rawMessage.toString());

      send(ws, {
        type: 'error',
        message: 'Invalid JSON message.'
      });

      return;
    }

    try {
      if (
        !data ||
        typeof data.type !== 'string'
      ) {
        send(ws, {
          type: 'error',
          message: 'Message type is required.'
        });

        return;
      }

      if (data.type === 'createRoom') {
        const name = cleanText(data.name, 'Player');
        const roomName = normalizeRoomName(data.room);

        if (getRoom(roomName)) {
          send(ws, {
            type: 'error',
            message: 'That room already exists.'
          });

          return;
        }

        const player = createPlayer(ws, name, true);
        const room = createRoom(roomName, player);

        client.player = player;

        send(ws, {
          type: 'roomJoined',
          room: room.name,
          host: true,
          playerId: player.id
        });

        broadcastRoomState(room);
        return;
      }

      if (data.type === 'listRooms') {
        sendRoomList(ws);
        return;
      }

      if (data.type === 'joinRoom') {
        const name = cleanText(data.name, 'Player');
        const roomName = normalizeRoomName(data.room);
        const room = getRoom(roomName);

        if (!room) {
          send(ws, {
            type: 'error',
            message: 'Room not found.'
          });

          return;
        }

        if (room.started) {
          send(ws, {
            type: 'error',
            message: 'That game has already started.'
          });

          return;
        }

        if (room.players.size >= MAX_PLAYERS) {
          send(ws, {
            type: 'error',
            message: 'That room is full. Maximum is four players.'
          });

          return;
        }

        const player = createPlayer(ws, name, false);

        player.ready = false;
        player.roomName = room.name;

        room.players.set(player.id, player);
        client.player = player;

        send(ws, {
          type: 'roomJoined',
          room: room.name,
          host: false,
          playerId: player.id
        });

        broadcastRoomState(room);
        return;
      }
      if (data.type === 'selectLevel') {
        const player = client.player;
        const room = player && getRoom(player.roomName);

        if (
          !room ||
          room.started ||
          !player.host
        ) {
          return;
        }

        const level = Number(data.level);

        if (![1, 2, 3, 4, 5, 6].includes(level)) {
          return;
        }

        room.level = level;
        broadcastRoomState(room);
        return;
      }
      if (data.type === 'ready') {
        const player = client.player;
        const room = player && getRoom(player.roomName);

        if (
          !room ||
          player.host
        ) {
          return;
        }

        player.ready = !player.ready;
        broadcastRoomState(room);
        return;
      }

      if (data.type === 'startRoom') {
        const player = client.player;
        const room = player && getRoom(player.roomName);

        if (
          !room ||
          !player.host
        ) {
          return;
        }

        if (!allJoinersReady(room)) {
          send(ws, {
            type: 'error',
            message: 'Every player must be ready before starting.'
          });

          return;
        }

        startRoom(room);
        return;
      }

      if (data.type === 'pause') {
        const player = client.player;
        const room = player && getRoom(player.roomName);

        if (
          !room ||
          !room.started ||
          !player.host
        ) {
          return;
        }

        room.paused = !room.paused;

        broadcastRoom(room, {
          type: 'state',
          players: publicPlayers(room),
          food: room.food,
          paused: room.paused
        });

        return;
      }

      if (data.type === 'restart') {
        const player = client.player;
        const room = player && getRoom(player.roomName);

        if (
          !room ||
          !room.started ||
          !player.host
        ) {
          return;
        }

        resetRoomGame(room);
        startFoodTimers(room);

        broadcastRoom(room, {
          type: 'state',
          players: publicPlayers(room),
          food: room.food,
          paused: room.paused
        });

        return;
      }

      if (data.type === 'dir') {
        const player = client.player;
        const room = player && getRoom(player.roomName);

        if (
          !room ||
          !room.started ||
          room.paused
        ) {
          return;
        }

        setDirection(player, data.dir);
      }
    } catch (error) {
      console.error('Server game error:', error);

      send(ws, {
        type: 'error',
        message: 'Server could not process that action.'
      });
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  ws.on('close', () => {
    if (client.player) {
      removePlayer(client.player);
    }
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    gameStep(room);
  }
}, TICK);

server.listen(PORT, () => {
  console.log(`Snake server listening on port ${PORT}`);
});
.room-level-button[data-level="6"] {
  border-color: #ef4444;
  color: #fff;
  background: linear-gradient(
    135deg,
    #991b1b,
    #450a0a
  );
  box-shadow:
    0 0 10px rgba(239, 68, 68, 0.65);
}

.room-level-button[data-level="6"]:hover:not(:disabled) {
  background: linear-gradient(
    135deg,
    #dc2626,
    #7f1d1d
  );
}

.room-level-button[data-level="6"].selected {
  border-color: #facc15;
  background: linear-gradient(
    135deg,
    #dc2626,
    #7f1d1d
  );
  box-shadow:
    0 0 16px rgba(250, 204, 21, 0.95);
}

.room-level-button[data-level="6"] small {
  color: #fecaca;
}