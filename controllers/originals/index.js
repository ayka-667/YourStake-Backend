const crypto = require('crypto');

// Load database models
const User = require('../../database/models/User');
const UserSeed = require('../../database/models/UserSeed');
const OriginalGame = require('../../database/models/OriginalGame');
const Leaderboard = require('../../database/models/Leaderboard');
const Rain = require('../../database/models/Rain');

// Load utils
const {
    socketRemoveAntiSpam
} = require('../../utils/socket');
const {
    settingGet
} = require('../../utils/setting');
const {
    PLINKO_TABLES,
    DICE_EDGE,
    FLIP_MULTIPLIER,
    ROULETTE_RED,
    originalsCheckSendBetData,
    originalsCheckSendBetUser,
    originalsCheckSendBetSeed,
    originalsGetResult,
    originalsSanitizeGame
} = require('../../utils/originals');
const {
    generalUserGetRakeback,
    generalUserGetFormated
} = require('../../utils/general/user');

// Load controllers
const {
    generalAddBetsList
} = require('../general/bets');

const originalsGetConfig = () => {
    return { plinko: PLINKO_TABLES, diceEdge: DICE_EDGE, flipMultiplier: FLIP_MULTIPLIER, rouletteRed: ROULETTE_RED };
}

const originalsSendBetSocket = async(io, socket, user, data, callback) => {
    try {
        // Validate sent data
        originalsCheckSendBetData(data);

        // Validate user
        originalsCheckSendBetUser(data, user);

        // Get user seed from database and check if available
        const seedDatabase = await UserSeed.findOne({ user: user._id, state: 'active' }).select('seedClient seedServer nonce user state');
        originalsCheckSendBetSeed(seedDatabase);

        // Get running leaderboard from database if available
        const leaderboardDatabase = await Leaderboard.findOne({ state: 'running' }).select('state').lean();

        // Get user bet amount
        const amount = Math.floor(data.amount);

        // Get settings
        const settings = settingGet();

        // Get user rakeback rank
        const rakeback = generalUserGetRakeback(user);

        // Get user rakeback amount
        const amountRakeback = user.limits.blockSponsor !== true ? Math.floor(amount * rakeback.percentage * settings.general.reward.multiplier) : 0;

        // Get user affiliate amount
        const amountAffiliate = user.affiliates.referrer !== undefined && user.limits.blockSponsor !== true ? Math.floor(amount * 0.005) : 0;

        // Combine nonce, server seed and client seed to one string and hash it
        const combined = `${seedDatabase.seedServer}-${seedDatabase.nonce}-${seedDatabase.seedClient}`;
        const hash = crypto.createHash('sha256').update(combined).digest('hex');

        // Get game result
        const result = originalsGetResult(data, hash);

        // Get payout amount and stored multiplier (x100, like the other games)
        const amountPayout = result.payout !== undefined ? result.payout : Math.floor(amount * result.multiplier);
        const multiplier = Math.floor(result.multiplier * 100);

        // Get limits amount
        const amountLimits = amountPayout === 0 || multiplier >= 125 ? amount : amountPayout;

        // Get rain bet amount if user is not sponsored
        const amountBetRain = user.limits.blockSponsor !== true ? amount : 0;

        // Create database query promises array
        let promises = [
            User.findByIdAndUpdate(user._id, {
                $inc: {
                    balance: amountPayout - amount,
                    xp: user.limits.blockSponsor !== true ? Math.floor(amount * settings.general.reward.multiplier) : 0,
                    'stats.bet': amount,
                    'stats.won': amountPayout,
                    'leaderboard.points': leaderboardDatabase !== null && user.limits.blockSponsor !== true && user.limits.blockLeaderboard !== true ? amount : 0,
                    'affiliates.generated': amountAffiliate,
                    'rakeback.earned': amountRakeback,
                    'rakeback.available': amountRakeback,
                    'limits.betToWithdraw': Math.floor(user.limits.betToWithdraw - amountLimits) <= 0 ? -user.limits.betToWithdraw : -amountLimits,
                    'limits.betToRain': Math.floor(user.limits.betToRain - amountLimits) <= 0 ? -user.limits.betToRain : -amountLimits
                },
                updatedAt: new Date().getTime()
            }, { new: true }).select('balance xp stats rakeback mute ban verifiedAt updatedAt').lean(),
            UserSeed.findByIdAndUpdate(seedDatabase._id, {
                $inc: {
                    nonce: 1
                }
            }, {}),
            OriginalGame.create({
                game: data.game,
                amount: amount,
                payout: amountPayout,
                multiplier: multiplier,
                options: result.options,
                outcome: result.outcome,
                fair: {
                    seed: seedDatabase._id,
                    nonce: seedDatabase.nonce
                },
                user: user._id,
                state: 'completed'
            }),
            Rain.findOneAndUpdate({ type: 'site', $or: [{ state: 'created' }, { state: 'pending' }, { state: 'running' }] }, {
                $inc: {
                    amount: Math.floor(amountBetRain * 0.001)
                }
            }, { new: true }).select('amount participants type state updatedAt').lean()
        ];

        // Add update users referrer query to promises array if available and affiliate amount is bigger then zero
        if(user.affiliates.referrer !== undefined && amountAffiliate > 0) {
            promises.push(
                User.findByIdAndUpdate(user.affiliates.referrer, {
                    $inc: {
                        'affiliates.earned': amountAffiliate,
                        'affiliates.available': amountAffiliate
                    },
                    updatedAt: new Date().getTime()
                }, {})
            );
        }

        // Execute promise queries in database
        let dataDatabase = await Promise.all(promises);

        // Convert game object to javascript object
        const game = dataDatabase[2].toObject();

        // Send updated rain to frontend
        if(dataDatabase[3] !== null) { io.of('/general').emit('rain', { rain: dataDatabase[3] }); }

        // Add game to the live bets list once the client animation has had time to play
        const delay = data.game === 'roulette' ? 4500 : data.game === 'plinko' ? 2500 : data.game === 'flip' ? 1200 : 600;
        setTimeout(() => {
            generalAddBetsList(io, { ...originalsSanitizeGame(game), user: generalUserGetFormated(user), method: data.game });
        }, delay);

        callback({ success: true, user: dataDatabase[0], game: originalsSanitizeGame(game) });

        socketRemoveAntiSpam(user._id);
    } catch(err) {
        socketRemoveAntiSpam(socket.decoded._id);
        callback({ success: false, error: { type: 'error', message: err.message } });
    }
}

module.exports = {
    originalsGetConfig,
    originalsSendBetSocket
}
