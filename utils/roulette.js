const crypto = require('crypto');

// Live European roulette: single zero, so every bet returns 97.3% (36/37).
// Each round gets its own server seed; its hash is shown while bets are open and
// the seed itself once the round is over. Pocket = sha256(`${gameId}-${seedServer}`).

const ROULETTE_RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const ROULETTE_BETS = {
    number: { values: [...Array(37).keys()], multiplier: 36 },
    dozen: { values: [1, 2, 3], multiplier: 3 },
    column: { values: [1, 2, 3], multiplier: 3 },
    color: { values: ['red', 'black'], multiplier: 2 },
    parity: { values: ['even', 'odd'], multiplier: 2 },
    half: { values: ['low', 'high'], multiplier: 2 }
};
const ROULETTE_MAX_SPOTS = 60;

// Table limits are per player and per round, in coins.
const ROULETTE_TYPES = {
    standard: { count: 6, min: 0.1, max: 1000 },
    whale: { count: 3, min: 50, max: 25000 }
};

// Round timings in ms.
const ROULETTE_BETTING_TIME = 18000;
const ROULETTE_SPIN_TIME = 6000;
const ROULETTE_RESULT_TIME = 4000;

const rouletteFormatAmount = (value) => parseFloat(value).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const rouletteBetWins = (bet, number) => {
    if(bet.type === 'number') { return bet.value === number; }
    if(number === 0) { return false; }
    if(bet.type === 'dozen') { return Math.ceil(number / 12) === bet.value; }
    if(bet.type === 'column') { return ((number - 1) % 3) + 1 === bet.value; }
    if(bet.type === 'color') { return ROULETTE_RED.includes(number) === (bet.value === 'red'); }
    if(bet.type === 'parity') { return (number % 2 === 0) === (bet.value === 'even'); }
    return (number <= 18) === (bet.value === 'low');
}

const rouletteGetPayout = (bets, number) => {
    return bets.reduce((total, bet) => total + (rouletteBetWins(bet, number) === true ? bet.amount * ROULETTE_BETS[bet.type].multiplier : 0), 0);
}

// Validates the chips sent for a table and merges chips placed on the same spot.
// Returns { table, bets, amount }.
const rouletteCheckSendBetData = (data, tableCount) => {
    if(data === undefined || data === null) {
        throw new Error('Something went wrong. Please try again in a few seconds.');
    } else if(Number.isInteger(data.table) !== true || data.table < 0 || data.table >= tableCount) {
        throw new Error('This table does not exist.');
    } else if(Array.isArray(data.bets) !== true || data.bets.length === 0) {
        throw new Error('Place at least one chip on the table.');
    }

    let merged = {};
    for(const bet of data.bets) {
        const valid = bet !== null && typeof bet === 'object';
        const rule = valid === true ? ROULETTE_BETS[bet.type] : undefined;
        const value = valid === true && typeof bet.value === 'number' ? Math.floor(bet.value) : (valid === true ? bet.value : undefined);
        if(rule === undefined || rule.values.includes(value) !== true) {
            throw new Error('One of your chips is on an invalid spot.');
        } else if(isNaN(bet.amount) === true || Math.floor(bet.amount) <= 0) {
            throw new Error('One of your chips has an invalid amount.');
        }

        const key = bet.type + ':' + value;
        if(merged[key] === undefined) { merged[key] = { type: bet.type, value: value, amount: 0 }; }
        merged[key].amount += Math.floor(bet.amount);
    }

    const bets = Object.values(merged);
    if(bets.length > ROULETTE_MAX_SPOTS) {
        throw new Error('You can only bet on ' + ROULETTE_MAX_SPOTS + ' spots per spin.');
    }

    return { table: data.table, bets: bets, amount: bets.reduce((total, bet) => total + bet.amount, 0) };
}

// `placed` is what the user already has on this round.
const rouletteCheckSendBetUser = (bet, user, type, placed) => {
    const limits = ROULETTE_TYPES[type];

    if(user.balance < bet.amount) {
        throw new Error('You don’t have enough balance for this action.');
    } else if(placed + bet.amount < Math.floor(limits.min * 1000)) {
        throw new Error('The minimum bet on this table is ' + rouletteFormatAmount(limits.min) + ' per spin.');
    } else if(placed + bet.amount > Math.floor(limits.max * 1000)) {
        throw new Error('The maximum bet on this table is ' + rouletteFormatAmount(limits.max) + ' per spin.');
    }
}

const rouletteCheckSendBetGame = (game) => {
    if(game === null || game === undefined) {
        throw new Error('Something went wrong. Please try again in a few seconds.');
    } else if(game.state !== 'created' || new Date().getTime() > game.endsAt) {
        throw new Error('No more bets, wait for the next spin.');
    }
}

const rouletteGenerateSeed = () => {
    const seedServer = crypto.randomBytes(24).toString('hex');
    return { seedServer: seedServer, hash: crypto.createHash('sha256').update(seedServer).digest('hex') };
}

const rouletteGetOutcome = (gameId, seedServer) => {
    const combined = crypto.createHash('sha256').update(`${gameId}-${seedServer}`).digest('hex');
    return Math.floor(parseInt(combined.substr(0, 8), 16) / 0x100000000 * 37);
}

// The server seed only leaves the server once the round is over.
const rouletteSanitizeGame = (game) => {
    if(game === null) { return null; }

    return {
        _id: game._id,
        table: game.table,
        type: game.type,
        outcome: game.state === 'spinning' || game.state === 'completed' ? game.outcome : undefined,
        fair: { hash: game.fair.hash, ...(game.state === 'completed' ? { seedServer: game.fair.seedServer } : {}) },
        state: game.state,
        // Time left in the current phase, so clients do not depend on their own clock
        remaining: Math.max(0, (game.endsAt || 0) - new Date().getTime()),
        createdAt: game.createdAt
    };
}

module.exports = {
    ROULETTE_RED,
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
}
