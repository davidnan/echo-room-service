require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');

const {initMongoDB, Room, User} = require("./mongoUtils");
const {createRoom, roomExits, joinRoom, openConnectionToRoom, closeConnectionToRoom, handleMessagesOnWs} = require("./roomUtils");
const {getUserAuthenticationInfo} = require("./checkAuth");

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
app.post('/get_rooms', async (req, res) => {
    const rooms = await Room.find({});
    console.log("Rooms: " + rooms);
    res.json(rooms);
})
app.post('/delete_room/', async (req, res) => {

    const userAuthData = await getUserAuthenticationInfo(req.body.accessToken)
    let requestingUser = await User.findOne({ uid: userAuthData.uid });
    if (!requestingUser || requestingUser.permissions !== 1) {
        return res.status(403).json({ message: 'Forbidden: You do not have permission to delete rooms' });
    }
    const roomCode = req.body.roomCode;
    console.log("RoomCode: " + roomCode);
    try {
      for (const client of wss.clients) {
        if (client.user.roomCode === roomCode) {
            client.close();
        }
      }
      const room = await Room.findOneAndDelete({ code: roomCode });
        if (!room) {
            return res.status(404).json({ message: 'Room not found' });
        }
        res.status(200).json({ message: 'Room deleted successfully' });
    } catch (error) {
        console.error('Error deleting room:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/get_user_data', async (req, res) => {
    const accessToken = req.body.accessToken;
    const userAuthData = await getUserAuthenticationInfo(req.body.accessToken)
    console.log(userAuthData)
    let currentUser = await User.findOne({ uid: userAuthData.uid });
    console.log(currentUser);
    if (!currentUser) {
        const newUser = new User({
            accessToken: accessToken, permission: 0 , email: req.body.email, name: req.body.displayName, uid: userAuthData.uid});
        await newUser.save();
        currentUser = newUser;
    }
    console.log(req.body)
    try {
        res.json(currentUser);
    } catch (e) {
        res.status(401).send('Invalid Credentials');
    }
})

app.post('/update_display_name', async (req, res) => {
    const userAuthData = await getUserAuthenticationInfo(req.body.accessToken)
    let currentUser = await User.findOne({ uid: userAuthData.uid });
    const newName = req.body.displayName;
    if (!currentUser) {
        res.status(401).send('Invalid Credentials');
        return;
    }
    currentUser.name = newName;
    await currentUser.save();
    res.status(200).send('Name updated successfully');
})

server.listen(port, () => {
  console.log(`[info] Echo Room express Service running on port ${port}`);
  console.log(`[info] Echo Room Web Socket Service running on port ${port}`);
  initMongoDB(process.env.MONGODB_URI).then(() => console.log('[info] Connected to MongoDB'));
});
