import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
    }
});

const PORT = process.env.PORT || 3000;

// 本番環境用：ビルドされたフロントエンドファイルを配信
const clientBuildPath = join(__dirname, '../dist');
app.use(express.static(clientBuildPath));

// SPA対応
app.get('*any', (req, res) => {
    res.sendFile(join(clientBuildPath, 'index.html'));
});

// Game Constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const PADDLE_WIDTH = 10;
const PADDLE_HEIGHT = 100;
const BALL_SIZE = 10;
const WIN_SCORE = 5;

// Game State
let room = {
    players: {}, // socketId -> { id, x, y, score, side, name }
    ball: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, dx: 3, dy: 2 },
    status: 'waiting', // waiting, playing, gameover
    interval: null
};

function resetBall() {
    room.ball.x = CANVAS_WIDTH / 2;
    room.ball.y = CANVAS_HEIGHT / 2;
    room.ball.dx = (Math.random() > 0.5 ? 3 : -3);
    room.ball.dy = (Math.random() * 2) - 1;
}

function startGame() {
    if (room.interval) clearInterval(room.interval);
    room.status = 'playing';
    resetBall();

    room.interval = setInterval(() => {
        if (room.status !== 'playing') return;

        let ball = room.ball;
        ball.x += ball.dx;
        ball.y += ball.dy;

        // 壁との衝突
        if (ball.y <= 0 || ball.y + BALL_SIZE >= CANVAS_HEIGHT) {
            ball.dy *= -1;
        }

        // 全プレイヤーのパドルとの衝突判定
        Object.values(room.players).forEach(p => {
            if (
                ball.x <= p.x + PADDLE_WIDTH &&
                ball.x + BALL_SIZE >= p.x &&
                ball.y + BALL_SIZE >= p.y &&
                ball.y <= p.y + PADDLE_HEIGHT
            ) {
                // 進行方向に向かって衝突した場合のみ跳ね返す
                if ((p.side === 'left' && ball.dx < 0) || (p.side === 'right' && ball.dx > 0)) {
                    if (Math.abs(ball.dx) < 15) ball.dx *= -1.05;
                    else ball.dx *= -1;

                    const hitPos = (ball.y - p.y) / PADDLE_HEIGHT;
                    ball.dy += (hitPos - 0.5) * 4;
                    io.emit('play_sound', 'hit');
                }
            }
        });

        // 得点判定
        if (ball.x < 0) {
            addScore('right');
        } else if (ball.x > CANVAS_WIDTH) {
            addScore('left');
        }

        io.emit('game_update', { ball: room.ball, players: room.players });
    }, 1000 / 60);
}

function addScore(side) {
    Object.values(room.players).forEach(p => {
        if (p.side === side) p.score++;
    });

    const leadPlayer = Object.values(room.players).find(p => p.side === side);
    if (leadPlayer && leadPlayer.score >= WIN_SCORE) {
        room.status = 'gameover';
        io.emit('game_over', { winnerSide: side });
    } else {
        io.emit('play_sound', 'score');
        resetBall();
    }
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // プレイヤー追加 (最大6人)
    const playerCount = Object.keys(room.players).length;
    if (playerCount < 6) {
        const side = (playerCount % 2 === 0) ? 'left' : 'right';
        room.players[socket.id] = {
            id: socket.id,
            side: side,
            x: side === 'left' ? 50 : CANVAS_WIDTH - 60,
            y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
            score: 0
        };
        io.emit('update_lobby', { players: room.players, status: room.status });
    } else {
        socket.emit('error', 'Room is full');
    }

    socket.on('start_request', () => {
        if (room.status !== 'playing') {
            // スコアをリセット
            Object.values(room.players).forEach(p => p.score = 0);
            startGame();
        }
    });

    socket.on('paddle_move', (data) => {
        const p = room.players[socket.id];
        if (p && room.status === 'playing') {
            // 縦移動制限
            p.y = Math.max(0, Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, data.y));
            // 横移動制限 (自分チームのコート内のみ)
            if (p.side === 'left') {
                p.x = Math.max(0, Math.min(CANVAS_WIDTH / 2 - PADDLE_WIDTH, data.x));
            } else {
                p.x = Math.max(CANVAS_WIDTH / 2, Math.min(CANVAS_WIDTH - PADDLE_WIDTH, data.x));
            }
        }
    });

    socket.on('force_end', () => {
        room.status = 'gameover';
        io.emit('game_over', { winnerSide: 'none', message: 'Game ended by player' });
    });

    socket.on('disconnect', () => {
        delete room.players[socket.id];
        if (Object.keys(room.players).length === 0) {
            room.status = 'waiting';
            if (room.interval) clearInterval(room.interval);
        }
        io.emit('update_lobby', { players: room.players, status: room.status });
    });
});

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
