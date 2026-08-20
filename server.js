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

function randomFood(type = 'red') {
  return {
    x: Math.floor(Math.random() * WIDTH),
    y: Math.floor(Math.random() * HEIGHT),
    type
  };
}

function createSnake(playerId) {
  const x = 10 + ((playerId * 7) % (WIDTH - 20));
  const y = 10 + ((playerId * 9) % (HEIGHT - 20));

  return [
    { x, y },
    { x: x - 1, y },
    { x: x - 2, y }
  ];
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
    dir: 'right',
    nextDir: 'right',
    alive: true,
    score: 0,
    grow: 0,
    snake: createSnake(id)
  };
}

function createRoom(roomName, player) {
  const room = {
    name: roomName,
    hostId: player.id,
    started: false,
    paused: false,
    food: randomFood('red'),
    players: new Map(),
    blueTimer: null,
    greenTimer: null
  };

  room.players.set(player.id, player);
  player.roomName = roomName;

  rooms.set(roomName, room);

  return room;
}

function getRoom(roomName) {
  return rooms.get(roomName.toLowerCase());
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
  if (ws && ws.readyState === WebSocket.OPEN) {
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
    players: publicPlayers(room)
  };
}

function broadcastRoom(room, data) {
  const message = JSON.stringify(data);

  for (const player of room.players.values()) {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(message);
    }
  }
}

function broadcastGameState(room) {
  broadcastRoom(room, {
    type: 'state',
    players: publicPlayers(room),
    food: room.food,
    paused: room.paused
  });
}

function broadcastRoomState(room) {
  broadcastRoom(room, roomState(room));
}

function sendRoomList(ws) {
  const list = Array.from(rooms.values())
    .filter((room) => !room.started && room.players.size < MAX_PLAYERS)
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
    .every((player) => player.host || player.ready);
}

function setDirection(player, direction) {
  const opposite = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left'
  };

  if (
    direction &&
    direction !== opposite[player.dir]
  ) {
    player.nextDir = direction;
  }
}

function resetRoomGame(room) {
  room.food = randomFood('red');
  room.paused = false;

  for (const player of room.players.values()) {
    player.dir = 'right';
    player.nextDir = 'right';
    player.alive = true;
    player.score = 0;
    player.grow = 0;
    player.snake = createSnake(player.id);
  }
}

function startSpecialAppleTimers(room) {
  clearInterval(room.blueTimer);
  clearInterval(room.greenTimer);

  room.blueTimer = setInterval(() => {
    if (!room.started || room.paused) {
      return;
    }

    room.food = randomFood('blue');
    broadcastGameState(room);
  }, 5000);

  room.greenTimer = setInterval(() => {
    if (!room.started || room.paused) {
      return;
    }

    room.food = randomFood('green');
    broadcastGameState(room);
  }, 10000);
}

function startRoom(room) {
  if (room.players.size < 1) return;
  if (!allJoinersReady(room)) return;

  room.started = true;
  resetRoomGame(room);
  startSpecialAppleTimers(room);

  broadcastRoom(room, {
    type: 'gameStart',
    width: WIDTH,
    height: HEIGHT,
    size: SIZE,
    players: publicPlayers(room),
    food: room.food,
    paused: room.paused
  });
}

function movePlayer(room, player) {
  if (!player.alive) return;

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

  const head = { ...player.snake[0] };

  if (player.dir === 'up') head.y--;
  if (player.dir === 'down') head.y++;
  if (player.dir === 'left') head.x--;
  if (player.dir === 'right') head.x++;

  const outside =
    head.x < 0 ||
    head.x >= WIDTH ||
    head.y < 0 ||
    head.y >= HEIGHT;

  const hitsSelf = player.snake
    .slice(1)
    .some((segment) =>
      segment.x === head.x &&
      segment.y === head.y
    );

  const hitsOther = Array.from(room.players.values())
    .filter((other) => other.id !== player.id && other.alive)
    .some((other) =>
      other.snake.some((segment) =>
        segment.x === head.x &&
        segment.y === head.y
      )
    );

  if (outside || hitsSelf || hitsOther) {
    player.alive = false;
    return;
  }

  player.snake.unshift(head);

  if (
    head.x === room.food.x &&
    head.y === room.food.y
  ) {
    player.score++;

    if (room.food.type === 'blue') {
      player.grow += 8;
    } else if (room.food.type === 'green') {
      player.grow += 15;
    } else {
      player.grow += 2;
    }

    room.food = randomFood('red');
  }

  if (player.grow > 0) {
    player.grow--;
  } else {
    player.snake.pop();
  }
}

function gameStep(room) {
  if (!room.started || room.paused) {
    return;
  }

  for (const player of room.players.values()) {
    movePlayer(room, player);
  }

  broadcastGameState(room);
}

function removePlayer(player) {
  const room = getRoom(player.roomName);

  if (!room) return;

  room.players.delete(player.id);

  if (room.players.size === 0) {
    clearInterval(room.blueTimer);
    clearInterval(room.greenTimer);

    rooms.delete(room.name.toLowerCase());
    return;
  }

  if (room.hostId === player.id) {
    const newHost = room.players.values().next().value;

    room.hostId = newHost.id;

    for (const other of room.players.values()) {
      other.host = other.id === room.hostId;

      if (other.host) {
        other.ready = true;
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
    try {
      const data = JSON.parse(rawMessage.toString());

      if (data.type === 'createRoom') {
        const name = cleanText(data.name, 'Player');
        const roomName = cleanText(data.room, 'Room');

        if (getRoom(roomName)) {
          send(ws, {
            type: 'error',
            message: 'That room already exists.'
          });
          return;
        }

        const player = createPlayer(ws, name, true);
        const room = createRoom(roomName.toLowerCase(), player);

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
        const roomName = cleanText(data.room, 'Room');
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

      if (data.type === 'ready') {
        const player = client.player;
        const room = player && getRoom(player.roomName);

        if (!room || player.host) {
          return;
        }

        player.ready = !player.ready;
        broadcastRoomState(room);
        return;
      }

      if (data.type === 'startRoom') {
        const player = client.player;
        const room = player && getRoom(player.roomName);

        if (!room || !player.host) {
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

        if (!room || !room.started || !player.host) {
          return;
        }

        room.paused = !room.paused;
        broadcastGameState(room);
        return;
      }

      if (data.type === 'restart') {
        const player = client.player;
        const room = player && getRoom(player.roomName);

        if (!room || !room.started || !player.host) {
          return;
        }

        resetRoomGame(room);
        broadcastGameState(room);
        return;
      }

      if (data.type === 'dir') {
        const player = client.player;
        const room = player && getRoom(player.roomName);

        if (!room || !room.started || room.paused) {
          return;
        }

        setDirection(player, data.dir);
      }
    } catch (error) {
      send(ws, {
        type: 'error',
        message: 'Invalid server message.'
      });
    }
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