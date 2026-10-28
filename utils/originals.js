// Instant games: plinko, dice, flip and roulette.
// Every outcome is derived from sha256(`${seedServer}-${nonce}-${seedClient}`), the
// same provably fair scheme as mines and towers, so any round can be re-computed.

const ORIGINALS_GAMES = ['plinko', 'dice', 'flip', 'roulette'];

const ORIGINALS_MIN_AMOUNT = process.env.ORIGINALS_MIN_AMOUNT !== undefined ? Number(process.env.ORIGINALS_MIN_AMOUNT) : 0.01;
const ORIGINALS_MAX_AMOUNT = process.env.ORIGINALS_MAX_AMOUNT !== undefined ? Number(process.env.ORIGINALS_MAX_AMOUNT) : 100000;

// Plinko payout tables (risk -> rows -> slot multipliers). Each table returns
// between 96% and 99% to the player over the binomial landing distribution.
const PLINKO_TABLES = {
    low: {
        8: [4.2, 2.5, 1.4, 0.8, 0.5, 0.8, 1.4, 2.5, 4.2],
        9: [4.6, 2.8, 1.7, 1, 0.6, 0.6, 1, 1.7, 2.8, 4.6],
        10: [4.9, 3.1, 2, 1.2, 0.8, 0.5, 0.8, 1.2, 2, 3.1, 4.9],
        11: [5.3, 3.4, 2.2, 1.5, 0.9, 0.6, 0.6, 0.9, 1.5, 2.2, 3.4, 5.3],
        12: [6.1, 4, 2.6, 1.7, 1.1, 0.8, 0.5, 0.8, 1.1, 1.7, 2.6, 4, 6.1],
        13: [6.6, 4.4, 3, 2, 1.3, 0.9, 0.6, 0.6, 0.9, 1.3, 2, 3, 4.4, 6.6],
        14: [8.1, 5.4, 3.7, 2.5, 1.6, 1.1, 0.7, 0.5, 0.7, 1.1, 1.6, 2.5, 3.7, 5.4, 8.1],
        15: [7.8, 5.4, 3.8, 2.6, 1.8, 1.2, 0.9, 0.6, 0.6, 0.9, 1.2, 1.8, 2.6, 3.8, 5.4, 7.8],
        16: [9.7, 6.7, 4.6, 3.2, 2.2, 1.5, 1, 0.7, 0.5, 0.7, 1, 1.5, 2.2, 3.2, 4.6, 6.7, 9.7]
    },
    medium: {
        8: [8.4, 3.2, 1.4, 0.7, 0.4, 0.7, 1.4, 3.2, 8.4],
        9: [11, 4.3, 1.8, 0.9, 0.5, 0.5, 0.9, 1.8, 4.3, 11],
        10: [14, 5.9, 2.5, 1.2, 0.6, 0.4, 0.6, 1.2, 2.5, 5.9, 14],
        11: [17, 7.1, 3.2, 1.5, 0.8, 0.5, 0.5, 0.8, 1.5, 3.2, 7.1, 17],
        12: [22, 9.5, 4.3, 2, 1, 0.6, 0.4, 0.6, 1, 2, 4.3, 9.5, 22],
        13: [27, 12, 5.4, 2.6, 1.3, 0.7, 0.5, 0.5, 0.7, 1.3, 2.6, 5.4, 12, 27],
        14: [33, 15, 6.9, 3.4, 1.7, 0.9, 0.6, 0.4, 0.6, 0.9, 1.7, 3.4, 6.9, 15, 33],
        15: [37, 17, 8.2, 4.1, 2.1, 1.2, 0.7, 0.5, 0.5, 0.7, 1.2, 2.1, 4.1, 8.2, 17, 37],
        16: [46, 22, 11, 5.3, 2.8, 1.5, 0.9, 0.5, 0.4, 0.5, 0.9, 1.5, 2.8, 5.3, 11, 22, 46]
    },
    high: {
        8: [32, 5, 1.1, 0.3, 0.2, 0.3, 1.1, 5, 32],
        9: [51, 8.2, 1.7, 0.5, 0.2, 0.2, 0.5, 1.7, 8.2, 51],
        10: [74, 12, 2.7, 0.8, 0.3, 0.2, 0.3, 0.8, 2.7, 12, 74],
        11: [118, 20, 4.4, 1.2, 0.4, 0.2, 0.2, 0.4, 1.2, 4.4, 20, 118],
        12: [169, 31, 6.8, 1.8, 0.6, 0.3, 0.2, 0.3, 0.6, 1.8, 6.8, 31, 169],
        13: [255, 48, 11, 2.8, 0.9, 0.4, 0.2, 0.2, 0.4, 0.9, 2.8, 11, 48, 255],
        14: [364, 71, 16, 4.3, 1.4, 0.5, 0.3, 0.2, 0.3, 0.5, 1.4, 4.3, 16, 71, 364],
        15: [536, 107, 24, 6.5, 2.1, 0.8, 0.4, 0.2, 0.2, 0.4, 0.8, 2.1, 6.5, 24, 107, 536],
        16: [772, 158, 37, 9.8, 3, 1.1, 0.5, 0.3, 0.2, 0.3, 0.5, 1.1, 3, 9.8, 37, 158, 772]
    }
};

// Dice and flip keep 1% for the house.
const DICE_EDGE = 0.99;
const FLIP_MULTIPLIER = 1.98;

// European roulette: single zero, so every bet returns 97.3% (36/37).
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

const rouletteBetWins = (bet, number) => {
    if(bet.type === 'number') { return bet.value === number; }
    if(number === 0) { return false; }
    if(bet.type === 'dozen') { return Math.ceil(number / 12) === bet.value; }
    if(bet.type === 'column') { return ((number - 1) % 3) + 1 === bet.value; }
    if(bet.type === 'color') { return ROULETTE_RED.includes(number) === (bet.value === 'red'); }
    if(bet.type === 'parity') { return (number % 2 === 0) === (bet.value === 'even'); }
    return (number <= 18) === (bet.value === 'low');
}

// Validates the chips placed on the table, merges chips on the same spot and
// sets data.amount to their total so the shared amount checks apply to it.
const rouletteNormalizeBets = (data) => {
    if(Array.isArray(data.bets) !== true || data.bets.length === 0) {
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

    data.bets = Object.values(merged);
    if(data.bets.length > ROULETTE_MAX_SPOTS) {
        throw new Error('You can only bet on ' + ROULETTE_MAX_SPOTS + ' spots per spin.');
    }
    data.amount = data.bets.reduce((total, bet) => total + bet.amount, 0);
}

const originalsFormatAmount = (value) => parseFloat(value).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const originalsCheckSendBetData = (data) => {
    if(data === undefined || data === null) {
        throw new Error('Something went wrong. Please try again in a few seconds.');
    } else if(ORIGINALS_GAMES.includes(data.game) !== true) {
        throw new Error('This game does not exist.');
    }

    if(data.game === 'roulette') { rouletteNormalizeBets(data); }

    if(data.amount === undefined || isNaN(data.amount) === true || Math.floor(data.amount) <= 0) {
        throw new Error('You’ve entered an invalid bet amount.');
    } else if(Math.floor(data.amount) < Math.floor(ORIGINALS_MIN_AMOUNT * 1000)) {
        throw new Error(`You can only bet a min amount of ${originalsFormatAmount(ORIGINALS_MIN_AMOUNT)} per game.`);
    } else if(Math.floor(data.amount) > Math.floor(ORIGINALS_MAX_AMOUNT * 1000)) {
        throw new Error(`You can only bet a max amount of ${originalsFormatAmount(ORIGINALS_MAX_AMOUNT)} per game.`);
    }

    if(data.game === 'plinko') {
        if(PLINKO_TABLES[data.risk] === undefined) {
            throw new Error('You’ve selected an invalid risk.');
        } else if(isNaN(data.rows) === true || PLINKO_TABLES[data.risk][Math.floor(data.rows)] === undefined) {
            throw new Error('You’ve selected an invalid number of rows.');
        }
    } else if(data.game === 'dice') {
        if(['under', 'over'].includes(data.direction) !== true) {
            throw new Error('You’ve selected an invalid direction.');
        } else if(data.target === undefined || isNaN(data.target) === true || Number(data.target) < 2 || Number(data.target) > 98) {
            throw new Error('Your target needs to be between 2.00 and 98.00.');
        }
    } else if(data.game === 'flip') {
        if(['heads', 'tails'].includes(data.side) !== true) {
            throw new Error('You’ve selected an invalid side.');
        }
    }
}

const originalsCheckSendBetUser = (data, user) => {
    if(user.balance < Math.floor(data.amount)) {
        throw new Error('You don’t have enough balance for this action.');
    }
}

const originalsCheckSendBetSeed = (seedDatabase) => {
    if(seedDatabase === null) {
        throw new Error('You need to generate a server seed first.');
    }
}

// Successive 32 bit floats in [0, 1) read from the hash.
const originalsGetFloats = (hash, count) => {
    let floats = [];
    for(let i = 0; i < count; i++) {
        const offset = (i * 8) % 64;
        floats.push(parseInt(hash.substr(offset, 8), 16) / 0x100000000);
    }
    return floats;
}

// Returns { options, outcome, multiplier } where multiplier is a plain float (e.g. 2.5).
// Roulette also returns the exact payout, since it sums several chips.
const originalsGetResult = (data, hash) => {
    if(data.game === 'plinko') {
        const risk = data.risk;
        const rows = Math.floor(data.rows);

        // One bit per row: 0 = left, 1 = right. 16 rows need 16 bits, taken from the hash bytes.
        let path = [];
        for(let i = 0; i < rows; i++) { path.push(parseInt(hash.substr(i * 2, 2), 16) >= 128 ? 1 : 0); }

        const slot = path.reduce((a, b) => a + b, 0);

        return {
            options: { risk: risk, rows: rows },
            outcome: { path: path, slot: slot },
            multiplier: PLINKO_TABLES[risk][rows][slot]
        };
    } else if(data.game === 'dice') {
        const target = Math.floor(Number(data.target) * 100) / 100;
        const direction = data.direction;

        // Roll from 0.00 to 100.00.
        const roll = Math.floor(originalsGetFloats(hash, 1)[0] * 10001) / 100;
        const chance = direction === 'under' ? target : 100 - target;
        const won = direction === 'under' ? roll < target : roll > target;

        return {
            options: { target: target, direction: direction },
            outcome: { roll: roll },
            multiplier: won === true ? Math.floor((DICE_EDGE * 100 / chance) * 10000) / 10000 : 0
        };
    } else if(data.game === 'roulette') {
        const number = Math.floor(originalsGetFloats(hash, 1)[0] * 37);
        const payout = data.bets.reduce((total, bet) => total + (rouletteBetWins(bet, number) === true ? bet.amount * ROULETTE_BETS[bet.type].multiplier : 0), 0);

        return {
            options: { bets: data.bets },
            outcome: { number: number },
            multiplier: payout / data.amount,
            payout: payout
        };
    } else {
        const result = originalsGetFloats(hash, 1)[0] < 0.5 ? 'heads' : 'tails';

        return {
            options: { side: data.side },
            outcome: { result: result },
            multiplier: result === data.side ? FLIP_MULTIPLIER : 0
        };
    }
}

const originalsSanitizeGame = (game) => {
    let sanitized = JSON.parse(JSON.stringify(game));
    delete sanitized.fair;
    return sanitized;
}

module.exports = {
    ORIGINALS_GAMES,
    PLINKO_TABLES,
    DICE_EDGE,
    FLIP_MULTIPLIER,
    ROULETTE_RED,
    originalsCheckSendBetData,
    originalsCheckSendBetUser,
    originalsCheckSendBetSeed,
    originalsGetResult,
    originalsSanitizeGame
}
