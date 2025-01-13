require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');

const {initMongoDB, Room} = require("./mongoUtils");
const {createRoom, roomExits, joinRoom, openConnectionToRoom, closeConnectionToRoom, handleMessagesOnWs} = require("./roomUtils");

const app = express();
app.use(express.json());
app.use(cors())
const server = http.createServer(app); // Pass 'app' to the server to handle HTTP requests
const port = 2315;

// Set up WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', async function connection(ws) {
  console.log('New client connected');
  ws.server = wss
  ws.on('message', (data) => handleMessagesOnWs(ws, data));
  ws.on('close', () => closeConnectionToRoom(ws));
});


// Route to get room information
app.get('/', async (req, res) => {
});

// check the user auth, create the room, add the user to the room, make it owner
app.post('/create_room',  (req, res) => createRoom(req, res));
// check if the room exits check the user auth
app.post('/join_room',  (req, res) => joinRoom(req, res));

server.listen(port, () => {
  console.log(`[info] Echo Room express Service running on port ${port}`);
  console.log(`[info] Echo Room Web Socket Service running on port ${port}`);
  initMongoDB(process.env.MONGODB_URI).then(() => console.log('[info] Connected to MongoDB'));
});
