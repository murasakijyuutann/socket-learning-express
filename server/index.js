const { WebSocketServer } = require('ws');
// ws is a raw WebSocket library - NOT an abstraction like socket.io
// There's no event system, no rooms, no auto-reconnect, We build all of that ourselves.

const { createServer } = require('http');
const url = require('url');

const roomSerice = require('./rommService');
const { broadcastToRoom } = require('./broadcast');

const httpServer = createServer();

// Note : no express, no io.use() middleware system, no io.on('connection'),
// we atach the WebSocket server directly to the HTTP server.

const wss = new WebSocketServer({ server: httpServer });

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

wss.on('connection', (socket, request) => {
    // socket.handshake.auth.token doesn't exist here = Socket.IO
    // invented that convenience.
    // In raw Websocket, the only  thing we get at handshake is the HTTP request itself
    // (headers, URL, query string) - because remember, WebSocket connection start as HTTP.
    const { query } = url.parse(request.url, true);
    const token = query.token;

    console.log('handshake received for token:', token);

    if (!token) {
        // no built-in `next(new Error('no token provided'))` here -
        // we just close the socket.
        // ourselves, with a WebSocket close code, before it ever reaches 'message' handling.
        socket.close(4001, 'no token provided');
        return;
    }

    const claimed = roomService.claimToken(token, socket);
    if (!claimed.ok) {
        socket.close(4002, 'token already connected');
        return;
    }

    // no built-in place to "stash" data on the socket like Socket.
    // IO.s socket.username -
    // but a raw ws socket is just a JS objectm so we can still attach our own properties.

    socket.username = token;
    socket.currentRoom = null;

    console.log('a user connected');

    // --- no socket.on('eventName', ...) event system exists in raw WebSocket -
    // there is exactly one event for incoming data: 'message", Every single thing.
    // Socket.IO calls a named "event" (join-room, send-message, etc) at this layer,
    // just a single incoming message, whose meaning we have o invent and parse ourselves.

    socket.on('message', (raw) => {
        let data;
        try {
            // Raw Websocket sends bytes/strings - not structured events. We chose to send
            // JSON strings so we CAN have something resembling " event types,"
            // but that's  a convention we're inventing not something the protocol gives us."

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