const socket = io();

// --- Elemen DOM ---
const loginContainer = document.getElementById('admin-login-container');
const dashboard = document.getElementById('admin-dashboard');
const loginButton = document.getElementById('admin-login-button');
const passwordInput = document.getElementById('admin-password');

const startButton = document.getElementById('admin-start-button');
const stopButton = document.getElementById('admin-stop-button');
const adminStatus = document.getElementById('admin-status');
const numbersLog = document.getElementById('called-numbers-log');
const winnersLog = document.getElementById('winners-log');

// --- Fungsi ---
function updateLogs(gameState) {
  // Update status
  adminStatus.innerText = `Status: ${gameState.status.toUpperCase()}`;
  
  // Update log angka
  numbersLog.innerHTML = Array.from(gameState.calledNumbers)
    .map(num => `<span class="log-number">${num}</span>`)
    .reverse() // Tampilkan yg terbaru di atas
    .join(' ');

  // Update log pemenang
  winnersLog.innerHTML = gameState.winners
    .map(win => `<li>[${win.time}] <strong>${win.name}</strong> menang 1 baris (Tiket: ...${win.ticketId.slice(-4)}, Baris: ${win.row})</li>`)
    .reverse()
    .join('');
    
  // Atur tombol
  if (gameState.status === 'running') {
    startButton.disabled = true;
    stopButton.disabled = false;
  } else {
    startButton.disabled = false;
    stopButton.disabled = true;
  }
}

// --- Event Listener Tombol ---
loginButton.addEventListener('click', () => {
  socket.emit('ADMIN_LOGIN', passwordInput.value);
});

startButton.addEventListener('click', () => {
  if (confirm('Anda yakin ingin MEMULAI permainan?')) {
    socket.emit('ADMIN_START_GAME');
  }
});

stopButton.addEventListener('click', () => {
  if (confirm('Anda yakin ingin MENGHENTIKAN permainan?')) {
    socket.emit('ADMIN_STOP_GAME');
  }
});


// --- Event Listener Server ---
socket.on('ADMIN_AUTHORIZED', () => {
  loginContainer.style.display = 'none';
  dashboard.style.display = 'block';
  // Minta state game saat ini
  socket.emit('GET_GAME_STATE');
});

socket.on('ADMIN_DENIED', () => {
  alert('Password salah!');
});

socket.on('GAME_STATE_UPDATE', (gameState) => {
  updateLogs(gameState);
});

socket.on('NEW_NUMBER', (number) => {
  // (Kita tunggu saja GAME_STATE_UPDATE yg biasanya dikirim bersamaan,
  // tapi bisa juga update manual jika perlu)
  // Untuk efisiensi, kita update manual saja log angkanya
  const numSpan = document.createElement('span');
  numSpan.className = 'log-number';
  numSpan.innerText = number;
  numbersLog.prepend(numSpan);
});

socket.on('WINNER_ANNOUNCEMENT', (winData) => {
  // Update manual log pemenang
  const winLi = document.createElement('li');
  winLi.innerHTML = `[${winData.time}] <strong>${winData.name}</strong> menang 1 baris (Tiket: ...${winData.ticketId.slice(-4)}, Baris: ${winData.row})`;
  winnersLog.prepend(winLi);
});

socket.on('GAME_START', () => {
  adminStatus.innerText = 'Status: RUNNING';
  startButton.disabled = true;
  stopButton.disabled = false;
  numbersLog.innerHTML = '';
  winnersLog.innerHTML = '';
});

socket.on('GAME_STOP', (data) => {
  adminStatus.innerText = `Status: STOPPED - ${data.message}`;
  startButton.disabled = false;
  stopButton.disabled = true;
});