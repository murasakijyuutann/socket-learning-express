const express = require('express');
// express is a web framework for node.js

const { createServer } = require('http');
/* { createServer } from 'http' : Node's built-in HTTP server module. We destructure just the one function we need out of it,
 same idea as importing a single static method rather than a whole class in Java. */

const { Server } = require('socket.io');
/* { Server } from 'socket.io' : Socket.IO's main class. (capitalised by convention), 
    which we'll new up in a second. This is the Socket.IO engine itself. */


const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: 'http://localhost:5173' },
})

