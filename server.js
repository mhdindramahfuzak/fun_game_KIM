import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Setup Server ---
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sajikan semua file statis dari folder 'public'
app.use(express.static(path.join(__dirname, 'public')));

// --- Routing Halaman ---
// Halaman login pemain
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// Halaman game pemain
app.get('/game', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'game.html'));
});
// Halaman display publik
app.get('/display', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'display.html'));
});
// Halaman admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});


// --- State Management Game ---
const ADMIN_PASSWORD = 'admin123'; // Password admin sederhana
let gameState = {
  status: 'idle', // idle, running, stopped
  numberPool: [],
  calledNumbers: new Set(),
  gameInterval: null,
  lastNumber: null,
  winners: [] // { name, ticketId, row, time }
};
let players = new Map(); // Menyimpan data pemain (playerId -> data)

// --- Fungsi Helper Game ---

// Fungsi utilitas untuk mengocok array
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// MEMBUAT TIKET (KUPON) - Sekarang jadi 3 baris x 5 kolom
function generateTicket() {
  const numbers = new Set();
  while (numbers.size < 15) {
    numbers.add(Math.floor(Math.random() * 90) + 1);
  }
  const arr = Array.from(numbers);
  // Bagi jadi 3 baris
  return {
    id: `T-${Math.random().toString(36).substr(2, 9)}`,
    rows: [
      arr.slice(0, 5).sort((a,b) => a-b), // Baris 1
      arr.slice(5, 10).sort((a,b) => a-b), // Baris 2
      arr.slice(10, 15).sort((a,b) => a-b) // Baris 3
    ],
    wonRows: [false, false, false] // Lacak baris yg sudah menang
  };
}

// Fungsi memulai permainan (dipicu oleh Admin)
function startGame() {
  if (gameState.status === 'running') return;

  console.log('Permainan dimulai oleh Admin!');
  gameState.status = 'running';
  gameState.numberPool = shuffle(Array.from({ length: 90 }, (_, i) => i + 1));
  gameState.calledNumbers.clear();
  gameState.winners = [];
  gameState.lastNumber = null;

  // Beri tahu semua klien (pemain, display, admin) bahwa game mulai
  io.emit('GAME_START');
  io.emit('GAME_STATE_UPDATE', gameState); // Kirim state awal

  // Panggil angka (lebih lambat, sesuai permintaan)
  gameState.gameInterval = setInterval(() => {
    if (gameState.numberPool.length > 0) {
      const newNumber = gameState.numberPool.pop();
      gameState.calledNumbers.add(newNumber);
      gameState.lastNumber = newNumber;
      
      // PANCARKAN angka baru ke semua klien
      io.emit('NEW_NUMBER', newNumber);
      console.log(`Memanggil angka: ${newNumber}`);

    } else {
      // Angka habis
      stopGame('Angka habis! Permainan seri.');
    }
  }, 6000); // Panggil angka baru setiap 6 detik (lebih lambat)
}

// Fungsi menghentikan permainan (dipicu oleh Admin)
function stopGame(message = 'Permainan dihentikan oleh Admin.') {
  if (!gameState.gameInterval) return;
  
  clearInterval(gameState.gameInterval);
  gameState.gameInterval = null;
  gameState.status = 'stopped';
  io.emit('GAME_STOP', { message });
  io.emit('GAME_STATE_UPDATE', gameState);
  console.log(message);
}


// --- Logika Koneksi Socket.IO ---
io.on('connection', (socket) => {
  console.log(`Klien baru terhubung: ${socket.id}`);

  // --- Event Halaman Login Pemain ---
  socket.on('PLAYER_LOGIN', (name) => {
    // Buat 3 tiket untuk pemain
    const tickets = [generateTicket(), generateTicket(), generateTicket()];
    const playerId = `P-${socket.id}`; // Gunakan socket.id sebagai ID pemain
    
    // Simpan data pemain di server
    players.set(playerId, {
      id: playerId,
      name: name,
      tickets: tickets,
      socketId: socket.id // Simpan socket.id terbaru
    });
    
    socket.data.playerId = playerId; // Tautkan socket ini ke playerId
    
    // Kirim balasan sukses HANYA ke pemain ini
    socket.emit('LOGIN_SUCCESS', { id: playerId, name: name });
    console.log(`Pemain ${name} (ID: ${playerId}) telah login.`);
  });

  // --- Event Halaman Game Pemain ---
  socket.on('GET_PLAYER_DATA', (playerId) => {
    // Pemain baru saja memuat /game.html, dia minta datanya.
    const player = players.get(playerId);
    if (player) {
      player.socketId = socket.id; // Update socket.id (penting jika refresh)
      socket.data.playerId = playerId;
      socket.emit('PLAYER_DATA', player); // Kirim data tiketnya
    } else {
      socket.emit('ERROR_REDIRECT', 'Data pemain tidak ditemukan, silakan login kembali.');
    }
  });

  // --- Event Halaman Admin & Display ---
  socket.on('GET_GAME_STATE', () => {
    // Admin atau Display baru terhubung, kirim state game saat ini
    socket.emit('GAME_STATE_UPDATE', gameState);
  });

  // --- Event Admin ---
  socket.on('ADMIN_LOGIN', (password) => {
    if (password === ADMIN_PASSWORD) {
      socket.emit('ADMIN_AUTHORIZED');
      socket.data.isAdmin = true;
      console.log('Admin telah login.');
    } else {
      socket.emit('ADMIN_DENIED');
    }
  });

  socket.on('ADMIN_START_GAME', () => {
    if (socket.data.isAdmin) startGame();
  });

  socket.on('ADMIN_STOP_GAME', () => {
    if (socket.data.isAdmin) stopGame();
  });

  // --- Event Klaim Kemenangan dari Pemain ---
  socket.on('CLAIM_ROW_WIN', ({ ticketId, rowIndex }) => {
    const playerId = socket.data.playerId;
    const player = players.get(playerId);

    if (!player || gameState.status !== 'running') {
      return socket.emit('CLAIM_DENIED', 'Gagal klaim: Permainan tidak sedang berjalan.');
    }

    // Cari tiket dan baris
    const ticket = player.tickets.find(t => t.id === ticketId);
    if (!ticket) return socket.emit('CLAIM_DENIED', 'Tiket tidak ditemukan.');

    if (ticket.wonRows[rowIndex]) {
      return socket.emit('CLAIM_DENIED', 'Baris ini sudah pernah diklaim.');
    }

    const rowNumbers = ticket.rows[rowIndex];
    
    // VALIDASI: Cek apakah semua angka di baris itu ADA di 'calledNumbers'
    const isWinner = rowNumbers.every(num => gameState.calledNumbers.has(num));

    if (isWinner) {
      // YA, MENANG!
      ticket.wonRows[rowIndex] = true; // Tandai baris ini sudah menang
      const winData = {
        name: player.name,
        ticketId: ticket.id,
        row: rowIndex + 1, // (index 0 jadi baris 1)
        time: new Date().toLocaleTimeString('id-ID')
      };
      gameState.winners.push(winData);

      console.log(`KLAIM SUKSES: ${player.name} menang 1 baris.`);
      
      // Kirim persetujuan ke pemain
      socket.emit('CLAIM_APPROVED', winData);
      
      // Umumkan pemenang ke Admin dan Display
      io.emit('WINNER_ANNOUNCEMENT', winData);
      // Update juga daftar pemenang di state
      io.emit('GAME_STATE_UPDATE', gameState); 

    } else {
      // KLAIM PALSU
      console.log(`KLAIM PALSU: ${player.name} di tiket ${ticketId}`);
      socket.emit('CLAIM_DENIED', 'Klaim Anda tidak valid! Angka di baris Anda belum lengkap.');
    }
  });

  // --- Saat Klien Terputus ---
  socket.on('disconnect', () => {
    console.log(`Klien terputus: ${socket.id}`);
    // Kita tidak menghapus pemain dari 'players'
    // agar mereka bisa re-connect jika me-refresh halaman.
  });
});

// --- Jalankan Server ---
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server game KIM (v2) berjalan di:`);
  console.log(`  Halaman Login  : http://localhost:${PORT}/`);
  console.log(`  Halaman Display: http://localhost:${PORT}/display`);
  console.log(`  Halaman Admin  : http://localhost:${PORT}/admin`);
});