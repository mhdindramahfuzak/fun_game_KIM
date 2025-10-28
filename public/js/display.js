const socket = io();

const lastNumberDisplay = document.getElementById('last-number-display');
const numberBoard = document.getElementById('number-board');
const winnerToast = document.getElementById('winner-toast');

// Buat papan 1-90
function initBoard() {
  let boardHTML = '';
  for (let i = 1; i <= 90; i++) {
    boardHTML += `<div class="board-cell" id="board-cell-${i}">${i}</div>`;
  }
  numberBoard.innerHTML = boardHTML;
}

// Tandai angka di papan
function markNumberOnBoard(number) {
  const cell = document.getElementById(`board-cell-${number}`);
  if (cell) {
    cell.classList.add('called');
  }
}

// Tampilkan notifikasi pemenang
function showWinnerToast(winData) {
  winnerToast.innerHTML = `SELAMAT!<br><strong>${winData.name}</strong><br>Menang 1 Baris!`;
  winnerToast.classList.add('show');
  
  // Sembunyikan setelah 5 detik
  setTimeout(() => {
    winnerToast.classList.remove('show');
  }, 5000);
}

// --- Event Listener Server ---
socket.on('connect', () => {
  // Minta state game saat ini
  socket.emit('GET_GAME_STATE');
});

socket.on('GAME_STATE_UPDATE', (gameState) => {
  // Update angka terakhir
  lastNumberDisplay.innerText = gameState.lastNumber || '-';
  
  // Reset papan
  initBoard();
  
  // Tandai semua angka yg sudah dipanggil
  for (const number of gameState.calledNumbers) {
    markNumberOnBoard(number);
  }
});

socket.on('NEW_NUMBER', (number) => {
  lastNumberDisplay.innerText = number;
  markNumberOnBoard(number);
});

socket.on('WINNER_ANNOUNCEMENT', (winData) => {
  showWinnerToast(winData);
});

socket.on('GAME_START', () => {
  lastNumberDisplay.innerText = '-';
  initBoard();
});

socket.on('GAME_STOP', (data) => {
  lastNumberDisplay.innerText = 'STOP';
});

// --- Inisialisasi ---
initBoard();