const jwt = require('jsonwebtoken');

// Load database models
const User = require('../../database/models/User');

// Load middleware
const {
    rateLimiter
} = require('../../middleware/rateLimiter');

// Load utils
const {
    socketCheckUserData,
    socketCheckConnectionLimit,
    socketAddConnectionLimit,
    socketRemoveConnectionLimit,
    socketCheckAntiSpam,
    socketRemoveAntiSpam
} = require('../../utils/socket');
const {
    settingCheck
} = require('../../utils/setting');

// Load controllers
const {
    rouletteGetData,
    rouletteGetTableData,
    rouletteSendBetSocket,
    rouletteInit
} = require('../../controllers/roulette');

module.exports = (io) => {

    io.of('/roulette').use(async(socket, next) => {
        try {
            const identifier = socket.handshake.headers['cf-connecting-ip'] || socket.conn.remoteAddress;
            await socketCheckConnectionLimit('roulette', identifier);

            if(socket.handshake.auth !== undefined && socket.handshake.auth.token !== undefined) {
                try {
                    const decoded = await jwt.verify(socket.handshake.auth.token, process.env.TOKEN_SECRET);
                    socket.decoded = decoded;

                    if(socket.decoded !== undefined && socket.decoded !== null && socket.decoded._id !== undefined) { socket.join(socket.decoded._id.toString()); }
                } catch(err) {
                    return next(new Error('You need to sign in to perform this action.'));
                }
            }

            socket.emit('init', rouletteGetData());

            next();
        } catch(err) {
            return next({ success: false, error: { type: 'error', message: err.message } });
        }
    });

    io.of('/roulette').on('connection', (socket) => {
        const identifier = socket.handshake.headers['cf-connecting-ip'] || socket.conn.remoteAddress;
        socketAddConnectionLimit('roulette', identifier);

        // Watch one table: leave the previous one and get its full state
        socket.on('joinTable', (data, callback) => {
            if(callback === undefined || typeof callback !== 'function') { return; }

            const index = data !== undefined && data !== null ? data.table : undefined;
            const table = Number.isInteger(index) === true ? rouletteGetTableData(index) : null;
            if(table === null) {
                callback({ success: false, error: { type: 'error', message: 'This table does not exist.' } });
                return;
            }

            for(const room of socket.rooms) { if(room.startsWith('table-') === true) { socket.leave(room); } }
            socket.join('table-' + index);
            callback({ success: true, table: table });
        });

        socket.on('leaveTable', () => {
            for(const room of socket.rooms) { if(room.startsWith('table-') === true) { socket.leave(room); } }
        });

        socket.on('sendBet', async(data, callback) => {
            if(callback === undefined || typeof callback !== 'function') { return; }
            if(socket.decoded !== undefined && socket.decoded !== null) {
                try {
                    await rateLimiter.consume(identifier);
                    await socketCheckAntiSpam(socket.decoded._id);
                    try {
                        const user = await User.findById(socket.decoded._id).select('roblox.id username avatar rank balance xp stats limits affiliates anonymous mute ban createdAt').lean();
                        socketCheckUserData(user, true);
                        settingCheck(user, 'games.roulette.enabled');
                        rouletteSendBetSocket(io, socket, user, data, callback);
                    } catch(err) {
                        socketRemoveAntiSpam(socket.decoded._id);
                        callback({ success: false, error: { type: 'error', message: err.message } });
                    }
                } catch(err) {
                    callback({ success: false, error: { type: 'error', message: err.message !== undefined ? err.message : 'You need to slow down, you have send to many request. Try again in a minute.' } });
                }
            } else { callback({ success: false, error: { type: 'error', message: 'You need to sign in to perform this action.' } }); }
        });

        socket.on('disconnect', async() => {
            socketRemoveConnectionLimit('roulette', identifier);
        });

    });

    rouletteInit(io);
}
