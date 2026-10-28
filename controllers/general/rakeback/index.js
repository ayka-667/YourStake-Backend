// Load database models
const User = require('../../../database/models/User');
const BalanceTransaction = require('../../../database/models/BalanceTransaction');

// Load utils
const {
    socketRemoveAntiSpam
} = require('../../../utils/socket');
const {
    generalCheckSendRakebackClaimUser
} = require('../../../utils/general/rakeback');

const generalSendRakebackClaimSocket = async(io, socket, user, data, callback) => {
    try {
        // Check if user has enough available rakeback earnings
        generalCheckSendRakebackClaimUser(user);

        // Update claiming user and create balance transaction in database
        const dataDatabase = await Promise.all([
            User.findByIdAndUpdate(user._id, {
                $inc: {
                    balance: user.rakeback.available
                },
                'rakeback.available': 0,
                updatedAt: new Date().getTime()
            }, { new: true }).select('balance xp stats rakeback mute ban verifiedAt updatedAt'),
            BalanceTransaction.create({
                amount: user.rakeback.available,
                type: 'rakebackClaim',
                user: user._id,
                state: 'completed'
            })
        ]);

        callback({ success: true, user: dataDatabase[0] });

        socketRemoveAntiSpam(user._id);
    } catch(err) {
        socketRemoveAntiSpam(socket.decoded._id);
        callback({ success: false, error: { type: 'error', message: err.message } });
    }
}

module.exports = {
    generalSendRakebackClaimSocket
}