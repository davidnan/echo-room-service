const { getUserAuthenticationInfo, isAuthenticated, admin, setUserAuthenticationRequest}= require("./checkAuth");
const { Room, User, Song} = require("./mongoUtils");

function codeGenerator() {
    return 'xyxxx-xyxyx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

async function createUserFromAuth(userInfo, permissions=0) {
    const userProfile = await User.findOne({uid: userInfo.uid});
    console.log(userInfo)
    if (userProfile) {
        userInfo.name = userProfile.name;
    }
    return new User({
        name: userInfo.name,
        email: userInfo.email,
        uid: userInfo.uid,
        permissions: permissions
    })
}

async function saveRoom(userInfo) {
    const owner = await createUserFromAuth(userInfo, 1);
    const room = new Room({
        owner: owner,
        code: codeGenerator(),
        users: [],
        authorizedUsers: [userInfo.uid],
        songs: [],
        roomName: owner.name + "'s Room",
    })
    await room.save()
    return room.code
}

async function createRoom(req, res) {
    const loginInformation = await setUserAuthenticationRequest(req, res);
    if (loginInformation === null) {
        res.status(301).send("Not authorized");
    }
    const roomCode = await saveRoom(loginInformation);
    res.status(200).send(roomCode);
}

async function joinRoom(req, res) {
    const loginInformation = await setUserAuthenticationRequest(req, res);
    if (loginInformation === null) {
        res.status(301).send("Not authorized");
        return;
    }
    const code = req.body.code;
    const room = await Room.findOne({code: code})
    if (room === undefined) {
        res.status(404).send('Room not found');
        return;
    }
    if (room.users.find(u => loginInformation.uid === u.uid)) {
        res.status(401).send("Not authorized");
        return;
    }
    console.log(room.users);
    if (!room.authorizedUsers.includes(loginInformation.userId)) {
        room.authorizedUsers.push(loginInformation.uid);
        await room.save()
    }
    res.status(200).send(code);

}

async function deleteRoom(code) {
    await Room.findOneAndDelete({code: code})
}

function getUidFromURL(url) {
    let VID_REGEX =
        /(?:youtube(?:-nocookie)?\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

    return url.match(VID_REGEX)[1]
}

async function getSongTitle(songUid) {
    const apiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${songUid}&key=${process.env.YOUTUBE_API_KEY}&part=snippet`
    const response = await fetch(apiUrl);
    const data = await response.json();

    try {
        return data.items[0].snippet.title
    }
    catch (e) {
        return "Unknown title"
    }
}

async function addSong(ws, dataJson) {
    const songUid = getUidFromURL(dataJson.url);
    const room = await Room.findOne({code: ws.user.roomCode})
    const song = new Song({
        title: await getSongTitle(songUid),
        uid: songUid,
    })
    room.songs.push(song);
    await room.save()
    const songsJson = {
        type: "songs",
        songs: room.songs
    }
    console.log(songsJson)
    ws.server.clients.forEach(client => {
        if (client.user.roomCode === ws.user.roomCode) {
            client.send(JSON.stringify(songsJson))
        }
    })
}

async function changeSongOrder(ws, dataJson) {
    const room = await Room.findOne({code: ws.user.roomCode})
    const user = room.users.find(u => u.uid === ws.user.uuid)
    if (user === null || !(user.permissions & 1)) {
        return
    }
    room.songs = dataJson.songs

    await room.save()
    await sendQueueSongs(ws, room)
}

async function changeRoomName(ws, dataJson) {
    const room = await Room.findOne({code: ws.user.roomCode})
    const user = room.users.find(u => u.uid === ws.user.uuid)
    if (user === null || !(user.permissions & 1)) {
        return
    }
    room.roomName = dataJson.roomName
    await room.save()
    await sendRoomName(ws, room)
}

async function removeSong(ws, dataJson) {
    const room = await Room.findOne({code: ws.user.roomCode})
    const user = room.users.find(u => u.uid === ws.user.uuid)
    if (user === null || !(user.permissions & 1)) {
        return
    }
    const songIndex = room.songs.findIndex(s => s.uid === dataJson.songUid)
    if (songIndex === -1) {
        return
    }
    room.songs.splice(songIndex, 1)
    await room.save()
    await sendQueueSongs(ws, room)
}

async function kickUser(ws, dataJson) {
    const roomDb = await Room.findOne({code: ws.user.roomCode})
    const user = roomDb.users.find(u => u.uid === ws.user.uuid)
    if (user === null || !(user.permissions & 1)) {
        return
    }

    ws.server.clients.forEach(client => {
        console.log(JSON.stringify(client.user))
        if (client.user.roomCode === ws.user.roomCode && client.user.uuid === dataJson.userUuid) {
            client.close();
        }
    })
    await deleteUser(roomDb, dataJson.userUid)

    await sendConnectedUsers(ws, roomDb)
}

async function openConnectionToRoom(ws, dataJson) {
    try{
        const userData = await getUserAuthenticationInfo(dataJson.accessToken)
        ws.user = {
            uuid: userData.uid,
            roomCode: dataJson.code
        }
        const room = await Room.findOne({code: dataJson.code})
        if (!room.authorizedUsers.includes(userData.uid)) {
            ws.close()
        }
        const permissions = room.owner.uid === userData.uid ? 1 : 0;
        const userDbObj = await createUserFromAuth(userData, permissions);
        room.users.push(userDbObj)
        await room.save()

        await sendConnectedUsers(ws, room)
        await sendQueueSongs(ws, room)
        await sendRoomName(ws, room)
    }
    catch (e) {
        ws.close()
        return null;
    }
}

async function deleteUser(room, uuid) {
    let index = room.users.findIndex(u => u.uid === uuid);
    if (index !== -1) {
        room.users.splice(index, 1);
    }
    index = room.authorizedUsers.findIndex(u => u === uuid);
    if (index !== -1) {
        room.authorizedUsers.splice(index, 1);
    }
    await room.save()
}

async function sendConnectedUsers(ws, room) {
    const usersJson = {
        type: "users",
        users: room.users
    }
    console.log("Users:" + JSON.stringify(usersJson))

    ws.server.clients.forEach(client => {
        if (client.user.roomCode === ws.user.roomCode) {
            client.send(JSON.stringify(usersJson))
        }
    })
}

async function sendQueueSongs(ws, room) {

    const songsJson = {
        type: "songs",
        songs: room.songs
    }
    console.log(songsJson)
    ws.server.clients.forEach(client => {
        if (client.user.roomCode === ws.user.roomCode) {
            client.send(JSON.stringify(songsJson))
        }
    })
}

async function sendRoomName(ws, room) {
    const roomNameJson = {
        type: "roomName",
        roomName: room.roomName
    }
    console.log("seending room anem:" + roomNameJson)
    ws.server.clients.forEach(client => {
        if (client.user.roomCode === ws.user.roomCode) {
            client.send(JSON.stringify(roomNameJson))
        }
    })
}

async function closeConnectionToRoom(ws) {
    const room = await Room.findOne({code: ws.user.roomCode})
    try{
        const user = room.users.find(u => u.uid === ws.user.uuid)
        if (user === null) {
            return;
        }
        if (user.permissions & 1) {
            ws.server.clients.forEach(client => {
                if (client.user.roomCode === ws.user.roomCode) {
                    client.close();
                }
            })
            await deleteUser(room, ws.user.uuid)
            await deleteRoom(ws.user.roomCode)
        }
        else {
            await deleteUser(room, ws.user.uuid)
            await sendConnectedUsers(ws, room)
        }
    }
    catch (e) {
        console.error("User " + ws.user.uuid + " left with an error: ", e)
    }
    console.log("user: " + ws.user.uuid + " disconnected from: " + ws.user.roomCode);
}

async function getNextSong(ws) {
    const room = await Room.findOne({code: ws.user.roomCode})
    const user = room.users.find(u => u.uid === ws.user.uuid)
    if (user === null || !(user.permissions & 1)) {
        return
    }
    const nextSong = room.songs.pop()
    console.log("nextSong: " + nextSong)
    await room.save()
    let data = {
        type: "next_song",
    }
    if (nextSong) {
       data.songUid = nextSong.uid
    }
    ws.send(JSON.stringify(data))

    await sendQueueSongs(ws, room)
}

async function handleMessagesOnWs(ws, data) {
    let jsonData = undefined
    try{
        console.log(data)
        jsonData = JSON.parse(data);
    }
    catch (e) {
        ws.close()
        return null;
    }

    console.log("json data join : " + JSON.stringify(jsonData));
    // console.log(jsonData)
    switch (jsonData.type) {
        case 'join':
            await openConnectionToRoom(ws, jsonData)
            break;
        case 'add_song':
            console.log(jsonData);
            await addSong(ws, jsonData);
            break;
        case 'get_next_song':
            await getNextSong(ws);
            break;
        case 'reorder_songs':
            await changeSongOrder(ws, jsonData);
            break;
        case 'update_room_name':
            await changeRoomName(ws, jsonData);
            break;
        case "remove_song":
            await removeSong(ws, jsonData);
            break;
        case "kick_user":
            await kickUser(ws, jsonData);
            break;


    }
}

exports.createRoom = createRoom
exports.joinRoom = joinRoom
exports.handleMessagesOnWs = handleMessagesOnWs;
exports.closeConnectionToRoom = closeConnectionToRoom

exports.roomExits = async function (roomCode) {
    const room = await Room.findOne({code: roomCode})
    return !!room;
}
