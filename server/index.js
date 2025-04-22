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
        currentVideoId: null,
        currentTime: 0,
        isPlaying: false,
        lastUpdated: Date.now()
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
        videoId: rooms[roomId].currentVideoId,
        time: rooms[roomId].currentTime,
        isPlaying: rooms[roomId].isPlaying
      });
    }
  });
  
  // Mevcut video bilgisi iste
  socket.on('video:get_current', ({ roomId }) => {
    if (rooms[roomId]?.currentVideoId) {
      // Odanın mevcut video zamanını, oynatma durumunu hesapla
      let currentTime = rooms[roomId].currentTime;
      const isPlaying = rooms[roomId].isPlaying;
      
      // Eğer video oynatılıyorsa, zamanı güncelle
      if (isPlaying) {
        const elapsedTime = (Date.now() - rooms[roomId].lastUpdated) / 1000;
        currentTime = rooms[roomId].currentTime + elapsedTime;
      }
      
      socket.emit('video:current', { 
        videoId: rooms[roomId].currentVideoId,
        time: currentTime,
        isPlaying: isPlaying
      });
    }
  });
  
  // Video yükleme
  socket.on('video:load', ({ roomId, videoId }) => {
    if (rooms[roomId]) {
      rooms[roomId].currentVideoId = videoId;
      rooms[roomId].currentTime = 0;
      rooms[roomId].isPlaying = true;
      rooms[roomId].lastUpdated = Date.now();
      
      // Tüm odaya yayın yap
      io.to(roomId).emit('video:load', { videoId });
    }
  });
  
  // Video kontrolleri
  socket.on('video:play', (data) => {
    const { roomId, time, timestamp } = data;
    
    if (rooms[roomId]) {
      rooms[roomId].isPlaying = true;
      rooms[roomId].currentTime = time;
      rooms[roomId].lastUpdated = Date.now();
      
      // Tüm odaya yayın yap (kendisi dahil) - timestamp'i koru
      io.to(roomId).emit('video:play', { ...data });
    } else {
      // Sadece diğerlerine gönder
      socket.to(currentRoom).emit('video:play', { ...data });
    }
  });
  
  socket.on('video:pause', (data) => {
    const { roomId, time, timestamp } = data;
    
    if (rooms[roomId]) {
      rooms[roomId].isPlaying = false;
      rooms[roomId].currentTime = time;
      rooms[roomId].lastUpdated = Date.now();
      
      // Tüm odaya yayın yap (kendisi dahil) - timestamp'i koru
      io.to(roomId).emit('video:pause', { ...data });
    } else {
      // Sadece diğerlerine gönder
      socket.to(currentRoom).emit('video:pause', { ...data });
    }
  });
  
  socket.on('video:seek', (data) => {
    const { roomId, time, timestamp } = data;
    
    if (rooms[roomId]) {
      rooms[roomId].currentTime = time;
      rooms[roomId].lastUpdated = Date.now();
      
      // Tüm odaya yayın yap (kendisi dahil) - timestamp'i koru
      io.to(roomId).emit('video:seek', { ...data });
    } else {
      // Sadece diğerlerine gönder
      socket.to(currentRoom).emit('video:seek', { ...data });
    }
  });
  
  socket.on('video:sync', (data) => {
    const { roomId, time, isPlaying, videoId, timestamp } = data;
    
    if (rooms[roomId]) {
      if (videoId) {
        rooms[roomId].currentVideoId = videoId;
      }
      
      rooms[roomId].currentTime = time;
      rooms[roomId].isPlaying = isPlaying;
      rooms[roomId].lastUpdated = Date.now();
      
      // Tüm odaya yayın yap (kendisi dahil) - timestamp'i koru
      io.to(roomId).emit('video:sync', { ...data });
    } else {
      // Sadece diğerlerine gönder
      socket.to(currentRoom).emit('video:sync', { ...data });
    }
  });
  
  // Force Sync özelliği ekle - odadakileri zorla senkronize et
  socket.on('video:force_sync', (data) => {
    const { roomId, timestamp } = data;
    
    if (rooms[roomId]) {
      // Zorla senkronizasyon istendi, odanın durumunu güncelle
      if (data.time !== undefined) rooms[roomId].currentTime = data.time;
      if (data.isPlaying !== undefined) rooms[roomId].isPlaying = data.isPlaying;
      if (data.videoId !== undefined) rooms[roomId].currentVideoId = data.videoId;
      rooms[roomId].lastUpdated = Date.now();
      
      // Tüm odaya yayın yap - timestamp'i koru
      io.to(roomId).emit('video:force_sync', { ...data });
    }
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
