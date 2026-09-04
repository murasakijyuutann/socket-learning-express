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
  cors: { origin: '*' },
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  console.log('middleware saw token:', token);

  if (!token) {
    return next(new Error('no token provided'));
  }
  
  // TEMP: fake validation, just checking it's non-empty for now.
  // Real validation (JWT verify, DB lookup) comes later once auth exists for real.
  socket.username = token; // stash something on the socket for later use

  next(); // allow connection to proceed
});
  

io.on('connection', (socket) => {
    console.log('a user connected:', socket.id);
    let currentRoom = null; // tracks which room THIS socket is in, across events

    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        currentRoom = roomId; // remember it for later (disconnect needs this)
        console.log(`${socket.id} joined room: ${roomId}`);

        // broadcast the user's join to all other users in the room
        socket.to(roomId).emit('user-joined', socket.id);
    })

    socket.on('disconnect', () => {
        console.log(`${socket.id} left room`);
        if (currentRoom) {
            socket.to(currentRoom).emit('user-left', socket.id);
        }
    });
});

