import '../style.css';
import { io } from 'socket.io-client';

const socket = io();

// DOM Elements
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreP1 = document.getElementById('score-p1');
const scoreP2 = document.getElementById('score-p2');
const lobbyScreen = document.getElementById('lobby-screen');
const resultScreen = document.getElementById('result-screen');
const btnStart = document.getElementById('btn-start');
const btnEnd = document.getElementById('btn-end');
const scoreBoard = document.getElementById('score-board');
const listLeft = document.getElementById('list-left');
const listRight = document.getElementById('list-right');

let gameState = null;
let myId = null;

// Audio
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
});

socket.on('update_lobby', (data) => {
  listLeft.innerHTML = '';
  listRight.innerHTML = '';

  Object.values(data.players).forEach(p => {
    const li = document.createElement('li');
    li.innerText = p.id === myId ? "YOU" : "PLAYER";
    if (p.id === myId) li.classList.add('me');

    if (p.side === 'left') listLeft.appendChild(li);
    else listRight.appendChild(li);
  });

  if (data.status === 'playing') {
    lobbyScreen.classList.add('hidden');
    scoreBoard.classList.remove('hidden');
    btnEnd.classList.remove('hidden');
  } else {
    lobbyScreen.classList.remove('hidden');
    scoreBoard.classList.add('hidden');
    btnEnd.classList.add('hidden');
    resultScreen.classList.add('hidden');
  }
});

socket.on('game_update', (data) => {
  gameState = data;
  render();
});

socket.on('game_over', (data) => {
  gameState = null;
  resultScreen.classList.remove('hidden');
  const msg = document.getElementById('result-message');

  if (data.winnerSide === 'none') {
    msg.innerText = "MATCH ENDED";
  } else {
    const myPlayer = Object.values(data.players || {}).find(p => p.id === myId);
    if (myPlayer && myPlayer.side === data.winnerSide) {
      msg.innerText = "YOUR TEAM WINS!";
      msg.style.color = "#00f3ff";
    } else {
      msg.innerText = "YOUR TEAM LOSES";
      msg.style.color = "#ff00ff";
    }
  }
  btnEnd.classList.add('hidden');
});

socket.on('play_sound', (type) => {
  if (type === 'hit') playBeep(600, 'square', 0.05);
  if (type === 'score') playBeep(200, 'sawtooth', 0.3);
});

// Controls
btnStart.addEventListener('click', () => {
  socket.emit('start_request');
});

btnEnd.addEventListener('click', () => {
  socket.emit('force_end');
});

document.getElementById('btn-replay').addEventListener('click', () => {
  location.reload();
});

function handleInput(x, y) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const gameX = (x - rect.left) * scaleX;
  const gameY = (y - rect.top) * scaleY;

  socket.emit('paddle_move', { x: gameX, y: gameY });
}

canvas.addEventListener('mousemove', (e) => {
  handleInput(e.clientX, e.clientY);
});

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  handleInput(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });

// Render
function render() {
  if (!gameState) return;

  // Background
  ctx.fillStyle = '#050510';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Center Line
  ctx.strokeStyle = 'rgba(0, 243, 255, 0.2)';
  ctx.setLineDash([10, 15]);
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw Players
  Object.values(gameState.players).forEach(p => {
    ctx.fillStyle = p.side === 'left' ? '#00f3ff' : '#ff00ff';
    ctx.shadowBlur = p.id === myId ? 25 : 10;
    ctx.shadowColor = ctx.fillStyle;

    ctx.fillRect(p.x, p.y, 10, 100);

    // Update score
    if (p.side === 'left') scoreP1.innerText = p.score;
    else scoreP2.innerText = p.score;
  });

  // Draw Ball
  const ball = gameState.ball;
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 15;
  ctx.shadowColor = '#ffffff';
  ctx.beginPath();
  ctx.arc(ball.x + 5, ball.y + 5, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}
