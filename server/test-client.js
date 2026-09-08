const WebSocket = require('ws');

const username = process.argv[2];
const roomId = process.argv[3];

const socket = new WebSocket(
    `ws://localhost:3000/?token=${username}`
);

socket.on('open', () => {
    console.log(`${username} connected to room ${roomId}`);

    socket.send(JSON.stringify({
        type: 'join-room',
        roomId

    }));
});

socket.on('message', (raw) => {
    const data = JSON.parse(raw.toString());

    console.log(`${username} received:`, data);
});

socket.on('close', (code, reason) => {
    console.log(
        `${username} disconnected`,
        code,
        reason.toString()
    );
});