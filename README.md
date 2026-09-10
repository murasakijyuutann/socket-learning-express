# socket-learning

This project aims to learn Socket.IO's root WebSocket technology, with the final objective being a live watch party app where users can connect, watch, and chat with each other while connected in the watch party room.

## Structure

- `server/index.js` — raw `ws` WebSocket server (rooms, tokens, and broadcasting built by hand).
- `server/not-index.js` — the same server logic built with Socket.IO, for comparison.
- `client/test.html` — browser test client for the raw WebSocket server.
- `docs/websocket-flow-walkthrough.md` — step-by-step walkthrough of the connect → join → message → disconnect flow.

## Running

```bash
cd server
npm install
npm run dev
```

Then open `client/test.html` in a browser to connect.
