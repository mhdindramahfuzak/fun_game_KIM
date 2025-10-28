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

app.use(express.static(path.join(__dirname, 'public')));

// --- Routing Halaman ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/game', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game.html')));
app.get('/display', (req, res) => res.sendFile(path.join(__dirname, 'public', 'display.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html'))); // Pastikan nama file ini benar (html/htm)
app.get('/monitor', (req, res) => res.sendFile(path.join(__dirname, 'public', 'monitor.html'))); // <-- Rute Baru

// --- State Management Game ---
const ADMIN_PASSWORD = 'admin123';
let gameState = {
  status: 'idle', // idle, running, paused, stopped
  calledNumbers: new Set(),
  lastNumber: null,
  winners: [],
  maxWinners: 10, // Default, bisa diubah admin
  winCondition: '1_row', // Default (1_row, 2_rows, full_house), bisa diubah admin
  isPaused: false, // Untuk tombol pause manual
};
let players = new Map(); // playerId -> { id, name, tickets: [{id, rows:[[],[]], cols:[[],[],[]], allNumbers:[], wonRows: [false,false], wonCols: [false,false,false], isComplete: false, color}, ...], socketId }

// --- Fungsi Helper Game ---

// MEMBUAT TIKET BARU (3 Kolom x 2 Baris = 6 Angka)
function generateTicket(color) {
  const numbers = new Set();
  while (numbers.size < 6) {
    numbers.add(Math.floor(Math.random() * 90) + 1);
  }
  const arr = Array.from(numbers);
  // Bagi jadi 3 kolom @ 2 angka
  const cols = [
    [arr[0], arr[1]].sort((a,b)=>a-b), // Kolom 1
    [arr[2], arr[3]].sort((a,b)=>a-b), // Kolom 2
    [arr[4], arr[5]].sort((a,b)=>a-b)  // Kolom 3
  ];
  // Buat representasi baris juga untuk validasi
  const rows = [
      [cols[0][0], cols[1][0], cols[2][0]].sort((a,b)=>a-b), // Baris 1 (angka pertama tiap kolom)
      [cols[0][1], cols[1][1], cols[2][1]].sort((a,b)=>a-b)  // Baris 2 (angka kedua tiap kolom)
  ];

  return {
    id: `T-${Math.random().toString(36).substr(2, 9)}`,
    rows: rows, // 2 baris x 3 angka
    cols: cols, // 3 kolom x 2 angka (untuk display)
    allNumbers: arr, // Semua 6 angka
    wonRows: [false, false],
    isComplete: false, // Untuk full house
    color: color
  };
}

// Fungsi memulai permainan (dipicu oleh Admin dengan setting)
function startGame(settings) {
  if (gameState.status === 'running' || gameState.status === 'paused') return;

  console.log('Permainan dimulai oleh Admin!', settings);
  gameState.status = 'running';
  gameState.calledNumbers.clear();
  gameState.winners = [];
  gameState.lastNumber = null;
  gameState.isPaused = false;
  gameState.maxWinners = settings.maxWinners || 10;
  gameState.winCondition = settings.winCondition || '1_row';

  // Reset status tiket pemain
   players.forEach(player => {
    player.tickets.forEach(ticket => {
      ticket.wonRows = [false, false];
      ticket.isComplete = false;
    });
   });

  io.emit('GAME_START', { winCondition: gameState.winCondition }); // Kirim kondisi menang
  io.emit('GAME_STATE_UPDATE', gameState); // Kirim state awal
}

// Fungsi menghentikan permainan (dipicu oleh Admin)
function stopGame(message = 'Permainan dihentikan oleh Admin.') {
  if (gameState.status === 'idle' || gameState.status === 'stopped') return;

  gameState.status = 'stopped';
  gameState.isPaused = false; // Pastikan tidak paused saat stop
  io.emit('GAME_STOP', { message });
  io.emit('GAME_STATE_UPDATE', gameState);
  console.log(message);
}

// Fungsi Pause/Resume (dipicu Admin)
function togglePauseGame() {
    if (gameState.status !== 'running' && gameState.status !== 'paused') return;

    gameState.isPaused = !gameState.isPaused;
    gameState.status = gameState.isPaused ? 'paused' : 'running';
    io.emit('GAME_PAUSE_TOGGLE', gameState.isPaused); // Kirim status pause
    io.emit('GAME_STATE_UPDATE', gameState); // Update state
    console.log(`Permainan ${gameState.isPaused ? 'dipause' : 'dilanjutkan'}.`);
}


// --- Logika Koneksi Socket.IO ---
io.on('connection', (socket) => {
  console.log(`Klien baru terhubung: ${socket.id}`);

  // --- Event Login Pemain ---
  socket.on('PLAYER_LOGIN', (name) => {
    // Validasi Nama Unik (case-insensitive)
    let nameExists = false;
    for (const player of players.values()) {
      if (player.name.toLowerCase() === name.toLowerCase()) {
        nameExists = true;
        break;
      }
    }
    if (nameExists) {
      return socket.emit('LOGIN_FAILED', 'Nama ini sudah digunakan pemain lain.');
    }

    // Buat 3 tiket dengan warna berbeda
    const tickets = [
        generateTicket('kuning'),
        generateTicket('hijau'),
        generateTicket('putih')
    ];
    const playerId = `P-${socket.id}`;
    players.set(playerId, { id: playerId, name: name, tickets: tickets, socketId: socket.id });
    socket.data.playerId = playerId;

    socket.emit('LOGIN_SUCCESS', { id: playerId, name: name });
    console.log(`Pemain ${name} (ID: ${playerId}) telah login.`);
  });

  // --- Event Halaman Game Pemain ---
  socket.on('GET_PLAYER_DATA', (playerId) => {
    const player = players.get(playerId);
    if (player) {
      player.socketId = socket.id;
      socket.data.playerId = playerId;
      socket.emit('PLAYER_DATA', player);
      // Kirim juga state game saat ini agar sinkron
      socket.emit('GAME_STATE_UPDATE', gameState);
    } else {
      socket.emit('ERROR_REDIRECT', 'Data pemain tidak ditemukan, silakan login kembali.');
    }
  });

  // --- Event Halaman Admin, Display, Monitor ---
  socket.on('GET_GAME_STATE', () => {
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

  socket.on('ADMIN_START_GAME', (settings) => { // Terima settings dari admin
    if (socket.data.isAdmin) startGame(settings);
  });

  socket.on('ADMIN_STOP_GAME', () => {
    if (socket.data.isAdmin) stopGame();
  });

  socket.on('ADMIN_TOGGLE_PAUSE', () => { // Event baru untuk pause/resume
      if (socket.data.isAdmin) togglePauseGame();
  });

  // Event BARU: Admin memanggil angka secara manual
  socket.on('ADMIN_CALL_NUMBER', (number) => {
    if (!socket.data.isAdmin) return; // Hanya admin
    if (gameState.status !== 'running') return; // Hanya jika game berjalan (tidak dipause/stop)
    if (gameState.calledNumbers.has(number)) return; // Jangan panggil angka yg sama

    console.log(`Admin memanggil angka: ${number}`);
    gameState.calledNumbers.add(number);
    gameState.lastNumber = number;

    // Broadcast ke SEMUA klien (Player, Display, Monitor, Admin lain)
    io.emit('NEW_NUMBER', number);
    io.emit('GAME_STATE_UPDATE', gameState); // Update state (terutama calledNumbers)
  });

  // --- Event Klaim Kemenangan dari Pemain ---
  socket.on('CLAIM_WIN', (ticketId) => { // Hanya perlu ID tiket
    const playerId = socket.data.playerId;
    const player = players.get(playerId);

    // Validasi Dasar
    if (!player || (gameState.status !== 'running' && gameState.status !== 'paused')) { // Boleh klaim saat paused
      return socket.emit('CLAIM_DENIED', 'Gagal klaim: Permainan tidak sedang/sedang dijeda.');
    }
    if (gameState.winners.length >= gameState.maxWinners) {
       return socket.emit('CLAIM_DENIED', 'Maaf, kuota pemenang sudah terpenuhi.');
    }

    const ticket = player.tickets.find(t => t.id === ticketId);
    if (!ticket) return socket.emit('CLAIM_DENIED', 'Tiket tidak ditemukan.');

    // Validasi Kondisi Menang
    let isWinner = false;
    let winDescription = ''; // Deskripsi kemenangan (misal: "Baris 1")

    // Cek berapa banyak baris yg sudah komplit di tiket ini
    let completedRowsCount = 0;
    ticket.rows.forEach((row, index) => {
        if (!ticket.wonRows[index] && row.every(num => gameState.calledNumbers.has(num))) {
            completedRowsCount++;
        }
    });

    // Cek full house
    let isFullHouse = ticket.allNumbers.every(num => gameState.calledNumbers.has(num));

    // Validasi berdasarkan gameState.winCondition
    if (gameState.winCondition === '1_row') {
        // Cari baris pertama yang komplit DAN BELUM diklaim
        let winningRowIndex = -1;
        for(let i=0; i < ticket.rows.length; i++){
            if(!ticket.wonRows[i] && ticket.rows[i].every(num => gameState.calledNumbers.has(num))){
                winningRowIndex = i;
                break;
            }
        }
        if (winningRowIndex !== -1) {
            isWinner = true;
            winDescription = `Baris ${winningRowIndex + 1}`;
            ticket.wonRows[winningRowIndex] = true; // Tandai baris ini sudah menang
        }
    } else if (gameState.winCondition === '2_rows') {
        // Harus ada TEPAT 2 baris komplit yg BELUM diklaim sebelumnya
        let newlyCompletedRows = [];
        ticket.rows.forEach((row, index) => {
            if(!ticket.wonRows[index] && row.every(num => gameState.calledNumbers.has(num))){
                newlyCompletedRows.push(index);
            }
        });
        if(newlyCompletedRows.length >= 2){ // Cukup 2 baris baru yg komplit
             isWinner = true;
             winDescription = `2 Baris (Baris ${newlyCompletedRows[0]+1} & ${newlyCompletedRows[1]+1})`;
             // Tandai kedua baris
             ticket.wonRows[newlyCompletedRows[0]] = true;
             ticket.wonRows[newlyCompletedRows[1]] = true;
        }
    } else if (gameState.winCondition === 'full_house') {
        if (!ticket.isComplete && isFullHouse) {
            isWinner = true;
            winDescription = 'Full House';
            ticket.isComplete = true; // Tandai full house
        }
    }

    // Proses Hasil Validasi
    if (isWinner) {
      const winData = {
        name: player.name,
        ticketId: ticket.id,
        description: winDescription, // Pakai deskripsi
        time: new Date().toLocaleTimeString('id-ID')
      };
      gameState.winners.push(winData);
      console.log(`KLAIM SUKSES: ${player.name} menang ${winDescription}.`);
      socket.emit('CLAIM_APPROVED', winData);
      io.emit('WINNER_ANNOUNCEMENT', winData);
      io.emit('GAME_STATE_UPDATE', gameState);

      // Cek apakah kuota pemenang sudah tercapai
      if (gameState.winners.length >= gameState.maxWinners) {
        // Beri sedikit jeda sebelum menghentikan game
        setTimeout(() => {
             // Pastikan game belum dihentikan manual oleh admin
             if(gameState.status === 'running' || gameState.status === 'paused'){
                 stopGame('Kuota pemenang telah tercapai!');
             }
        }, 1000); // Jeda 1 detik
      }
    } else {
      console.log(`KLAIM GAGAL/PALSU: ${player.name} di tiket ${ticketId}`);
      socket.emit('CLAIM_DENIED', `Klaim Anda tidak valid untuk kondisi "${gameState.winCondition.replace('_', ' ')}"!`);
    }
  });

  // --- Disconnect ---
  socket.on('disconnect', () => {
    console.log(`Klien terputus: ${socket.id}`);
  });
});

// --- Jalankan Server ---
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server game KIM (v3) berjalan di:`);
  console.log(`  Halaman Login  : http://localhost:${PORT}/`);
  console.log(`  Halaman Display: http://localhost:${PORT}/display`);
  console.log(`  Halaman Admin  : http://localhost:${PORT}/admin`);
  console.log(`  Halaman Monitor: http://localhost:${PORT}/monitor`); // <-- Info Baru
});