// MongoDB connection
const mongoose = require('mongoose');

const { Schema } = mongoose;


const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  uid: { type: String, required: true },
  permissions: { type: Number, default: 0 }, // bitmask for user permissions
})


const songSchema = new Schema({
  title: { type: String, required: true },
  uid: { type: String, required: true },
})

const roomSchema = new Schema({
  owner: { type: userSchema, required: true }, // Owner of the room (string)
  roomName: { type: String, required: true }, // Name of the room (string)
  code: { type: String, required: true }, // Room code (string)
  users: {
    type: [userSchema],
    default: []
  },
  authorizedUsers: { type: [String], default: [] },
  songs: {
    type: [songSchema], // Array of song titles or IDs (array of strings)
    default: []
  }
});

const User = mongoose.model("User", userSchema);
const Song = mongoose.model("Song", songSchema);
const Room = mongoose.model('Room', roomSchema);

async function initMongoDB(MONGO_URI) {
    await mongoose.connect(MONGO_URI)
}

exports.initMongoDB = initMongoDB;
exports.User = User;
exports.Song = Song;
exports.Room = Room
