const socket = io();

// Ambil data pemain dari localStorage
const playerId = localStorage.getItem('kim_player_id');
const playerName = localStorage.getItem('kim_player_name');

// --- Elemen DOM ---
const playerNameDisplay = document.getElementById('player-name');
const statusBar = document.getElementById('status-bar');
const lastNumberDisplay = document.getElementById('last-number');
const ticketsContainer = document.getElementById('tickets-container');

// --- State Klien ---
let myTickets = [];
let clientCalledNumbers = new Set();

// --- Fungsi ---

function renderTickets(tickets) {
  ticketsContainer.innerHTML = '';
  myTickets = tickets; // Simpan tiket di state global
  
  tickets.forEach((ticket, ticketIndex) => {
    const ticketEl = document.createElement('div');
    ticketEl.classList.add('ticket');
    ticketEl.dataset.ticketId = ticket.id;
    
    let ticketHTML = `<h3>Tiket ${ticketIndex + 1}</h3><div class="ticket-grid">`;
    
    ticket.rows.forEach((row, rowIndex) => {
      row.forEach(number => {
        // Beri data-attribute untuk memudahkan validasi
        ticketHTML += `<div class="number-cell" 
                           data-number="${number}"
                           data-ticket-id="${ticket.id}"
                           data-row-index="${rowIndex}">
                         ${number}
                       </div>`;
      });
    });
    
    ticketHTML += `</div><div class="prize-buttons">
        <button class="claim-button" data-ticket-id="${ticket.id}" data-row-index="0" style="display:none;">Ambil Hadiah Baris 1</button>
        <button class="claim-button" data-ticket-id="${ticket.id}" data-row-index="1" style="display:none;">Ambil Hadiah Baris 2</button>
        <button class="claim-button" data-ticket-id="${ticket.id}" data-row-index="2" style="display:none;">Ambil Hadiah Baris 3</button>
    </div>`;
    
    ticketEl.innerHTML = ticketHTML;
    ticketsContainer.appendChild(ticketEl);
  });
  
  // Tambahkan event listener untuk SEMUA sel angka
  document.querySelectorAll('.number-cell').forEach(cell => {
    cell.addEventListener('click', handleNumberClick);
  });
  
  // Tambahkan event listener untuk SEMUA tombol klaim
  document.querySelectorAll('.claim-button').forEach(button => {
    button.addEventListener('click', handleClaimClick);
  });
}

function handleNumberClick(e) {
  const cell = e.target;
  const number = parseInt(cell.dataset.number);
  
  // Cek apakah angka sudah dipanggil
  if (clientCalledNumbers.has(number)) {
    cell.classList.add('marked');
    
    // Setelah menandai, cek apakah barisnya menang
    checkRowWin(cell.dataset.ticketId, parseInt(cell.dataset.rowIndex));
  } else {
    // Beri info jika angka belum dipanggil
    cell.classList.add('shake');
    setTimeout(() => cell.classList.remove('shake'), 300);
  }
}

function checkRowWin(ticketId, rowIndex) {
  // Dapatkan semua sel untuk baris tersebut
  const rowCells = document.querySelectorAll(
    `.number-cell[data-ticket-id="${ticketId}"][data-row-index="${rowIndex}"]`
  );
  
  // Cek apakah SEMUA sel di baris itu sudah 'marked'
  const allMarked = Array.from(rowCells).every(cell => cell.classList.contains('marked'));
  
  if (allMarked) {
    // Tampilkan tombol "Ambil Hadiah" untuk baris itu
    const claimButton = document.querySelector(
      `.claim-button[data-ticket-id="${ticketId}"][data-row-index="${rowIndex}"]`
    );
    if (claimButton) {
      claimButton.style.display = 'block';
    }
  }
}

function handleClaimClick(e) {
  const button = e.target;
  const ticketId = button.dataset.ticketId;
  const rowIndex = parseInt(button.dataset.rowIndex);
  
  // Kirim klaim ke server untuk divalidasi
  socket.emit('CLAIM_ROW_WIN', { ticketId, rowIndex });
  button.disabled = true;
  button.innerText = 'Memvalidasi...';
}

function updateGameStatus(status, message) {
  statusBar.className = `status-${status}`;
  statusBar.innerText = message;
}

// --- Logika Utama Saat Halaman Dimuat ---

if (!playerId || !playerName) {
  // Jika tidak ada data login, paksa kembali ke halaman login
  window.location.href = '/';
} else {
  // Tampilkan nama pemain
  playerNameDisplay.innerText = playerName;
  
  // Minta data tiket kita ke server
  socket.emit('GET_PLAYER_DATA', playerId);
}

// --- Event Listener dari Server ---

// 1. Server kirim data tiket kita
socket.on('PLAYER_DATA', (player) => {
  renderTickets(player.tickets);
  // Minta state game saat ini agar bisa sinkron
  socket.emit('GET_GAME_STATE');
});

// 2. Server kirim state game (untuk sinkronisasi angka yg sudah dipanggil)
socket.on('GAME_STATE_UPDATE', (gameState) => {
  // Simpan daftar angka yg sudah dipanggil
  clientCalledNumbers = new Set(gameState.calledNumbers);
  lastNumberDisplay.innerText = gameState.lastNumber || '-';
  
  // Tandai semua angka yg sudah dipanggil di tiket kita
  document.querySelectorAll('.number-cell').forEach(cell => {
    if (clientCalledNumbers.has(parseInt(cell.dataset.number))) {
      cell.classList.add('marked');
    }
  });

  // Perbarui status bar
  if(gameState.status === 'running') {
    updateGameStatus('running', 'Permainan sedang berlangsung...');
  } else {
    updateGameStatus('idle', 'Permainan belum dimulai. Tunggu Admin.');
  }
});

// 3. Server memanggil angka baru
socket.on('NEW_NUMBER', (number) => {
  clientCalledNumbers.add(number);
  lastNumberDisplay.innerText = number;
  // (Pemain harus meng-klik manual, jadi kita tidak tandai otomatis)
});

// 4. Server menyetujui klaim kita
socket.on('CLAIM_APPROVED', (winData) => {
  alert(`SELAMAT! Klaim Anda untuk baris ${winData.row} di tiket ${winData.ticketId} DISAHKAN!`);
  const button = document.querySelector(
    `.claim-button[data-ticket-id="${winData.ticketId}"][data-row-index="${winData.row - 1}"]`
  );
  if (button) {
    button.innerText = 'KLAIM SUKSES';
    button.style.backgroundColor = '#28a745';
    button.disabled = true;
  }
});

// 5. Server menolak klaim kita
socket.on('CLAIM_DENIED', (message) => {
  alert(message);
  // Aktifkan lagi tombolnya agar bisa dicek ulang
  // (Cari tombol yg sedang 'memvalidasi')
  const validatingButton = document.querySelector('.claim-button:disabled');
  if (validatingButton) {
    validatingButton.disabled = false;
    validatingButton.innerText = `Ambil Hadiah Baris ${parseInt(validatingButton.dataset.rowIndex) + 1}`;
  }
});

// 6. Jika error (misal data player hilang)
socket.on('ERROR_REDIRECT', (message) => {
  alert(message);
  localStorage.clear();
  window.location.href = '/';
});

// 7. Info status game
socket.on('GAME_START', () => {
  updateGameStatus('running', 'Permainan dimulai! Fokus pada tiket Anda.');
});

socket.on('GAME_STOP', (data) => {
  updateGameStatus('stopped', data.message);
});