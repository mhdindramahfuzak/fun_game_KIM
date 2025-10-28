const socket = io();

const playerId = localStorage.getItem('kim_player_id');
const playerName = localStorage.getItem('kim_player_name');

// --- Elemen DOM ---
const playerNameDisplay = document.getElementById('player-name');
const statusBar = document.getElementById('status-bar');
const lastNumberDisplay = document.getElementById('last-number');
const ticketsContainer = document.getElementById('tickets-container');
const winConditionDisplay = document.getElementById('win-condition-display');

// --- State Klien ---
let myTickets = [];
let clientCalledNumbers = new Set();
let currentWinCondition = ''; // Untuk tahu target klaim

// --- Fungsi ---

function renderTickets(tickets) {
  myTickets = tickets; // Simpan tiket
  // Kosongkan container spesifik warna
  document.getElementById('ticket-kuning').innerHTML = '<h3>Tiket Kuning</h3>';
  document.getElementById('ticket-hijau').innerHTML = '<h3>Tiket Hijau</h3>';
  document.getElementById('ticket-putih').innerHTML = '<h3>Tiket Putih</h3>';

  tickets.forEach(ticket => {
    const targetContainer = document.getElementById(`ticket-${ticket.color}`);
    if (!targetContainer) return; // Lewati jika container warna tidak ada

    const ticketEl = document.createElement('div');
    ticketEl.classList.add('ticket'); // Class umum tiket
    ticketEl.dataset.ticketId = ticket.id;

    // Grid 3 kolom x 2 baris
    let ticketHTML = `<div class="ticket-grid-3x2">`;
    // Loop per kolom untuk membangun grid
    for (let colIndex = 0; colIndex < 3; colIndex++) {
        ticket.cols[colIndex].forEach(number => {
            ticketHTML += `<div class="number-cell"
                               data-number="${number}"
                               data-ticket-id="${ticket.id}">
                             ${number}
                           </div>`;
        });
    }
    ticketHTML += `</div>`; // Tutup ticket-grid-3x2

    // Tombol Klaim per tiket (bukan per baris lagi)
    ticketHTML += `<div class="prize-buttons">
        <button class="claim-button" data-ticket-id="${ticket.id}">Klaim Tiket Ini!</button>
      </div>`;

    ticketEl.innerHTML = ticketHTML;
    targetContainer.appendChild(ticketEl);
  });

  // Tambahkan event listener untuk SEMUA sel angka
  document.querySelectorAll('.number-cell').forEach(cell => {
    cell.addEventListener('click', handleNumberClick);
  });

  // Tambahkan event listener untuk SEMUA tombol klaim tiket
  document.querySelectorAll('.claim-button').forEach(button => {
    button.addEventListener('click', handleClaimClick);
  });

  // Tandai angka yg sudah dipanggil saat render awal
  updateCalledNumbersOnTickets();
}

// Fungsi untuk menandai semua nomor yg sudah dipanggil di SEMUA tiket
function updateCalledNumbersOnTickets() {
    document.querySelectorAll('.number-cell').forEach(cell => {
        if (clientCalledNumbers.has(parseInt(cell.dataset.number))) {
            cell.classList.add('marked');
        } else {
             cell.classList.remove('marked'); // Pastikan unmarked jika game baru
        }
    });
    // Aktifkan tombol klaim jika kondisi terpenuhi saat load
    myTickets.forEach(ticket => checkWinConditionOnTicket(ticket.id));
}

function handleNumberClick(e) {
  const cell = e.target;
  const number = parseInt(cell.dataset.number);
  const ticketId = cell.dataset.ticketId;

  if (clientCalledNumbers.has(number)) {
    cell.classList.add('marked');
    // Cek kondisi menang HANYA untuk tiket ini setelah menandai
    checkWinConditionOnTicket(ticketId);
  } else {
    cell.classList.add('shake');
    setTimeout(() => cell.classList.remove('shake'), 300);
  }
}

// Fungsi baru untuk cek kondisi menang di SATU tiket
// dan mengaktifkan/menonaktifkan tombol klaimnya
function checkWinConditionOnTicket(ticketId) {
    const ticket = myTickets.find(t => t.id === ticketId);
    if (!ticket) return;

    const claimButton = document.querySelector(`.claim-button[data-ticket-id="${ticketId}"]`);
    if (!claimButton || claimButton.innerText === 'KLAIM SUKSES') return; // Jangan cek jika sudah sukses

    let canClaim = false;
    let completedRowsCount = 0;
    ticket.rows.forEach(row => {
        if (row.every(num => clientCalledNumbers.has(num))) {
            completedRowsCount++;
        }
    });
    let isFullHouse = ticket.allNumbers.every(num => clientCalledNumbers.has(num));

    if (currentWinCondition === '1_row' && completedRowsCount >= 1) {
        canClaim = true;
    } else if (currentWinCondition === '2_rows' && completedRowsCount >= 2) {
        canClaim = true;
    } else if (currentWinCondition === 'full_house' && isFullHouse) {
        canClaim = true;
    }

    claimButton.disabled = !canClaim;
}


function handleClaimClick(e) {
  const button = e.target;
  const ticketId = button.dataset.ticketId;

  socket.emit('CLAIM_WIN', ticketId); // Kirim ID tiket saja
  button.disabled = true;
  button.innerText = 'Memvalidasi...';
}

function updateGameStatusUI(status, message = '', winCondition = '') {
  statusBar.className = `status-${status}`;
  let statusText = message;
  currentWinCondition = winCondition; // Simpan kondisi menang saat ini

  if (status === 'running' || status === 'paused') {
      const conditionText = winCondition.replace('_', ' ');
      winConditionDisplay.textContent = conditionText; // Tampilkan target
      statusText = status === 'paused' ? 'Permainan Dijeda Admin...' : 'Permainan Berlangsung...';
  } else {
      winConditionDisplay.textContent = '?';
  }
  statusBar.textContent = statusText + (winCondition ? ` | Target: ${winCondition.replace('_', ' ')}` : '');
}

// --- Logika Utama Saat Halaman Dimuat ---
if (!playerId || !playerName) {
  window.location.href = '/';
} else {
  playerNameDisplay.innerText = playerName;
  socket.emit('GET_PLAYER_DATA', playerId); // Minta data tiket
}

// --- Event Listener dari Server ---

socket.on('PLAYER_DATA', (player) => {
  renderTickets(player.tickets);
});

socket.on('GAME_STATE_UPDATE', (gameState) => {
  clientCalledNumbers = new Set(gameState.calledNumbers);
  lastNumberDisplay.innerText = gameState.lastNumber || '-';
  updateGameStatusUI(gameState.status, '', gameState.winCondition);
  updateCalledNumbersOnTickets(); // Update tanda di tiket
});

socket.on('NEW_NUMBER', (number) => {
  clientCalledNumbers.add(number);
  lastNumberDisplay.innerText = number;
  // Pemain harus klik manual, tapi kita perlu re-check kondisi menang
  // jika angka baru ini menyelesaikan target di salah satu tiket
  myTickets.forEach(ticket => checkWinConditionOnTicket(ticket.id));
});

socket.on('CLAIM_APPROVED', (winData) => {
  alert(`SELAMAT! Klaim Anda untuk ${winData.description} di tiket ${winData.ticketId} DISAHKAN!`);
  const button = document.querySelector(`.claim-button[data-ticket-id="${winData.ticketId}"]`);
  if (button) {
    button.innerText = 'KLAIM SUKSES';
    button.style.backgroundColor = '#28a745';
    button.disabled = true;
  }
});

socket.on('CLAIM_DENIED', (message) => {
  alert(message);
  const validatingButton = document.querySelector('.claim-button:disabled:not([style*="background-color"])'); // Cari yg disabled tapi belum sukses
  if (validatingButton) {
    validatingButton.disabled = false; // Aktifkan lagi
    validatingButton.innerText = 'Klaim Tiket Ini!';
    // Re-check kondisinya, mungkin saja valid sekarang tapi tadi tidak
    checkWinConditionOnTicket(validatingButton.dataset.ticketId);
  }
});

socket.on('ERROR_REDIRECT', (message) => {
  alert(message);
  localStorage.clear();
  window.location.href = '/';
});

socket.on('GAME_START', (data) => {
  updateGameStatusUI('running', 'Permainan dimulai!', data.winCondition);
  // Reset tampilan tombol klaim dan tanda
  document.querySelectorAll('.claim-button').forEach(btn => {
      btn.disabled = true;
      btn.innerText = 'Klaim Tiket Ini!';
      btn.style.backgroundColor = ''; // Reset warna
  });
  clientCalledNumbers.clear(); // Pastikan nomor klien kosong
  updateCalledNumbersOnTickets(); // Hapus semua tanda
});

socket.on('GAME_STOP', (data) => {
  updateGameStatusUI('stopped', data.message);
  // Nonaktifkan semua tombol klaim saat game berhenti
  document.querySelectorAll('.claim-button').forEach(btn => btn.disabled = true);
});

socket.on('GAME_PAUSE_TOGGLE', (isPaused) => {
    updateGameStatusUI(isPaused ? 'paused' : 'running', '', currentWinCondition);
    // Tombol klaim tetap aktif saat pause
});