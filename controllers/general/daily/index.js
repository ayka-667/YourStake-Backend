// Load database models
const User = require('../../../database/models/User');
const BalanceTransaction = require('../../../database/models/BalanceTransaction');

// Load utils
const {
    socketRemoveAntiSpam
} = require('../../../utils/socket');
const {
    DAILY_COOLDOWN,
    dailyGetStatus,
    dailyCheckCanClaim
} = require('../../../utils/general/daily');

const generalGetDailyStatusSocket = async(io, socket, user, data, callback) => {
    try {
        const userDatabase = await User.findById(user._id).select('daily affiliates.referrer').lean();
        callback({ success: true, status: dailyGetStatus(userDatabase) });
    } catch(err) {
        callback({ success: false, error: { type: 'error', message: err.message } });
    }
}

const generalSendDailyClaimSocket = async(io, socket, user, data, callback) => {
    try {
        const userDatabase = await User.findById(user._id).select('daily affiliates.referrer').lean();
        const status = dailyGetStatus(userDatabase);
        dailyCheckCanClaim(status);

        const now = new Date();

        // The claimedAt condition makes the claim atomic: two parallel claims can't both pass
        const userUpdated = await User.findOneAndUpdate({
            _id: user._id,
            $or: [
                { 'daily.claimedAt': { $exists: false } },
                { 'daily.claimedAt': null },
                { 'daily.claimedAt': { $lte: new Date(now.getTime() - DAILY_COOLDOWN) } }
            ]
        }, {
            $inc: {
                balance: status.reward
            },
            'daily.claimedAt': now,
            'daily.streak': status.nextStreak,
            updatedAt: now.getTime()
        }, { new: true }).select('balance xp stats rakeback mute ban verifiedAt updatedAt').lean();

        if(userUpdated === null) { throw new Error('You already claimed your daily reward.'); }

        await BalanceTransaction.create({
            amount: status.reward,
            type: 'dailyReward',
            user: user._id,
            state: 'completed'
        });

        callback({ success: true, user: userUpdated, reward: status.reward, status: dailyGetStatus({ ...userDatabase, daily: { claimedAt: now, streak: status.nextStreak } }) });

        socketRemoveAntiSpam(user._id);
    } catch(err) {
        socketRemoveAntiSpam(user._id);
        callback({ success: false, error: { type: 'error', message: err.message } });
    }
}

module.exports = {
    generalGetDailyStatusSocket,
    generalSendDailyClaimSocket
}
