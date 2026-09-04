
// Step 1
const express = require('express');
// express is a web framework for node.js

const { createServer } = require('http');
/* { createServer } from 'http': Node's built-in HTTP server module. We destructure just
   the one function we need out of it — similar to a Java static import of a single method
   from a utility class, rather than referencing the whole module each time. */

const { Server } = require('socket.io');
/* { Server } from 'socket.io': Socket.IO's main class (capitalized by convention),
   which we'll `new` up in a second. This is the Socket.IO engine itself. */

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: 'http://localhost:5173' },
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Step 2  Connect the server to Socket.IO
