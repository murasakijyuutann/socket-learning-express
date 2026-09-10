# WebSocket Round-Trip: `client/test.html` ↔ `server/index.js`

Here's the full round-trip between `client/test.html` and `server/index.js`, step by step.

## 1. Connecting (handshake)

When you type a username and click **Connect**, `test.html:74` runs:

```js
socket = new WebSocket(`ws://localhost:3000/?token=${username}`);
```

A WebSocket connection always starts life as a plain HTTP request (the "upgrade" request), and the only way to smuggle data into that request from the browser's `WebSocket` constructor is the URL itself — there's no `headers`/`auth` option like `fetch` has. So the username gets passed as a `?token=` query param.

On the server, `index.js:29-34` receives that upgrade request:

```js
wss.on('connection', (socket, request) => {
    const { query } = url.parse(request.url, true);
    const token = query.token;
```

It parses `request.url` (which is just `/?token=alice`) back apart to pull out `token`. This is the raw-WebSocket equivalent of Socket.IO's `socket.handshake.auth` — except nothing does it for you, you write the parsing yourself.

Then two guards run:

- `index.js:38-43`: no token → `socket.close(4001, 'no token provided')`.
- `index.js:46-50`: token already in use by another open socket → `socket.close(4002, 'token already connected')`.

If neither fires, the server stores `socket.username = token` and registers the socket in `tokenToSocket` (`index.js:51-56`).

Back on the client, `socket.onopen` fires (`test.html:83-86`): it logs `"connected"` and enables the **Join Room** button. If instead the server closed with `4001`/`4002`, `onopen` never fires — you'd go straight to `onclose` with that code (see step 4).

## 2. Joining a room

Click **Join Room** → `test.html:123-137` runs:

```js
socket.send(JSON.stringify({ type: 'join-room', roomId }));
```

Raw WebSockets have exactly one wire-level concept: a message is just bytes/text. There's no `socket.emit('join-room', ...)` like Socket.IO — so the client and server have privately agreed on a convention: every message is a JSON string with a `type` field, and `index.js` case-handles on that.

On the server, `index.js:65-96` is the single `'message'` handler for everything the client ever sends. It `JSON.parse`s the raw text, and if `data.type === 'join-room'`:

- removes the socket from any previous room and broadcasts `user-left` to that old room (`index.js:82-85`),
- adds the socket to `rooms.get(roomId)` — a hand-rolled `Map<roomId, Set<socket>>` (`index.js:89-92`),
- broadcasts `user-joined` to everyone else currently in the room (`index.js:95`) via the `broadcastToRoom` helper (`index.js:119-129`), which just loops the room's `Set` and calls `.send()` on each member individually — there's no `io.to(roomId).emit(...)` shortcut.

## 3. Receiving events

Every message the server sends — `user-joined` or `user-left` — lands in the client's single `socket.onmessage` handler (`test.html:88-107`). It mirrors the server's own try/catch around `JSON.parse` (`index.js:66-75`), then switches on `data.type` and logs `data.username`. So if a second browser tab (a different username) joins the same room, tab 1 sees a `user-joined` line appear in its `#log` div.

## 4. Disconnecting

Closing a tab (or the connection dropping) fires `socket.onclose` on the client (`test.html:109-115`), logging the numeric `event.code` and `event.reason` — mirroring how `server/test-client.js` logs close events from the CLI side.

On the server, the `'close'` handler (`index.js:102-112`) is the raw-WebSocket equivalent of Socket.IO's `'disconnect'`: it removes the socket from its room, broadcasts `user-left` to whoever's left, and frees the token in `tokenToSocket` so that username can reconnect later.

## The throughline

Everything `test.html` does is manually reimplementing conveniences Socket.IO normally provides for free: auth via query string instead of `handshake.auth`, a single type-tagged JSON message instead of named `emit`/`on` events, and hand-rolled room broadcast instead of `io.to(room).emit()`. That's the whole point of this project — `not-index.js` is the Socket.IO version doing the same job with those abstractions intact, for comparison.
