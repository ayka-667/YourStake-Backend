// Load database models
const User = require('../../../database/models/User');

// Load middleware
const {
    rateLimiter
} = require('../../../middleware/rateLimiter');

// Load utils
const {
    socketCheckUserData,
    socketCheckAntiSpam,
    socketRemoveAntiSpam
} = require('../../../utils/socket');
const {
    settingCheck
} = require('../../../utils/setting');

// Load controllers
const {
    generalGetDailyStatusSocket,
    generalSendDailyClaimSocket
} = require('../../../controllers/general/daily');

module.exports = (io, socket) => {

    // Shared wrapper: signed-in user, rate limit, anti spam and the admin switch
    const dailyHandle = (event, controller, antiSpam) => {
        socket.on(event, async(data, callback) => {
            if(callback === undefined || typeof callback !== 'function') { return; }
            if(socket.decoded === undefined || socket.decoded === null) {
                callback({ success: false, error: { type: 'error', message: 'You need to sign in to perform this action.' } });
                return;
            }

            try {
                const identifier = socket.handshake.headers['cf-connecting-ip'] || socket.conn.remoteAddress;
                await rateLimiter.consume(identifier);
                if(antiSpam === true) { await socketCheckAntiSpam(socket.decoded._id); }
                try {
                    const user = await User.findById(socket.decoded._id).select('username rank limits mute ban').lean();
                    socketCheckUserData(user, true);
                    settingCheck(user, 'general.daily.enabled');
                    controller(io, socket, user, data, callback);
                } catch(err) {
                    if(antiSpam === true) { socketRemoveAntiSpam(socket.decoded._id); }
                    callback({ success: false, error: { type: 'error', message: err.message } });
                }
            } catch(err) {
                callback({ success: false, error: { type: 'error', message: err.message !== undefined ? err.message : 'You need to slow down, you have send to many request. Try again in a minute.' } });
            }
        });
    };

    dailyHandle('getDailyStatus', generalGetDailyStatusSocket, false);
    dailyHandle('sendDailyClaim', generalSendDailyClaimSocket, true);

}
