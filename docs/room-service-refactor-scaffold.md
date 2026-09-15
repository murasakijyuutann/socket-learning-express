# Scaffold: room-service refactor

Copy-paste target for [`room-service-refactor-execution-map.md`](./room-service-refactor-execution-map.md). **Not live server code** — do not treat these as `server/*.js` until you copy them there.

CommonJS. No PLAY / PAUSE / SEEK / SYNC. `test-client.js` is untouched.

---

## `server/roomService.js`

Owns `rooms` and `tokenToSocket`. Returns plain data. Does not `require('ws')`, does not `.send()`, does not build `{ type: 'user-joined' }` payloads.

Decision A: `claimToken` reads `existing.readyState === existing.OPEN` on the opaque socket object (no `require('ws')`) so duplicate detection still means “live duplicate.”

```js
// RoomState = { members: Set<socket>, videoState: null }
// videoState is a placeholder for a later playback-sync task. Leave it null.

const rooms = new Map();
const tokenToSocket = new Map();

function claimToken(token, socket) {
    const existing = tokenToSocket.get(token);
    // Protocol leak (Decision A): liveness is a property of the socket object we were
    // handed. We do not import `ws`. Required so a zombie mapping can be overwritten.
    if (existing && existing.readyState === existing.OPEN) {
        return { ok: false, reason: 'duplicate' };
    }
    tokenToSocket.set(token, socket);
    return { ok: true };
}

function releaseToken(token, socket) {
    if (tokenToSocket.get(token) === socket) {
        tokenToSocket.delete(token);
    }
}

function joinRoom(socket, roomId) {
    let previousRoom = null;

    // A socket can only be in one room at a time. Re-joining the *same* room
    // must not count as a leave (previousRoom stays null → no user-left).
    if (socket.currentRoom && socket.currentRoom !== roomId) {
        rooms.get(socket.currentRoom)?.members.delete(socket);
        previousRoom = socket.currentRoom;
    }

    socket.currentRoom = roomId;

    if (!rooms.has(roomId)) {
        rooms.set(roomId, { members: new Set(), videoState: null });
    }
    rooms.get(roomId).members.add(socket);

    return { previousRoom, roomId };
}

function leaveRoom(socket) {
    if (!socket.currentRoom) {
        return null;
    }

    const roomId = socket.currentRoom;
    rooms.get(roomId)?.members.delete(socket);
    // Do not set socket.currentRoom = null — the current close handler never did.
    // Do not rooms.delete(roomId) when empty — current code never did.
    return { roomId };
}

function getRoomMembers(roomId) {
    return rooms.get(roomId)?.members;
}

module.exports = {
    claimToken,
    releaseToken,
    joinRoom,
    leaveRoom,
    getRoomMembers,
};
```

---

## `server/broadcast.js`

Same loop as today’s `broadcastToRoom`, but the caller already resolved the `Set`. This file may use `.send()` and `.readyState`.

```js
// socket.io(roomId.emit(...)) doesn't exist. We have to manually loop over
// every socket we tracked as being "in" that room and send to each one individually.

function broadcastToRoom(members, payload, excludeSocket) {
    if (!members) return;

    const message = JSON.stringify(payload);
    for (const client of members) {
        if (client !== excludeSocket && client.readyState === client.OPEN) {
            client.send(message);
        }
    }
}

module.exports = { broadcastToRoom };
```

---

## `server/index.js`

HTTP + WebSocket transport only. Parses messages, calls `roomService`, decides payloads, calls `broadcastToRoom`.

```js
const { WebSocketServer } = require('ws');
// ws is a raw WebSocket library - NOT an abstraction like socket.io
// There's no event system, no rooms, no auto-reconnect, We build all of that oursevlves.

const { createServer } = require('http');
const url = require('url');

const roomService = require('./roomService');
const { broadcastToRoom } = require('./broadcast');

const httpServer = createServer();

// Note: no Express, no io.use() middleware system, no io.on('connection'),
// We attach the WebSocket server directly to the HTTP server.

const wss = new WebSocketServer({ server: httpServer });

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

wss.on('connection', (socket, request) => {
    // socket.handshake.auth.token doesn't exist here - Socket.IO invented that conveninence.
    // In raw WebSocket, the ONLY thing we get at handshake is the HTTP request itself
    // (headers, URL, query string) - because remember, WebSocket connection start as HTTP.
    const { query } = url.parse(request.url, true);
    const token = query.token;

    console.log('handshake received for token:', token);

    if (!token) {
        // No built-in `next(new Error('no token provided'))` here - We just close the socket.
        // ourselves, with a WebSocket close code, before it ever reaches 'message' handling.
        socket.close(4001, 'no token provided');
        return;
    }

    const claimed = roomService.claimToken(token, socket);
    if (!claimed.ok) {
        socket.close(4002, 'token already connected');
        return;
    }

    // No built-in place to "stash" data on the socket like Socket.IO's socket.username -
    // but a raw ws socket is just a JS objectm so we can still attach our own properties.
    socket.username = token;
    socket.currentRoom = null;

    console.log('a user connected');

    // --- No socket.on('eventName', ...) event system exists in raw WebSockets -
    // There is exactly ONE event for incoming data: 'message', Every single thing.
    // Socket.IO calls a named "event" (join-room, send-message, etc) at this layer,
    // just a single incoming message, whose meaning we have to invent and parse ourselves.

    socket.on('message', (raw) => {
        let data;
        try {
            // Raw Websocket sends bytes/strings - not structured events. We chose to send
            // JSON strings so we CAN have something resembling "event types," but that's
            // a convention we're inventing not something the protocol gives us."
            data = JSON.parse(raw.toString());
        } catch (err) {
            console.error('bad message, not JSON:', raw.toString());
            return;
        }

        if (data.type === 'join-room') {
            const { previousRoom, roomId } = roomService.joinRoom(socket, data.roomId);

            if (previousRoom) {
                broadcastToRoom(
                    roomService.getRoomMembers(previousRoom),
                    { type: 'user-left', username: socket.username },
                    socket
                );
            }

            console.log(`user joined room: ${roomId}`);
            broadcastToRoom(
                roomService.getRoomMembers(roomId),
                { type: 'user-joined', username: socket.username },
                socket
            );
        }
    });

    // 'close' is a raw WebSocket's version of socket.IO's 'disconnect'.
    socket.on('close', () => {
        console.log('user disconnected');

        const left = roomService.leaveRoom(socket);
        roomService.releaseToken(token, socket);

        if (left) {
            broadcastToRoom(
                roomService.getRoomMembers(left.roomId),
                { type: 'user-left', username: socket.username },
                socket
            );
        }
    });
});
```

---

## How to land this later

1. Copy the three blocks into `server/roomService.js`, `server/broadcast.js`, and `server/index.js`.
2. Do **not** copy them until you are ready to replace the live server.
3. Verify with the steps in the execution map §10 (`node index.js`, then two `node test-client.js <name> <room>` processes).
