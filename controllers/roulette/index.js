// Load database models
const User = require('../../database/models/User');
const RouletteGame = require('../../database/models/RouletteGame');
const RouletteBet = require('../../database/models/RouletteBet');
const Rain = require('../../database/models/Rain');
const Leaderboard = require('../../database/models/Leaderboard');

// Load utils
const { AFFILIATE_RATE, generalAffiliateCreditReferrer } = require('../../utils/general/affiliate');
const {
    socketRemoveAntiSpam
} = require('../../utils/socket');
const {
    settingGet
} = require('../../utils/setting');
const {
    ROULETTE_TYPES,
    ROULETTE_BETTING_TIME,
    ROULETTE_SPIN_TIME,
    ROULETTE_RESULT_TIME,
    rouletteGetPayout,
    rouletteCheckSendBetData,
    rouletteCheckSendBetUser,
    rouletteCheckSendBetGame,
    rouletteGenerateSeed,
    rouletteGetOutcome,
    rouletteSanitizeGame
} = require('../../utils/roulette');
const {
    generalUserGetRakeback,
    generalUserGetFormated
} = require('../../utils/general/user');

// Load controllers
const {
    generalAddBetsList
} = require('../general/bets');

// One entry per table: standard tables first, then high roller tables.
let rouletteTables = [];
for(const type of Object.keys(ROULETTE_TYPES)) {
    for(let index = 0; index < ROULETTE_TYPES[type].count; index++) {
        rouletteTables.push({ table: rouletteTables.length, type: type, game: null, bets: [], history: [], pending: 0 });
    }
}

const rouletteRoom = (table) => 'table-' + table;

const rouletteSanitizeBet = (bet) => ({ _id: bet._id, amount: bet.amount, bets: bet.bets, user: bet.userFormated, createdAt: bet.createdAt });

// Lobby card data: phase, players and last numbers, without every chip.
const rouletteGetSummary = (table) => {
    let players = {};
    for(const bet of table.bets) {
        const id = bet.user._id.toString();
        if(players[id] === undefined) { players[id] = { user: bet.userFormated, amount: 0 }; }
        players[id].amount += bet.amount;
    }

    return {
        table: table.table,
        type: table.type,
        game: rouletteSanitizeGame(table.game),
        players: Object.values(players),
        amount: table.bets.reduce((total, bet) => total + bet.amount, 0),
        history: table.history.slice(0, 12)
    };
}

const rouletteGetData = () => {
    return { tables: rouletteTables.map(rouletteGetSummary), limits: ROULETTE_TYPES };
}

const rouletteGetTableData = (index) => {
    const table = rouletteTables[index];
    if(table === undefined) { return null; }

    return {
        table: table.table,
        type: table.type,
        game: rouletteSanitizeGame(table.game),
        bets: table.bets.map(rouletteSanitizeBet),
        history: table.history.slice(0, 12)
    };
}

const rouletteEmitTable = (io, table) => {
    io.of('/roulette').emit('table', { table: rouletteGetSummary(table) });
}

const rouletteSendBetSocket = async(io, socket, user, data, callback) => {
    try {
        // Validate sent chips and the table round
        const bet = rouletteCheckSendBetData(data, rouletteTables.length);
        const table = rouletteTables[bet.table];
        rouletteCheckSendBetGame(table.game);

        // Validate balance and the table limits against what the user already placed this round
        const placed = table.bets.filter((element) => element.user._id.toString() === user._id.toString()).reduce((total, element) => total + element.amount, 0);
        rouletteCheckSendBetUser(bet, user, table.type, placed);

        table.pending = table.pending + 1;

        try {
            const game = table.game;

            // Take the stake and store the chips
            let dataDatabase = await Promise.all([
                User.findByIdAndUpdate(user._id, {
                    $inc: {
                        balance: -bet.amount,
                        'stats.bet': bet.amount
                    },
                    updatedAt: new Date().getTime()
                }, { new: true }).select('balance xp stats rakeback mute ban verifiedAt updatedAt').lean(),
                RouletteBet.create({
                    amount: bet.amount,
                    bets: bet.bets,
                    game: game._id,
                    user: user._id
                })
            ]);

            let created = dataDatabase[1].toObject();
            created.user = {
                _id: user._id,
                rakeback: generalUserGetRakeback(user),
                affiliates: user.affiliates,
                limits: user.limits
            };
            created.userFormated = generalUserGetFormated(user);

            // The round may have moved on while the database was writing; refund in that case
            if(table.game === null || table.game._id.toString() !== game._id.toString()) {
                await Promise.all([
                    User.updateOne({ _id: user._id }, { $inc: { balance: bet.amount, 'stats.bet': -bet.amount } }),
                    RouletteBet.updateOne({ _id: created._id }, { payout: bet.amount })
                ]);
                throw new Error('No more bets, wait for the next spin.');
            }

            table.bets.push(created);

            io.of('/roulette').to(rouletteRoom(table.table)).emit('bet', { table: table.table, bet: rouletteSanitizeBet(created) });
            rouletteEmitTable(io, table);

            callback({ success: true, user: dataDatabase[0], bet: rouletteSanitizeBet(created) });
            table.pending = table.pending - 1;
            socketRemoveAntiSpam(user._id);
        } catch(err) {
            table.pending = table.pending - 1;
            socketRemoveAntiSpam(socket.decoded._id);
            callback({ success: false, error: { type: 'error', message: err.message } });
        }
    } catch(err) {
        socketRemoveAntiSpam(socket.decoded._id);
        callback({ success: false, error: { type: 'error', message: err.message } });
    }
}

const rouletteGameStart = async(io, table) => {
    try {
        table.bets = [];

        const seed = rouletteGenerateSeed();
        const game = await RouletteGame.create({ table: table.table, type: table.type, fair: seed, state: 'created' });

        table.game = { ...game.toObject(), endsAt: new Date().getTime() + ROULETTE_BETTING_TIME };

        io.of('/roulette').to(rouletteRoom(table.table)).emit('game', { table: table.table, game: rouletteSanitizeGame(table.game) });
        rouletteEmitTable(io, table);

        setTimeout(() => { rouletteGameSpin(io, table); }, ROULETTE_BETTING_TIME);
    } catch(err) {
        console.error(err);
        setTimeout(() => { rouletteGameStart(io, table); }, 5000);
    }
}

const rouletteGameSpin = (io, table) => {
    try {
        // Wait for bets that are still being written
        if(table.pending > 0) {
            setTimeout(() => { rouletteGameSpin(io, table); }, 300);
            return;
        }

        table.game.outcome = rouletteGetOutcome(table.game._id, table.game.fair.seedServer);
        table.game.state = 'spinning';
        table.game.endsAt = new Date().getTime() + ROULETTE_SPIN_TIME;

        io.of('/roulette').to(rouletteRoom(table.table)).emit('game', { table: table.table, game: rouletteSanitizeGame(table.game) });
        rouletteEmitTable(io, table);

        setTimeout(() => { rouletteGameComplete(io, table); }, ROULETTE_SPIN_TIME);
    } catch(err) {
        console.error(err);
    }
}

const rouletteGameComplete = async(io, table) => {
    try {
        const game = table.game;
        const bets = table.bets;

        // Get running leaderboard from database if available
        const leaderboardDatabase = await Leaderboard.findOne({ state: 'running' }).select('state').lean();

        // Get settings
        const settings = settingGet();

        let promisesUsers = [];
        let promisesAffiliates = [];
        let promisesBets = [];
        let amountBetRain = 0;

        for(const bet of bets) {
            const amountPayout = rouletteGetPayout(bet.bets, game.outcome);
            const multiplier = Math.floor(amountPayout / bet.amount * 100);
            const amountLimits = amountPayout === 0 || multiplier >= 125 ? bet.amount : amountPayout;
            const sponsored = bet.user.limits.blockSponsor === true;
            const amountRakeback = sponsored !== true ? Math.floor(bet.amount * bet.user.rakeback.percentage * settings.general.reward.multiplier) : 0;
            const amountAffiliate = bet.user.affiliates.referrer !== undefined && sponsored !== true ? Math.floor(bet.amount * AFFILIATE_RATE) : 0;

            amountBetRain = amountBetRain + (sponsored !== true ? bet.amount : 0);

            promisesUsers.push(
                User.findByIdAndUpdate(bet.user._id, {
                    $inc: {
                        balance: amountPayout,
                        xp: sponsored !== true ? Math.floor(bet.amount * settings.general.reward.multiplier) : 0,
                        'stats.won': amountPayout,
                        'leaderboard.points': leaderboardDatabase !== null && sponsored !== true && bet.user.limits.blockLeaderboard !== true ? bet.amount : 0,
                        'limits.betToWithdraw': Math.floor(bet.user.limits.betToWithdraw - amountLimits) <= 0 ? -bet.user.limits.betToWithdraw : -amountLimits,
                        'limits.betToRain': Math.floor(bet.user.limits.betToRain - amountLimits) <= 0 ? -bet.user.limits.betToRain : -amountLimits,
                        'rakeback.earned': amountRakeback,
                        'rakeback.available': amountRakeback,
                        'affiliates.generated': amountAffiliate
                    },
                    updatedAt: new Date().getTime()
                }, { new: true }).select('balance xp stats rakeback mute ban verifiedAt updatedAt').lean()
            );

            if(bet.user.affiliates.referrer !== undefined && amountAffiliate > 0) {
                promisesAffiliates.push(
                    generalAffiliateCreditReferrer(bet.user.affiliates.referrer, amountAffiliate)
                );
            }

            promisesBets.push(
                RouletteBet.findByIdAndUpdate(bet._id, {
                    payout: amountPayout,
                    multiplier: multiplier,
                    updatedAt: new Date().getTime()
                }, { new: true }).select('amount payout multiplier user updatedAt createdAt').populate({
                    path: 'user',
                    select: 'roblox.id username avatar rank xp stats rakeback anonymous createdAt'
                }).lean()
            );
        }

        const dataDatabase = await Promise.all([
            RouletteGame.findByIdAndUpdate(game._id, {
                outcome: game.outcome,
                state: 'completed',
                updatedAt: new Date().getTime()
            }, {}),
            Rain.findOneAndUpdate({ type: 'site', $or: [{ state: 'created' }, { state: 'pending' }, { state: 'running' }] }, {
                $inc: {
                    amount: Math.floor(amountBetRain * 0.001)
                }
            }, { new: true }).select('amount participants type state updatedAt').lean(),
            ...promisesUsers,
            ...promisesAffiliates,
            ...promisesBets
        ]);

        game.state = 'completed';
        game.endsAt = new Date().getTime() + ROULETTE_RESULT_TIME;
        table.history.unshift(game.outcome);
        if(table.history.length > 25) { table.history.pop(); }

        io.of('/roulette').to(rouletteRoom(table.table)).emit('game', { table: table.table, game: rouletteSanitizeGame(game) });
        rouletteEmitTable(io, table);

        if(dataDatabase[1] !== null && amountBetRain > 0) { io.of('/general').emit('rain', { rain: dataDatabase[1] }); }

        for(const user of dataDatabase.slice(2, promisesUsers.length + 2)) {
            if(user !== null) { io.of('/general').to(user._id.toString()).emit('user', { user: user }); }
        }

        for(const bet of dataDatabase.slice(promisesUsers.length + promisesAffiliates.length + 2)) {
            if(bet !== null) { generalAddBetsList(io, { ...bet, user: generalUserGetFormated(bet.user), method: 'roulette' }); }
        }

        setTimeout(() => { rouletteGameStart(io, table); }, ROULETTE_RESULT_TIME);
    } catch(err) {
        console.error(err);
        setTimeout(() => { rouletteGameStart(io, table); }, ROULETTE_RESULT_TIME);
    }
}

const rouletteInit = async(io) => {
    try {
        // Refund rounds that were interrupted by a restart
        const unfinished = await RouletteGame.find({ state: { $nin: ['completed', 'cancelled'] } }).select('_id').lean();
        if(unfinished.length > 0) {
            const ids = unfinished.map((game) => game._id);
            const bets = await RouletteBet.find({ game: { $in: ids }, payout: { $exists: false } }).select('amount user').lean();

            await Promise.all([
                ...bets.map((bet) => User.updateOne({ _id: bet.user }, { $inc: { balance: bet.amount, 'stats.bet': -bet.amount } })),
                RouletteBet.updateMany({ game: { $in: ids }, payout: { $exists: false } }, [{ $set: { payout: '$amount', multiplier: 100 } }]),
                RouletteGame.updateMany({ _id: { $in: ids } }, { state: 'cancelled', updatedAt: new Date().getTime() })
            ]);
        }

        // Last numbers of every table
        const histories = await Promise.all(rouletteTables.map((table) =>
            RouletteGame.find({ table: table.table, state: 'completed' }).sort({ createdAt: -1 }).limit(25).select('outcome').lean()
        ));
        histories.forEach((games, index) => { rouletteTables[index].history = games.map((game) => game.outcome); });

        // Stagger the tables so they do not all spin at once
        rouletteTables.forEach((table, index) => {
            setTimeout(() => { rouletteGameStart(io, table); }, index * 2300);
        });
    } catch(err) {
        console.error(err);
    }
}

module.exports = {
    rouletteGetData,
    rouletteGetTableData,
    rouletteSendBetSocket,
    rouletteInit
}
