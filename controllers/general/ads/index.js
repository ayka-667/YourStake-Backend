const crypto = require('crypto');

// Load database models
const User = require('../../../database/models/User');
const AdView = require('../../../database/models/AdView');
const BalanceTransaction = require('../../../database/models/BalanceTransaction');

// Load utils
const {
    socketRemoveAntiSpam
} = require('../../../utils/socket');
const {
    adsStartOfDay,
    adsGetStatus,
    adsCheckCanWatch,
    adsCheckClaimData,
    adsCheckClaimView
} = require('../../../utils/general/ads');

const adsLoadStatus = async(user) => {
    const dataDatabase = await Promise.all([
        AdView.countDocuments({ user: user._id, state: 'granted', grantedAt: { $gte: adsStartOfDay() } }),
        AdView.findOne({ user: user._id, state: 'granted' }).sort({ grantedAt: -1 }).select('grantedAt').lean()
    ]);

    return adsGetStatus(dataDatabase[0], dataDatabase[1] !== null ? dataDatabase[1].grantedAt : null);
}

const generalGetAdsStatusSocket = async(io, socket, user, data, callback) => {
    try {
        callback({ success: true, status: await adsLoadStatus(user) });
    } catch(err) {
        callback({ success: false, error: { type: 'error', message: err.message } });
    }
}

// Opens an ad session the client will claim once Google reports the reward as granted.
const generalSendAdsStartSocket = async(io, socket, user, data, callback) => {
    try {
        const status = await adsLoadStatus(user);
        adsCheckCanWatch(status);

        const view = await AdView.create({
            token: crypto.randomBytes(24).toString('hex'),
            reward: status.reward,
            user: user._id,
            state: 'started'
        });

        callback({ success: true, token: view.token, status: status });

        socketRemoveAntiSpam(user._id);
    } catch(err) {
        socketRemoveAntiSpam(user._id);
        callback({ success: false, error: { type: 'error', message: err.message } });
    }
}

const generalSendAdsClaimSocket = async(io, socket, user, data, callback) => {
    try {
        adsCheckClaimData(data);

        const view = await AdView.findOne({ token: data.token, user: user._id, state: 'started' }).lean();
        adsCheckClaimView(view);

        // Limits are checked again here: several sessions could have been opened before claiming
        adsCheckCanWatch(await adsLoadStatus(user));

        // Only one claim can flip the session to granted
        const granted = await AdView.findOneAndUpdate({ _id: view._id, state: 'started' }, { state: 'granted', grantedAt: new Date() }, { new: true }).lean();
        if(granted === null) { throw new Error('This ad session was already used.'); }

        const dataDatabase = await Promise.all([
            User.findByIdAndUpdate(user._id, {
                $inc: {
                    balance: view.reward
                },
                updatedAt: new Date().getTime()
            }, { new: true }).select('balance xp stats rakeback mute ban verifiedAt updatedAt').lean(),
            BalanceTransaction.create({
                amount: view.reward,
                type: 'adReward',
                user: user._id,
                state: 'completed'
            })
        ]);

        callback({ success: true, user: dataDatabase[0], reward: view.reward, status: await adsLoadStatus(user) });

        socketRemoveAntiSpam(user._id);
    } catch(err) {
        socketRemoveAntiSpam(user._id);
        callback({ success: false, error: { type: 'error', message: err.message } });
    }
}

module.exports = {
    generalGetAdsStatusSocket,
    generalSendAdsStartSocket,
    generalSendAdsClaimSocket
}
