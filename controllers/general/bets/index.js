const mongoose = require('mongoose');

// Load database models
const CrashBet = require('../../../database/models/CrashBet');
const RollBet = require('../../../database/models/RollBet');
const BlackjackBet = require('../../../database/models/BlackjackBet');
const DuelsBet = require('../../../database/models/DuelsBet');
const MinesGame = require('../../../database/models/MinesGame');
const TowersGame = require('../../../database/models/TowersGame');
const OriginalGame = require('../../../database/models/OriginalGame');
const RouletteBet = require('../../../database/models/RouletteBet');

// Load utils
const {
    generalUserGetFormated
} = require('../../../utils/general/user');

// Load controllers
const {
    generalChatAddMessage
} = require('../chat');

// Crash variables
let generalBets = { all: [], whale: [], lucky: [], my: [] };

// Big wins announced in the chat: a big payout of at least x2, or a high multiplier with a decent payout (amounts x1000, multiplier x100)
const BIG_WIN_PAYOUT = Math.floor((process.env.BIG_WIN_PAYOUT !== undefined ? Number(process.env.BIG_WIN_PAYOUT) : 1000) * 1000);
const BIG_WIN_MULTIPLIER = Math.floor((process.env.BIG_WIN_MULTIPLIER !== undefined ? Number(process.env.BIG_WIN_MULTIPLIER) : 50) * 100);
const BIG_WIN_MULTIPLIER_PAYOUT = 100 * 1000;
const BIG_WIN_INTERVAL = 1000 * 30;
let generalBigWinLast = 0;

const generalCheckBigWin = (io, bet) => {
    // Some games don't send the multiplier with the bet: payout / amount gives it back
    const multiplier = typeof bet.multiplier === 'number' && isNaN(bet.multiplier) !== true ? bet.multiplier : (bet.amount > 0 ? Math.floor(bet.payout / bet.amount * 100) : 0);
    const big = (bet.payout >= BIG_WIN_PAYOUT && multiplier >= 200) || (multiplier >= BIG_WIN_MULTIPLIER && bet.payout >= BIG_WIN_MULTIPLIER_PAYOUT);
    if(big !== true || bet.payout <= bet.amount || new Date().getTime() - generalBigWinLast < BIG_WIN_INTERVAL) { return; }
    generalBigWinLast = new Date().getTime();

    generalChatAddMessage(io, {
        type: 'bigWin',
        bet: {
            amount: bet.amount,
            payout: bet.payout,
            multiplier: multiplier,
            method: bet.method,
            user: bet.user !== null && bet.user !== undefined ? { _id: bet.user._id, username: bet.user.username, avatar: bet.user.avatar, rank: bet.user.rank, level: bet.user.level } : null
        }
    });
}

const generalGetBetsDataSocket = async(io, socket, user, data, callback) => {
    try {
        // Create bets variable
        let bets = generalBets;

        // If the user is logged in add users bets to bets variable
        if(user !== undefined && user !== null) {
            // Create promises array and add user bet querys to the promise array
            let promises = [
                CrashBet.find({ payout: { $exists: true, $ne: null }, user: user._id }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
                RollBet.find({ payout: { $exists: true, $ne: null }, user: user._id }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
                BlackjackBet.find({ payout: { $exists: true, $ne: null }, user: user._id }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier actions user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
                DuelsBet.find({ payout: { $exists: true, $ne: null }, user: user._id, bot: false }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier user bot updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
                MinesGame.find({ payout: { $exists: true, $ne: null }, user: user._id }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
                TowersGame.find({ payout: { $exists: true, $ne: null }, user: user._id }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
                OriginalGame.find({ user: user._id }).sort({ updatedAt: -1 }).limit(15).select('game amount payout multiplier options outcome user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
                RouletteBet.find({ payout: { $exists: true, $ne: null }, user: user._id }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean()
            ];

            // Execute the user get querys
            const dataDatabase = await Promise.all(promises);

            // Add game mode to bet object
            bets.my = [ 
                ...dataDatabase[0].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'crash'})), 
                ...dataDatabase[1].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'roll'})), 
                ...dataDatabase[2].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'blackjack'})), 
                ...dataDatabase[3].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'duels'})),
                ...dataDatabase[4].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'mines'})),
                ...dataDatabase[5].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'towers'})),
                ...dataDatabase[6].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: bet.game})),
                ...dataDatabase[7].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'roulette'}))
            ];

            // Sort bets by date
            bets.my.sort((a, b) => { return new Date(b.updatedAt) - new Date(a.updatedAt); });

            // Short bets arrays to 15 bets
            bets.my = bets.my.slice(0, 15);
        }

        callback({ success: true, bets: bets });
    } catch(err) {
        callback({ success: false, error: { type: 'error', message: err.message } });
    }
}


const generalAddBetsList = (io, bet) => {
    try {
        // Add bet to all bets, sort all bets and limit to a count of 15 bets
        generalBets.all.unshift(bet);
        generalBets.all.sort((a, b) => { return new Date(b.updatedAt) - new Date(a.updatedAt); });
        if(generalBets.all.length > 15) { generalBets.all.pop(); }

        // Add bet to whale bets, sort whale bets and limit to a count of 15 bets if payout is >= DL10,000
        if(bet.payout >= 1000000) {
            generalBets.whale.unshift(bet);
            generalBets.whale.sort((a, b) => { return new Date(b.updatedAt) - new Date(a.updatedAt); });
            if(generalBets.whale.length > 15) { generalBets.whale.pop(); }
        }

        // Add bet to whale bets, sort whale bets and limit to a count of 15 bets if multiplier is >= 5x
        if(bet.payout >= 10 && bet.multiplier >= 500) {
            generalBets.lucky.unshift(bet);
            generalBets.lucky.sort((a, b) => { return new Date(b.updatedAt) - new Date(a.updatedAt); });
            if(generalBets.lucky.length > 15) { generalBets.lucky.pop(); }
        }

        // Send bet to frontend
        io.of('/general').emit('bet', { bet: bet });

        // Announce big wins in the chat
        generalCheckBigWin(io, bet);
    } catch(err) {
        console.error(err);
    }
}

const generalBetsInit = async() => {
    try {
        // Create promises array with get all and high bet querys
        let promises = [
            CrashBet.find({ payout: { $exists: true, $ne: null } }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
            RollBet.find({ payout: { $exists: true, $ne: null } }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
            BlackjackBet.find({ payout: { $exists: true, $ne: null } }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier actions user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
            DuelsBet.find({ payout: { $exists: true, $ne: null }, bot: false }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier user bot updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
            MinesGame.find({ payout: { $exists: true, $ne: null } }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
            TowersGame.find({ payout: { $exists: true, $ne: null } }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
            CrashBet.find({ payout: { $exists: true, $ne: null, $gte: 10000000 } }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
            RollBet.find({ payout: { $exists: true, $ne: null, $gte: 10000000 } }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
            BlackjackBet.find({ payout: { $exists: true, $ne: null, $gte: 10000000 } }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier actions user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
            DuelsBet.find({ payout: { $exists: true, $ne: null, $gte: 10000000 }, bot: false }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier user bot updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
            MinesGame.find({ payout: { $exists: true, $ne: null, $gte: 10000000 } }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
            TowersGame.find({ payout: { $exists: true, $ne: null, $gte: 10000000 } }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
            CrashBet.find({ payout: { $exists: true, $ne: null, $gte: 10 }, multiplier: { $gte: 500 } }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
            RollBet.find({ payout: { $exists: true, $ne: null, $gte: 10 }, multiplier: { $gte: 500 } }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
            BlackjackBet.find({ payout: { $exists: true, $ne: null, $gte: 10 }, multiplier: { $gte: 500 } }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier actions user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
            DuelsBet.find({ payout: { $exists: true, $ne: null, $gte: 10 }, multiplier: { $gte: 500 }, bot: false }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier user bot updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
            MinesGame.find({ payout: { $exists: true, $ne: null, $gte: 10 }, multiplier: { $gte: 500 } }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
            TowersGame.find({ payout: { $exists: true, $ne: null, $gte: 10 }, multiplier: { $gte: 500 } }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
            OriginalGame.find({}).sort({ updatedAt: -1 }).limit(15).select('game amount payout multiplier options outcome user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
            OriginalGame.find({ payout: { $gte: 10000000 } }).sort({ updatedAt: -1 }).limit(15).select('game amount payout multiplier options outcome user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
            OriginalGame.find({ payout: { $gte: 10 }, multiplier: { $gte: 500 } }).sort({ updatedAt: -1 }).limit(15).select('game amount payout multiplier options outcome user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
            RouletteBet.find({ payout: { $exists: true, $ne: null } }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
            RouletteBet.find({ payout: { $exists: true, $ne: null, $gte: 10000000 } }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean(),
            RouletteBet.find({ payout: { $exists: true, $ne: null, $gte: 10 }, multiplier: { $gte: 500 } }).sort({ updatedAt: -1 }).limit(15).select('amount payout multiplier user updatedAt createdAt').populate({ path: 'user', select: 'roblox.id username avatar rank xp stats rakeback anonymous' }).lean()
        ];

        // Execute the user get querys
        const dataDatabase = await Promise.all(promises);

        // Add game mode to bet object
        generalBets.all = [ 
            ...dataDatabase[0].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'crash'})), 
            ...dataDatabase[1].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'roll'})), 
            ...dataDatabase[2].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'blackjack'})), 
            ...dataDatabase[3].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'duels'})), 
            ...dataDatabase[4].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'mines'})), 
            ...dataDatabase[5].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'towers'})), 
            ...dataDatabase[18].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: bet.game})),
            ...dataDatabase[21].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'roulette'}))
        ];
        generalBets.whale = [ 
            ...dataDatabase[6].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'crash'})), 
            ...dataDatabase[7].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'roll'})), 
            ...dataDatabase[8].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'blackjack'})), 
            ...dataDatabase[9].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'duels'})), 
            ...dataDatabase[10].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'mines'})), 
            ...dataDatabase[11].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'towers'})), 
            ...dataDatabase[19].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: bet.game})),
            ...dataDatabase[22].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'roulette'}))
        ];
        generalBets.lucky = [ 
            ...dataDatabase[12].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'crash'})), 
            ...dataDatabase[13].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'roll'})), 
            ...dataDatabase[14].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'blackjack'})), 
            ...dataDatabase[15].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'duels'})), 
            ...dataDatabase[16].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'mines'})), 
            ...dataDatabase[17].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'towers'})), 
            ...dataDatabase[20].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: bet.game})),
            ...dataDatabase[23].map((bet) => ({...bet, user: generalUserGetFormated(bet.user), method: 'roulette'}))
        ];

        // Sort bets by date
        generalBets.all.sort((a, b) => { return new Date(b.updatedAt) - new Date(a.updatedAt); });
        generalBets.whale.sort((a, b) => { return new Date(b.updatedAt) - new Date(a.updatedAt); });
        generalBets.lucky.sort((a, b) => { return new Date(b.updatedAt) - new Date(a.updatedAt); });

        // Short bets arrays to 15 bets
        generalBets.all = generalBets.all.slice(0, 15);
        generalBets.whale = generalBets.whale.slice(0, 15);
        generalBets.lucky = generalBets.lucky.slice(0, 15);
    } catch(err) {
        console.error(err);
    }
}

module.exports = {
    generalGetBetsDataSocket,
    generalAddBetsList,
    generalBetsInit
}
