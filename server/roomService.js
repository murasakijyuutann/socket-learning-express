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