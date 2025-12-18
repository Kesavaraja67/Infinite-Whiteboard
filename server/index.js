import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// --- 1. CONNECT TO MONGODB ---
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ FATAL ERROR: MONGO_URI is missing in .env file");
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// --- 2. DEFINE DATABASE SCHEMA ---
const RoomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  drawHistory: { type: Array, default: [] },
  chatHistory: { type: Array, default: [] }
});

const Room = mongoose.model('Room', RoomSchema);

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // --- JOIN ROOM (Load from DB) ---
  socket.on('join-room', async (roomId, userName) => {
    socket.join(roomId);
    socket.data.roomId = roomId;

    try {
      let room = await Room.findOne({ roomId });

      if (!room) {
        room = new Room({ roomId, drawHistory: [], chatHistory: [] });
        await room.save();
      }

      socket.emit('sync-board', room.drawHistory);
      socket.emit('sync-chat', room.chatHistory);
    } catch (err) {
      console.error("Error loading room:", err);
    }
  });

  // --- DRAWING (Save to DB) ---
  socket.on('draw', async (data) => {
    const { roomId, drawOptions } = data;

    // Broadcast immediately
    socket.to(roomId).emit('draw', drawOptions);

    // Save to DB
    try {
      await Room.updateOne({ roomId }, { $push: { drawHistory: drawOptions } });
    } catch (err) {
      console.error("Error saving drawing:", err);
    }
  });

  // --- UPDATE HISTORY (For Moving Items) ---
  socket.on('update-history', async ({ roomId, newHistory }) => {
    socket.to(roomId).emit('update-history', newHistory);
    try {
      await Room.updateOne({ roomId }, { $set: { drawHistory: newHistory } });
    } catch (err) {
      console.error("Error updating history:", err);
    }
  });

  // --- CURSORS ---
  socket.on('cursor-move', (data) => {
    socket.to(data.roomId).emit('cursor-move', data);
  });

  // --- UNDO ---
  socket.on('undo', async (roomId) => {
    try {
      const room = await Room.findOne({ roomId });
      if (room && room.drawHistory.length > 0) {
        room.drawHistory.pop();
        await room.save();
        io.to(roomId).emit('sync-board', room.drawHistory);
      }
    } catch (err) {
      console.error("Undo error:", err);
    }
  });

  // --- CLEAR BOARD ---
  socket.on('clear', async (roomId) => {
    try {
      await Room.updateOne({ roomId }, { $set: { drawHistory: [] } });
      io.to(roomId).emit('sync-board', []);
    } catch (err) {
      console.error("Clear error:", err);
    }
  });

  // --- CHAT ---
  socket.on('send-message', async (data) => {
    const { roomId } = data;
    socket.to(roomId).emit('receive-message', data);
    try {
      await Room.updateOne({ roomId }, { $push: { chatHistory: data } });
    } catch (err) {
      console.error("Chat save error:", err);
    }
  });

  // --- DISCONNECT ---
  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (roomId) {
      socket.to(roomId).emit('user-disconnected', socket.id);
    }
  });
});

// --- DEPLOYMENT FIX: USE DYNAMIC PORT ---
const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`SERVER RUNNING on port ${PORT}`);
});