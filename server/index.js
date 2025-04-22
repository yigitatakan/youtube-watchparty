const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['https://youtube-watchparty.vercel.app', 'http://localhost:5173'],
    methods: ['GET', 'POST'],
  },
});

// Odaları ve kullanıcıları takip etmek için
const rooms = {};

io.on('connection', (socket) => {
  console.log('Yeni bağlantı:', socket.id);
  
  // Kullanıcı bilgileri
  let userId = '';
  let displayName = '';
  let currentRoom = '';

  // Odaya katılma
  socket.on('room:join', ({ roomId, userId: uid, displayName: name }) => {
    userId = uid;
    displayName = name;
    currentRoom = roomId;
    
    socket.join(roomId);
    
    // Odayı oluştur veya güncelle
    if (!rooms[roomId]) {
      rooms[roomId] = { 
        participants: [], 
        currentVideoId: null 
      };
    }
    
    // Kullanıcıyı ekle
    rooms[roomId].participants.push({
      userId,
      displayName,
      isHost: rooms[roomId].participants.length === 0,
    });
    
    // Kullanıcıya mevcut odanın bilgilerini gönder
    socket.emit('room:participants', { 
      participants: rooms[roomId].participants 
    });
    
    // Diğer kullanıcılara yeni katılımcıyı bildir
    socket.to(roomId).emit('room:user-joined', { 
      participant: { userId, displayName, isHost: false } 
    });
    
    // Mevcut videoyu gönder
    if (rooms[roomId].currentVideoId) {
      socket.emit('video:current', { 
        videoId: rooms[roomId].currentVideoId 
      });
    }
  });
  
  // Mevcut video bilgisi iste
  socket.on('video:get_current', ({ roomId }) => {
    if (rooms[roomId]?.currentVideoId) {
      socket.emit('video:current', { 
        videoId: rooms[roomId].currentVideoId 
      });
    }
  });
  
  // Video yükleme
  socket.on('video:load', ({ roomId, videoId }) => {
    if (rooms[roomId]) {
      rooms[roomId].currentVideoId = videoId;
      io.to(roomId).emit('video:load', { videoId });
    }
  });
  
  // Video kontrolleri
  socket.on('video:play', (data) => {
    socket.to(currentRoom).emit('video:play', data);
  });
  
  socket.on('video:pause', (data) => {
    socket.to(currentRoom).emit('video:pause', data);
  });
  
  socket.on('video:seek', (data) => {
    socket.to(currentRoom).emit('video:seek', data);
  });
  
  socket.on('video:sync', (data) => {
    socket.to(currentRoom).emit('video:sync', data);
  });
  
  // Chat mesajları
  socket.on('chat:message', ({ roomId, message }) => {
    message.displayName = displayName;
    message.userId = userId;
    io.to(roomId).emit('chat:message', { message });
  });
  
  // Odadan ayrılma
  socket.on('room:leave', ({ roomId, userId }) => {
    if (rooms[roomId]) {
      rooms[roomId].participants = rooms[roomId].participants.filter(
        (p) => p.userId !== userId
      );
      
      socket.to(roomId).emit('room:user-left', { userId });
      
      // Oda boşsa odayı sil
      if (rooms[roomId].participants.length === 0) {
        delete rooms[roomId];
      }
    }
    socket.leave(roomId);
  });
  
  // Bağlantı koptuğunda
  socket.on('disconnect', () => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom].participants = rooms[currentRoom].participants.filter(
        (p) => p.userId !== userId
      );
      
      socket.to(currentRoom).emit('room:user-left', { userId });
      
      // Oda boşsa odayı sil
      if (rooms[currentRoom].participants.length === 0) {
        delete rooms[currentRoom];
      }
    }
  });
});

// Basit sağlık kontrolü
app.get('/', (req, res) => {
  res.send('YouTube Sync Server çalışıyor!');
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Socket.io sunucusu ${PORT} portunda çalışıyor`);
});
