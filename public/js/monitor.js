const socket = io();

const numberDisplay = document.getElementById('monitor-number');
const numberContainer = document.getElementById('monitor-number-container');

socket.on('connect', () => {
    numberDisplay.textContent = 'Terhubung...';
    socket.emit('GET_GAME_STATE'); // Minta state awal untuk status
});

socket.on('GAME_STATE_UPDATE', (gameState) => {
    if (gameState.status === 'idle' || gameState.status === 'stopped') {
        numberDisplay.textContent = 'Menunggu Game Dimulai...';
        numberContainer.classList.remove('animate');
    } else if (gameState.status === 'paused') {
        numberDisplay.textContent = 'DIJEDA';
        numberContainer.classList.remove('animate');
    } else {
        // Jika running tapi belum ada angka, tampilkan pesan
        if(!gameState.lastNumber) {
             numberDisplay.textContent = 'Mulai!';
        } else {
            // Jika sudah ada angka (misal saat refresh), tampilkan angka terakhir
             numberDisplay.textContent = gameState.lastNumber;
        }
    }
});

socket.on('NEW_NUMBER', (number) => {
    numberDisplay.textContent = number;
    // Tambahkan class untuk animasi, lalu hapus setelah selesai
    numberContainer.classList.add('animate');
    setTimeout(() => {
        numberContainer.classList.remove('animate');
    }, 2500); // Durasi animasi + sedikit jeda
});

socket.on('GAME_START', () => {
    numberDisplay.textContent = 'Mulai!';
    numberContainer.classList.remove('animate');
});

socket.on('GAME_STOP', (data) => {
    numberDisplay.textContent = 'SELESAI!';
    numberContainer.classList.remove('animate');
    alert(data.message); // Tampilkan pesan stop
});

socket.on('GAME_PAUSE_TOGGLE', (isPaused) => {
    numberDisplay.textContent = isPaused ? 'DIJEDA' : (numberDisplay.textContent === 'DIJEDA' ? '-' : numberDisplay.textContent); // Jika lanjut, kembalikan angka sebelumnya jika ada
     numberContainer.classList.remove('animate');
});