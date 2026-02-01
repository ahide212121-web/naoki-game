import '../style.css'; // Import styles if not already imported by index.html (Vanilla template usually links CSS in HTML, but importing here is also fine in Vite)
import { io } from 'socket.io-client';

const socket = io(); // 引数を空にすると、現在のドメイン(Render)に自動的に接続されます

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const startusEl = document.getElementById('status-message');
const scoreBoard = document.getElementById('score-board');
const scoreP1 = document.getElementById('score-p1');
const scoreP2 = document.getElementById('score-p2');

// Game State
let gameState = null;
let myId = null;
let roomId = null;

// Audio (Standard browser API - simple beep)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playBeep(freq = 440, type = 'square', duration = 0.1) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);
  osc.stop(audioCtx.currentTime + duration);
}

// Socket Events
socket.on('connect', () => {
  myId = socket.id;
  startusEl.innerText = 'Connected! Searching for opponent...';
});

socket.on('waiting', (data) => {
  startusEl.innerText = data.message;
});

socket.on('match_start', (data) => {
  roomId = data.roomId;
  startusEl.innerText = 'Match Starting!';
  scoreBoard.classList.remove('hidden');
  document.getElementById('result-screen').classList.add('hidden'); // Hide result screen if visible
  document.getElementById('replay-status').classList.remove('visible'); // Hide waiting status 
  setTimeout(() => {
    startusEl.classList.add('hidden');
  }, 1000);
});

socket.on('game_update', (data) => {
  gameState = data;
  render();
});

socket.on('game_over', (data) => {
  gameState = null;
  // Show result
  const resultScreen = document.getElementById('result-screen');
  const resultMessage = document.getElementById('result-message');
  resultScreen.classList.remove('hidden');

  if (data.winnerId === myId) {
    resultMessage.innerText = 'YOU WIN';
    resultMessage.style.color = '#00f3ff';
  } else {
    resultMessage.innerText = 'YOU LOSE';
    resultMessage.style.color = '#ff00ff';
  }
});

socket.on('replay_wait', () => {
  document.getElementById('replay-status').classList.add('visible');
  document.getElementById('replay-status').innerText = 'Waiting for opponent...';
});

socket.on('player_left', () => {
  startusEl.innerText = 'Opponent Left. Game Over.';
  startusEl.classList.remove('hidden');
  gameState = null;
  setTimeout(() => {
    location.reload();
  }, 3000);
});

// UI Buttons
document.getElementById('btn-replay').addEventListener('click', () => {
  if (roomId) {
    socket.emit('request_replay', { roomId });
    document.getElementById('replay-status').classList.add('visible');
  }
});

document.getElementById('btn-exit').addEventListener('click', () => {
  location.reload();
});

socket.on('play_sound', (type) => {
  if (type === 'hit') playBeep(600, 'square', 0.05);
  if (type === 'score') playBeep(200, 'sawtooth', 0.3);
});

// Input Handling
canvas.addEventListener('mousemove', (e) => {
  if (!roomId) return;

  const rect = canvas.getBoundingClientRect();
  const scaleY = canvas.height / rect.height;
  const y = (e.clientY - rect.top) * scaleY;

  // Center paddle on mouse
  socket.emit('paddle_move', { roomId, y: y - 50 }); // 50 is half paddle height
});

// Render Loop
function render() {
  if (!gameState) return;

  // Clear
  ctx.fillStyle = '#050510';
  ctx.fillRect(0, 0, canvas.width, canvas.height); // Clear with bg color to avoid trails if transparent

  // Draw Net
  ctx.strokeStyle = 'rgba(0, 243, 255, 0.2)';
  ctx.setLineDash([10, 15]);
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw Players
  Object.values(gameState.players).forEach(player => {
    ctx.fillStyle = player.id === myId ? '#00f3ff' : '#ff00ff';
    ctx.shadowBlur = 20;
    ctx.shadowColor = ctx.fillStyle;
    ctx.fillRect(player.x, player.y, 10, 100);

    // Update Score UI
    if (player.side === 'left') scoreP1.innerText = player.score;
    else scoreP2.innerText = player.score;
  });

  // Draw Ball
  const ball = gameState.ball;
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 10;
  ctx.shadowColor = '#ffffff';
  ctx.beginPath();
  ctx.arc(ball.x + 5, ball.y + 5, 5, 0, Math.PI * 2); // +5 for centering since size is 10
  ctx.fill();

  ctx.shadowBlur = 0;
}
