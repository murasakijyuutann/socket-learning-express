const { WebSocketServer } = require('ws');
// ws is a raw WebSocket library - NOT an abstraction like socket.io
// There's no event system, no rooms, no auto-reconnect, We build all of that oursevlves.

const { createServer } = require('http');
const url = require('url');

const httpServer = createServer();

// Note: no Express, no io.use() middleware system, no io.on('connection'),
// We attach the WebSocket server directly to the HTTP server.

const wss = new WebSocketServer({ server: httpServer });

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// --- "rooms" don't exist in raw WebSockets, We have to build them ourselves. ---
// A plain JS Map: roomId -> Set of sockets currently in that room.

const rooms = new Map();

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
            const roomId = data.roomId;
            socket.currentRoom = roomId;

            if (!rooms.has(roomId)) {
                rooms.set(roomId, new Set());
            }
            rooms.get(roomId).add(socket);

            console.log(`user joined room: ${roomId}`);
            broadcastToRoom(roomId, { type: 'user-joined', username: socket.username }, socket);
        }


    });

    // 'close' is a raw WebSocket's version of socket.IO's 'disconnect'.
    socket.on('close', () => {
        console.log('user disconnected');
        if (socket.currentRoom) {
            rooms.get(socket.currentRoom)?.delete(socket);
            broadcastToRoom(socket.currentRoom, { type: 'user-left', username: socket.username }, socket)
        }
        
    });

});

// socket.io(roomId.emit(...)) doesn't exist. We have to manually loop over
// every socket we tracked as being "in" that room and send to each one individually.

function broadcastToRoom(roomId, payload, excludeSocket) {
    const members = rooms.get(roomId);
    if (!members) return;

    const message = JSON.stringify(payload);
    for (const client of members) {
        if (client !== excludeSocket && client.readyState === client.OPEN) {
            client.send(message);
        }
    }
}
