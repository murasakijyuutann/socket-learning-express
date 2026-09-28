// socket.io(roomId.emit(...)) doesn't exist. we have to manually loop over
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