const socket = io();
const loginButton = document.getElementById('login-button');
const nameInput = document.getElementById('name-input');

loginButton.addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (name.length < 3) {
    alert('Nama harus diisi, minimal 3 karakter.');
    return;
  }
  
  // Kirim nama ke server
  socket.emit('PLAYER_LOGIN', name);
  loginButton.disabled = true;
  loginButton.innerText = 'Memproses...';
});

// 1. Server membalas dengan sukses
socket.on('LOGIN_SUCCESS', (data) => {
  // Simpan ID & Nama pemain di browser
  localStorage.setItem('kim_player_id', data.id);
  localStorage.setItem('kim_player_name', data.name);
  
  // Pindahkan pemain ke halaman game
  window.location.href = '/game';
});