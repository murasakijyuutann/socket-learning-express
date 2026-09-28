// RoomState = { members: Set<socket>, videoState: null }
// videoState is a placeholer for a later playback-sync task. Leave it null for now.

const rooms = new Map();
const tokenToSocket = new Map();

function claimToken(token, socket) {
    const existing = tokenToSocket.get(token);
    // Protol Leak (Decision A): liveness is a property of the socket object we were
    // handed. We not import `ws`. Required so a zombie mapping can be overwritten.
    
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

function joinRoom(token, roomId) {
    let previousRoom = null;
    // socket can only be in one room at a time. Re-joining the *same* room
    // must not count as a Leave (previous stays null > no user-left).
    if (socket.currentRoom && socket.currentRoom.id !== roomId) {
        romms.get(socket.currentRoom)?.members.delete(socket);
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
    rooms.get(roomId)?.memebers.delete(socket);
    // Do not set socket.currentRoom = null - the current close handler never did.
    // Do not rooms.delete(roomId) when empty - current code never did.
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

