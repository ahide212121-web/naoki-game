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

// SPA対応：API以外のリクエストはindex.htmlを返す
app.get('*any', (req, res) => {
    res.sendFile(join(clientBuildPath, 'index.html'));
});

// Game State
const ROOM_ID = 'tennis_room';
let waitingPlayerId = null;

const rooms = {};

// Game Constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const PADDLE_WIDTH = 10;
const PADDLE_HEIGHT = 100;
const BALL_SIZE = 10;

function createGameState() {
    return {
        players: {}, // socketId -> { x, y, score, side }
        ball: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, dx: 4, dy: 4 },
        status: 'waiting', // waiting, playing, gameover
    };
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Matchmaking
    if (waitingPlayerId) {
        // Start game
        const room = 'room_' + socket.id + '_' + waitingPlayerId;
        rooms[room] = createGameState();

        // Assign sides
        rooms[room].players[waitingPlayerId] = {
            id: waitingPlayerId,
            side: 'left',
            x: 20,
            y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
            score: 0
        };
        rooms[room].players[socket.id] = {
            id: socket.id,
            side: 'right',
            x: CANVAS_WIDTH - 30,
            y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
            score: 0
        };
        rooms[room].status = 'playing';

        socket.join(room);
        io.to(waitingPlayerId).socketsJoin(room);

        io.to(room).emit('match_start', {
            roomId: room,
            players: rooms[room].players
        });

        waitingPlayerId = null;

        // Start Game Loop for this room
        startGameLoop(room);

    } else {
        waitingPlayerId = socket.id;
        socket.emit('waiting', { message: 'Waiting for an opponent...' });
    }

    socket.on('paddle_move', (data) => {
        // data: { roomId, y }
        const room = rooms[data.roomId];
        if (room && room.status === 'playing') {
            if (room.players[socket.id]) {
                // Clamp Y
                let newY = data.y;
                if (newY < 0) newY = 0;
                if (newY > CANVAS_HEIGHT - PADDLE_HEIGHT) newY = CANVAS_HEIGHT - PADDLE_HEIGHT;

                room.players[socket.id].y = newY;
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (waitingPlayerId === socket.id) {
            waitingPlayerId = null;
        }

        // Handle active games disconnection
        for (const roomId in rooms) {
            if (rooms[roomId].players[socket.id]) {
                io.to(roomId).emit('player_left');
                delete rooms[roomId]; // End game
                break;
            }
        }
    });

    socket.on('request_replay', (data) => {
        const room = rooms[data.roomId];
        if (room && room.status === 'gameover') {
            if (!room.replayRequests) room.replayRequests = new Set();
            room.replayRequests.add(socket.id);

            if (room.replayRequests.size >= 2) {
                // Both agreed
                resetGame(room);
                io.to(data.roomId).emit('match_start', {
                    roomId: data.roomId,
                    players: room.players
                });
                startGameLoop(data.roomId);
            } else {
                // Notify waiting
                io.to(data.roomId).emit('replay_wait', { count: room.replayRequests.size });
            }
        }
    });
});

function startGameLoop(roomId) {
    const interval = setInterval(() => {
        const room = rooms[roomId];
        if (!room) {
            clearInterval(interval);
            return;
        }

        if (room.status !== 'playing') return;

        // Update Ball
        let ball = room.ball;
        ball.x += ball.dx;
        ball.y += ball.dy;

        // Collision with top/bottom
        if (ball.y <= 0 || ball.y + BALL_SIZE >= CANVAS_HEIGHT) {
            ball.dy *= -1;
        }

        // Collision with paddles
        // Left Paddle
        const leftPlayerId = Object.keys(room.players).find(id => room.players[id].side === 'left');
        const rightPlayerId = Object.keys(room.players).find(id => room.players[id].side === 'right');
        const leftAndRightExist = leftPlayerId && rightPlayerId;

        if (leftAndRightExist) {
            const pLeft = room.players[leftPlayerId];
            const pRight = room.players[rightPlayerId];

            // Left Paddle Collision
            if (
                ball.x <= pLeft.x + PADDLE_WIDTH &&
                ball.y + BALL_SIZE >= pLeft.y &&
                ball.y <= pLeft.y + PADDLE_HEIGHT &&
                ball.dx < 0
            ) {
                // 加速倍率を少しマイルドに (1.1 -> 1.05) し、最高速度を制限
                if (Math.abs(ball.dx) < 15) ball.dx *= -1.05;
                else ball.dx *= -1;

                const hitPos = (ball.y - pLeft.y) / PADDLE_HEIGHT;
                ball.dy += (hitPos - 0.5) * 4;
                io.to(roomId).emit('play_sound', 'hit');
            }

            // Right Paddle Collision
            if (
                ball.x + BALL_SIZE >= pRight.x &&
                ball.y + BALL_SIZE >= pRight.y &&
                ball.y <= pRight.y + PADDLE_HEIGHT &&
                ball.dx > 0
            ) {
                // 加速倍率を少しマイルドに (1.1 -> 1.05) し、最高速度を制限
                if (Math.abs(ball.dx) < 15) ball.dx *= -1.05;
                else ball.dx *= -1;

                const hitPos = (ball.y - pRight.y) / PADDLE_HEIGHT;
                ball.dy += (hitPos - 0.5) * 4;
                io.to(roomId).emit('play_sound', 'hit');
            }
        }

        // Scoring
        const WIN_SCORE = 5;

        if (ball.x < 0) {
            // Right scores
            if (rightPlayerId) {
                room.players[rightPlayerId].score++;
                // 最終スコアをクライアントに一度送る
                io.to(roomId).emit('game_update', {
                    ball: room.ball,
                    players: room.players
                });

                if (room.players[rightPlayerId].score >= WIN_SCORE) {
                    handleWin(roomId, rightPlayerId);
                    return;
                }
            }
            io.to(roomId).emit('play_sound', 'score');
            resetBall(room);
        } else if (ball.x > CANVAS_WIDTH) {
            // Left scores
            if (leftPlayerId) {
                room.players[leftPlayerId].score++;
                // 最終スコアをクライアントに一度送る
                io.to(roomId).emit('game_update', {
                    ball: room.ball,
                    players: room.players
                });

                if (room.players[leftPlayerId].score >= WIN_SCORE) {
                    handleWin(roomId, leftPlayerId);
                    return;
                }
            }
            io.to(roomId).emit('play_sound', 'score');
            resetBall(room);
        }

        // Broadcast state
        io.to(roomId).emit('game_update', {
            ball: room.ball,
            players: room.players
        });

    }, 1000 / 60); // 60 FPS
}

// Helper Functions
function handleWin(roomId, winnerId) {
    const room = rooms[roomId];
    if (!room) return;
    room.status = 'gameover';
    io.to(roomId).emit('game_over', { winnerId });
    // Interval stops automatically because status != playing on next loop
}

function resetBall(room) {
    room.ball.x = CANVAS_WIDTH / 2;
    room.ball.y = CANVAS_HEIGHT / 2;
    // 初期速度を少し落とす (4 -> 3)
    room.ball.dx = (Math.random() > 0.5 ? 3 : -3);
    room.ball.dy = (Math.random() * 2) - 1; // 垂直方向の初期移動も抑える
}

function resetGame(room) {
    // Reset scores
    Object.keys(room.players).forEach(id => {
        room.players[id].score = 0;
        room.players[id].y = CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2;
    });
    resetBall(room);
    room.status = 'playing';
    room.replayRequests = new Set();
}

httpServer.listen(PORT, () => {
    console.log(`Socket.io server running on port ${PORT}`);
});
