/*
 * Fake players ("bots") that keep the YourStake lively when few real players are online.
 *
 * Bots are regular users (email ending in @bots.local) that go through the very same
 * controller functions as real players, so their bets, cashouts and wins are real
 * database entries and show up everywhere (crash/roll lists, live bets feed, leaderboard).
 *
 * Config (config/config.env):
 *   BOTS_ENABLED=true   BOTS_COUNT=100   BOTS_WHALES=5
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const User = require('../database/models/User');
const UserSeed = require('../database/models/UserSeed');

const { crashGetData, crashSendBetSocket } = require('../controllers/crash');
const { rollGetData, rollSendBetSocket } = require('../controllers/roll');
const { minesSendBetSocket, minesSendRevealSocket, minesSendCashoutSocket } = require('../controllers/mines');
const { towersSendBetSocket, towersSendRevealSocket, towersSendCashoutSocket } = require('../controllers/towers');
const { duelsGetData, duelsSendCreateSocket, duelsSendJoinSocket } = require('../controllers/duels');
const { battlesGetData, battlesSendCreateSocket, battlesSendJoinSocket } = require('../controllers/battles');
const Box = require('../database/models/Box');
const { generalChatAddMessage } = require('../controllers/general/chat');
const { generalUserGetLevel, generalUserGetRakeback } = require('../utils/general/user');

const BOT_EMAIL_DOMAIN = '@bots.local';
const USER_FIELDS = 'roblox.id username avatar rank balance xp stats limits rakeback affiliates anonymous mute ban createdAt';

// Amounts are stored in thousandths (1.00 = 1000)
const COIN = 1000;
const SMALL_START_BALANCE = 5000 * COIN;
const WHALE_START_BALANCE = 750000 * COIN;

const NAMES = [
    'jxkeyy', 'degen_dan', 'sk8rboi04', 'lowkeyrich', 'notyourdad', 'zyphrr', 'big_e_vibes', 'm4rkus', 'chasingpaper', 'tylerrr',
    'kxng_jay', 'frostbyte', 'dannyboy22', 'luhkev', 'Wh1sk3y', 'mattyb_', 'ghxst', 'b3ntley', 'sneakyp', 'hotsauce_',
    'ricky_r', 'spinz', 'cashoutcarl', 'ohnojoe', 'N1ghtOwl', 'tradergio', 'kaz_', 'drewski', 'brokeboi', 'pixelpete',
    'cryptocam', 'jayden2k', 'meloo', 'yungstakes', 'xKaine', 'zeke_', 'grindin_g', 'oddsmaker', 'maxi_bets', 'alfie99',
    'shadowfax', 'tonym0ntana', 'benji_', 'r3kt', 'lucky_lou', 'cheddarbob', 'vinnyv', 'soapy', 'rxlly', 'bigsmoke',
    'dyl4n', 'nate_exe', 'qwertykid', 'monke', 'skrrt', 'blazee', 'fizzy', 'trippie', 'acepilot', 'rollin_ray',
    'theo_g', 'jaxx', 'mrbeanzz', 'koalakev', 'bankroll_b', 'risky_ricky', 'kyle_k', 'swervo', 'punchy', 'turbotom',
    'lilfrank', 'smokey', 'omarr', 'jonnyboy', 'scotty2hotty', 'nolimitnick', 'ZackAttack', 'sammo', 'vibez', 'hennyboy',
    'cosmo', 'kitkatz', 'bruhmoment', 'goated_gabe', 'dex', 'mintyfresh', 'reyna_main', 'ezclap', 'gamblr_greg', 'tilted_tim',
    'yeeter', 'pablo_esco', 'Juicyj', 'crashdummy', 'slimshady', 'ghostface_', 'eddy', 'hxrry', 'kiddo', 'stakeboi'
];
const WHALE_NAMES = ['w4lrus', 'ColdHands', '8figkev', 'vault_lord', 'sharkbait', 'moneybags', 'deepp0ckets', 'k1ngmidas'];

const CHAT_MESSAGES = [
    'gm', 'gn chat', 'yo', 'sup chat', 'whats good', 'hey guys', 'back again lol', 'im back',
    'lfg', 'gg', 'ggs', 'nice hit', 'clean', 'sheesh', 'W', 'L', 'huge W', 'massive L', 'ez', 'insane',
    'rigged lol', 'crash hates me fr', '1.00x again bro', 'who tipping', 'tip me pls', 'anyone wanna duel',
    'down bad today', 'up 2k lets go', 'cashed at 1.5 and it went 40x 💀', 'should i go for 10x', 'dont do it', 'do it',
    'mines 3 is free money', 'towers hard is a scam', 'rain when', 'ty rain', 'anyone else on a losing streak',
    'how do u guys win', 'patience is key', 'this site is fire', 'one more round then sleep', 'thats what u said an hour ago',
    'bro', 'nahhh', 'nah wtf', 'who hit that', 'next one is a moon i can feel it', 'red red red red', 'green finally',
    'blackjack anyone?', 'dealer always has 21 smh', 'martingale time', 'martingale is how u go broke lol',
    'im all in next', 'pray for me', 'just lost 500 on mines', 'first click bomb every time', 'auto cashout 2x and chill',
    'bro i always cash out too early', 'not even mad', 'actually mad', 'lmao', 'lol', 'lmfaooo', 'hahaha',
    'im never leaving 1.5x again', 'small bets today', 'slow grind', 'recovered everything lets go', 'and its gone',
    'crash been cold all day', 'roll is cooking rn', 'anyone hit 100x today?', 'need a big one', 'hold hold hold',
    'why did i sell', 'unlucky', 'sadge', 'pog', 'sick', 'imagine holding that', 'thats so tuff', 'ok im done for today',
    'jk one more', 'wsg', 'good luck everyone', 'gl all', 'this chat is wild', 'how is everyone doing', 'tired of losing',
    'who wants to split a duel', 'mines on 24 bombs is crazy', 'towers easy grind', 'cashed out 3k on towers 😤',
    'whats the best game here', 'crash 100%', 'roll for sure', 'mines easily', 'i like towers ngl'
];

// Short back-and-forth exchanges between different bots
const CHAT_THREADS = [
    ['anyone wanna duel?', 'bet how much', '50?', 'say less'],
    ['whats everyone playing', 'crash', 'mines rn', 'roll'],
    ['im up 1k', 'cash out now', 'nah im greedy', 'famous last words'],
    ['how long u guys been playing', 'like 2h', 'too long lol'],
    ['crash is rigged', 'skill issue', 'lmaooo'],
    ['should i go all in', 'no', 'yes', 'do it coward'],
    ['tip me 10 pls', 'no', 'beggars lol'],
    ['who just hit that big one', 'not me sadly', 'i wish'],
    ['is it just me or crash keeps busting early', 'same here', 'been like that all night']
];

const BIG_WIN_REACTIONS = ['gg {name}', 'W {name}', 'huge {name}', '{name} cooking', 'nice hit {name}', 'tip me {name} 🙏', 'jeez {name}', 'gg', 'thats a W'];
const HIGH_CRASH_REACTIONS = ['{x}x 💀', 'who held to {x}x??', 'i cashed at 2x and it went {x}x bruh', 'finally a moon', '{x}x lets gooo', 'damn {x}x'];
const LOW_CRASH_REACTIONS = ['instant bust lol', 'rip', 'again??', 'bro', '1.00x 💀', 'cmon'];

// Replies to real players
const GREETING_REPLIES = ['yo {name}', 'sup {name}', 'wsg {name}', 'welcome {name}', 'hey', 'yo', 'gl {name}'];
const QUESTION_REPLIES = ['idk tbh', 'probably', 'nah', 'yeah', 'depends lol', 'ask the mods', 'try crash', 'mines imo'];

let bots = [];
let online = new Set();
let busy = new Set();

const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const chance = (p) => Math.random() < p;

// Weighted pick: [[value, weight], ...]
const weighted = (entries) => {
    const total = entries.reduce((sum, entry) => sum + entry[1], 0);
    let roll = Math.random() * total;
    for(const [value, weight] of entries) {
        if((roll -= weight) <= 0) { return value; }
    }
    return entries[entries.length - 1][0];
};

const botSmallAmount = () => Math.round(weighted([[0.5, 10], [1, 18], [2, 16], [5, 18], [10, 14], [20, 10], [50, 7], [100, 4], [250, 2]]) * COIN);
const botWhaleAmount = () => Math.round(weighted([[1000, 6], [1500, 4], [2500, 5], [5000, 4], [10000, 2], [25000, 1]]) * COIN * rand(1.0, 1.08));
const botAmount = (bot) => bot.whale ? botWhaleAmount() : botSmallAmount();

const botSocket = (bot) => ({ decoded: { _id: bot._id }, rooms: new Set(), emit() {}, join() {}, leave() {} });

// Run a controller function the way the socket layer does and resolve with its callback payload
const botCall = (fn, bot, data) => new Promise(async (resolve) => {
    try {
        const user = await User.findById(bot._id).select(USER_FIELDS).lean();
        fn(botIo, botSocket(bot), user, data, (res) => resolve(res || { success: false }));
    } catch(err) {
        resolve({ success: false, error: { message: err.message } });
    }
});

let botIo = null;

const botEnsureBalance = async (bot, amount) => {
    const user = await User.findById(bot._id).select('balance').lean();
    const floor = bot.whale ? 100000 * COIN : 300 * COIN;
    if(user !== null && (user.balance < floor || user.balance < amount * 2)) {
        await User.updateOne({ _id: bot._id }, { balance: bot.whale ? WHALE_START_BALANCE : SMALL_START_BALANCE });
    }
};

const botCreateSeeds = async (userId) => {
    const seeds = [0, 1].map(() => {
        const seedServer = crypto.randomBytes(24).toString('hex');
        return { seedClient: crypto.randomBytes(8).toString('hex'), seedServer, hash: crypto.createHash('sha256').update(seedServer).digest('hex') };
    });
    await UserSeed.create([
        { ...seeds[0], nonce: 1, user: userId, state: 'active' },
        { ...seeds[1], nonce: 1, user: userId, state: 'created' }
    ]);
};

// A believable account history: join date, deposits/withdrawals, wager volume and matching level
const botProfile = (whale) => {
    const DAY = 24 * 60 * 60 * 1000;
    const createdAt = new Date(Date.now() - (whale ? rand(200, 900) : rand(20, 540)) * DAY - rand(0, DAY));
    const deposit = Math.round((whale ? rand(40000, 1500000) : weighted([[rand(20, 200), 5], [rand(200, 1500), 4], [rand(1500, 8000), 2]])) * COIN);
    const withdraw = Math.round(deposit * weighted([[rand(0, 0.5), 4], [rand(0.5, 1), 4], [rand(1, 1.8), 3]]));
    const bet = Math.round(deposit * rand(6, 30));
    const won = Math.round(bet * rand(0.93, 1.01));

    return {
        createdAt: createdAt,
        updatedAt: new Date(),
        xp: bet,
        stats: { bet: bet, won: won, deposit: deposit, withdraw: withdraw },
        ips: [{ address: '127.0.0.1', createdAt: createdAt }]
    };
};

const botsEnsureAccounts = async (count, whaleCount) => {
    const existing = await User.find({ 'local.email': { $regex: BOT_EMAIL_DOMAIN.replace('.', '\\.') + '$' } }).select('username local.email createdAt').lean();
    const byEmail = new Map(existing.map((user) => [user.local.email, user]));
    const password = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
    const recent = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const result = [];

    for(let index = 0; index < count; index++) {
        const whale = index < whaleCount;
        const username = whale ? WHALE_NAMES[index % WHALE_NAMES.length] : NAMES[(index - whaleCount) % NAMES.length];
        const email = `bot${index}${BOT_EMAIL_DOMAIN}`;
        let user = byEmail.get(email);

        if(user === undefined) {
            user = await User.create({
                username: username,
                local: { email: email, password: password },
                avatar: `/public/img/avatar/${randInt(1, 9)}.webp`,
                balance: whale ? WHALE_START_BALANCE : SMALL_START_BALANCE,
                ...botProfile(whale)
            });
            await botCreateSeeds(user._id);
        } else if(new Date(user.createdAt).getTime() > recent) {
            // Accounts created before profiles existed get a backdated history once
            await User.updateOne({ _id: user._id }, { $set: botProfile(whale) });
        }

        if(user.username !== username) { await User.updateOne({ _id: user._id }, { username: username }); }

        result.push({ _id: user._id, username: username, whale: whale });
    }

    return result;
};

// ---------- presence ----------

const botsRefreshPresence = () => {
    const target = Math.floor(bots.length * rand(0.6, 0.85));
    const shuffled = [...bots].sort(() => Math.random() - 0.5);
    online = new Set(shuffled.slice(0, target).map((bot) => bot._id.toString()));
    // Whales are online most of the time so big bets show up regularly
    for(const bot of bots) { if(bot.whale && chance(0.8)) { online.add(bot._id.toString()); } }

    if(botIo !== null) {
        require('../utils/general/chat').generalGetChatOnlineCount(botIo)
            .then((onlineData) => botIo.of('/general').emit('chatOnline', { online: onlineData }))
            .catch(() => {});
    }
};

const botsOnline = () => bots.filter((bot) => online.has(bot._id.toString()));
const botsOnlineCount = () => online.size;

// ---------- chat ----------

const botSay = async (bot, text) => {
    try {
        const user = await User.findById(bot._id).select('username avatar rank xp stats anonymous createdAt').lean();
        if(user === null) { return; }
        generalChatAddMessage(botIo, {
            message: text,
            room: 'en',
            user: {
                _id: user._id,
                username: user.username,
                avatar: user.avatar,
                rank: user.rank,
                level: generalUserGetLevel(user),
                rakeback: generalUserGetRakeback(user).name,
                stats: user.anonymous === true ? null : user.stats,
                createdAt: user.createdAt
            },
            type: 'user'
        });
    } catch(err) {
        console.error('[bots] chat', err.message);
    }
};

const botsChatLoop = async () => {
    while(true) {
        // One spontaneous message every 5 to 25 minutes
        await sleep(rand(5 * 60000, 25 * 60000));
        const list = botsOnline();
        if(list.length < 2) { continue; }

        if(chance(0.05)) {
            // Small conversation between a few bots
            const thread = pick(CHAT_THREADS);
            const speakers = [...list].sort(() => Math.random() - 0.5).slice(0, 3);
            for(let index = 0; index < thread.length; index++) {
                await botSay(speakers[index % speakers.length], thread[index]);
                await sleep(rand(4000, 12000));
            }
        } else {
            botSay(pick(list), pick(CHAT_MESSAGES));
        }
    }
};

// Called by the chat controller for every real player message
const botsOnChatMessage = (message) => {
    try {
        if(bots.length === 0 || message.type !== 'user' || message.user === undefined) { return; }
        if(bots.some((bot) => bot._id.toString() === message.user._id.toString())) { return; }

        const text = String(message.message).toLowerCase();
        const name = message.user.username;
        const mentioned = botsOnline().find((bot) => text.includes(bot.username.toLowerCase()));

        if(/\b(hi|hello|hey|yo|sup|wsg|gm|wassup|whats up)\b/.test(text)) {
            botsReact(GREETING_REPLIES, { name: name }, 0.6, true);
        } else if(mentioned !== undefined) {
            setTimeout(() => botSay(mentioned, pick(QUESTION_REPLIES)), rand(2000, 6000));
        } else if(text.includes('?')) {
            botsReact(QUESTION_REPLIES, { name: name }, 0.25, true);
        } else if(/\b(gg|lets go|lfg|won|hit)\b/.test(text)) {
            botsReact(BIG_WIN_REACTIONS, { name: name }, 0.2, true);
        }
    } catch(err) {
        console.error('[bots] reply', err.message);
    }
};


const botsReact = (templates, vars, probability, toRealPlayer = false) => {
    if(!chance(probability)) { return; }
    // Spontaneous reactions to game events are off: the chat loop alone sets the pace
    if(!toRealPlayer) { return; }
    const list = botsOnline().filter((bot) => bot.username !== vars.name);
    if(list.length === 0) { return; }
    const text = pick(templates).replace('{name}', vars.name || '').replace('{x}', vars.x || '');
    setTimeout(() => botSay(pick(list), text), rand(800, 3500));
};

// ---------- crash ----------

let crashLastGame = null;
let crashLastCompleted = null;

const botCrashCashout = () => Math.round(weighted([
    [rand(1.1, 1.5), 22], [rand(1.5, 2.2), 30], [rand(2.2, 4), 22], [rand(4, 10), 14], [rand(10, 50), 9], [rand(50, 200), 3]
]) * 100);

const botsCrashTick = () => {
    const data = crashGetData();
    const game = data.game;
    if(game === undefined || game === null) { return; }

    if(game.state === 'created' && game._id !== crashLastGame) {
        crashLastGame = game._id;
        for(const bot of botsOnline()) {
            if(busy.has(bot._id.toString())) { continue; }
            if(!chance(bot.whale ? 0.45 : 0.16)) { continue; }

            setTimeout(async () => {
                const amount = botAmount(bot);
                await botEnsureBalance(bot, amount);
                const res = await botCall(crashSendBetSocket, bot, { amount: amount, autoCashout: botCrashCashout() });
                if(res.success !== true && process.env.BOTS_DEBUG) { console.log('[bots] crash', bot.username, res.error && res.error.message); }
            }, rand(150, 4800));
        }
    }

    if(game.state === 'completed' && game._id !== crashLastCompleted && game.outcome !== undefined) {
        crashLastCompleted = game._id;
        const multiplier = game.outcome / 100;
        if(multiplier >= 10) { botsReact(HIGH_CRASH_REACTIONS, { x: multiplier.toFixed(2) }, 0.25); }
        else if(multiplier <= 1.05) { botsReact(LOW_CRASH_REACTIONS, {}, 0.08); }

        // Cheer the biggest winner of the round (real players included)
        const winners = (data.bets || [])
            .filter((bet) => bet.multiplier !== undefined && bet.user && bet.user.username)
            .map((bet) => ({ name: bet.user.username, profit: bet.amount * (bet.multiplier / 100 - 1) }))
            .sort((a, b) => b.profit - a.profit);
        if(winners.length > 0 && winners[0].profit >= 2000 * COIN) { botsReact(BIG_WIN_REACTIONS, { name: winners[0].name }, 0.3); }
    }
};

// ---------- roll ----------

let rollLastGame = null;

const botRollMultiplier = () => Math.round(weighted([[1.5, 18], [2, 28], [3, 18], [5, 14], [10, 10], [20, 6], [50, 4], [100, 2]]) * 100);

const botsRollTick = () => {
    const data = rollGetData();
    const game = data.game;
    if(game === undefined || game === null) { return; }

    if(game.state === 'created' && game._id !== rollLastGame) {
        rollLastGame = game._id;
        for(const bot of botsOnline()) {
            if(busy.has(bot._id.toString())) { continue; }
            if(!chance(bot.whale ? 0.3 : 0.1)) { continue; }

            setTimeout(async () => {
                const amount = botAmount(bot);
                await botEnsureBalance(bot, amount);
                const res = await botCall(rollSendBetSocket, bot, { amount: amount, multiplier: botRollMultiplier() });
                if(res.success !== true && process.env.BOTS_DEBUG) { console.log('[bots] roll', bot.username, res.error && res.error.message); }
            }, rand(500, 10000));
        }
    }
};

// ---------- mines & towers (solo games, they feed the live bets list) ----------

const botPlayMines = async (bot) => {
    const amount = botAmount(bot);
    await botEnsureBalance(bot, amount);
    const minesCount = weighted([[1, 3], [3, 6], [5, 4], [10, 2], [20, 1]]);
    let res = await botCall(minesSendBetSocket, bot, { amount: amount, minesCount: minesCount });
    if(res.success !== true) { return; }

    const tiles = [...Array(25).keys()].sort(() => Math.random() - 0.5);
    const wanted = Math.max(1, Math.min(25 - minesCount, Math.round(rand(1, minesCount >= 10 ? 3 : 6))));

    for(let index = 0; index < wanted; index++) {
        await sleep(rand(600, 1600));
        res = await botCall(minesSendRevealSocket, bot, { tile: tiles[index] });
        if(res.success !== true || (res.game && res.game.state === 'completed')) { return; }
    }

    await sleep(rand(400, 1200));
    await botCall(minesSendCashoutSocket, bot, {});
};

const botPlayTowers = async (bot) => {
    const amount = botAmount(bot);
    await botEnsureBalance(bot, amount);
    const risk = weighted([['easy', 5], ['medium', 3], ['hard', 1]]);
    let res = await botCall(towersSendBetSocket, bot, { amount: amount, risk: risk });
    if(res.success !== true) { return; }

    const rows = randInt(1, risk === 'hard' ? 3 : 5);
    for(let index = 0; index < rows; index++) {
        await sleep(rand(700, 1700));
        res = await botCall(towersSendRevealSocket, bot, { tile: randInt(0, risk === 'medium' ? 1 : 2) });
        if(res.success !== true || (res.game && res.game.state === 'completed')) { return; }
    }

    await sleep(rand(400, 1200));
    await botCall(towersSendCashoutSocket, bot, {});
};

const botsSoloLoop = async () => {
    while(true) {
        await sleep(rand(2500, 7000));
        const list = botsOnline().filter((bot) => !busy.has(bot._id.toString()));
        if(list.length === 0) { continue; }

        const bot = chance(0.08) ? (list.find((b) => b.whale) || pick(list)) : pick(list.filter((b) => !b.whale).length ? list.filter((b) => !b.whale) : list);
        const id = bot._id.toString();
        busy.add(id);
        (chance(0.6) ? botPlayMines(bot) : botPlayTowers(bot))
            .catch((err) => console.error('[bots] solo', err.message))
            .finally(() => busy.delete(id));
    }
};

// ---------- dice duels ----------

const botIds = () => new Set(bots.map((bot) => bot._id.toString()));
const duelsOpenGames = () => (duelsGetData().games || []).filter((game) => game.state === 'created' && game.bets.length < game.playerCount);
const duelsHasPlayer = (game, bot) => game.bets.some((bet) => bet.user && bet.user._id && bet.user._id.toString() === bot._id.toString());

const botJoinDuel = async (bot, gameId, amount) => {
    await botEnsureBalance(bot, amount);
    const res = await botCall(duelsSendJoinSocket, bot, { gameId: gameId });
    if(res.success !== true && process.env.BOTS_DEBUG) { console.log('[bots] duel join', bot.username, res.error && res.error.message); }
    return res.success === true;
};

// Fill a bot-created duel seat by seat; sometimes keep the last seat open for real players
const botsFillDuel = async (gameId) => {
    const keepSeat = chance(0.3);

    while(true) {
        await sleep(rand(4000, 22000));
        const game = duelsOpenGames().find((element) => element._id === gameId);
        if(game === undefined) { return; }

        const missing = game.playerCount - game.bets.length;
        if(missing === 1 && keepSeat) {
            await sleep(rand(60000, 150000));
            if(duelsOpenGames().find((element) => element._id === gameId) === undefined) { return; }
        }

        const candidates = botsOnline().filter((bot) => !bot.whale === !(game.amount >= 1000 * COIN) && !duelsHasPlayer(game, bot));
        if(candidates.length === 0) { return; }
        await botJoinDuel(pick(candidates), gameId, game.amount);
    }
};

const botsDuelsLoop = async () => {
    while(true) {
        await sleep(rand(30000, 90000));
        if(duelsOpenGames().length >= 3) { continue; }

        const list = botsOnline().filter((bot) => !busy.has(bot._id.toString()));
        if(list.length === 0) { continue; }

        const bot = chance(0.1) ? (list.find((b) => b.whale) || pick(list)) : pick(list.filter((b) => !b.whale).length ? list.filter((b) => !b.whale) : list);
        const amount = botAmount(bot);
        const playerCount = bot.whale ? 2 : weighted([[2, 10], [3, 4], [4, 3], [5, 1]]);
        await botEnsureBalance(bot, amount);

        const res = await botCall(duelsSendCreateSocket, bot, { amount: amount, playerCount: playerCount });
        if(res.success !== true) {
            if(process.env.BOTS_DEBUG) { console.log('[bots] duel create', bot.username, res.error && res.error.message); }
            continue;
        }

        const game = duelsOpenGames().find((element) => duelsHasPlayer(element, bot));
        if(game !== undefined) { botsFillDuel(game._id).catch((err) => console.error('[bots] duel fill', err.message)); }
    }
};

// Real players should never wait long for an opponent
let duelsSeen = new Map();

const botsDuelsWatchTick = () => {
    const ids = botIds();
    for(const game of duelsOpenGames()) {
        const creator = game.bets[0] && game.bets[0].user && game.bets[0].user._id ? game.bets[0].user._id.toString() : null;
        if(creator === null || ids.has(creator)) { continue; }

        const key = game._id + ':' + game.bets.length;
        if(duelsSeen.has(key)) { continue; }
        duelsSeen.set(key, true);

        setTimeout(async () => {
            const current = duelsOpenGames().find((element) => element._id === game._id);
            if(current === undefined || current.bets.length !== game.bets.length) { return; }
            const candidates = botsOnline().filter((bot) => !duelsHasPlayer(current, bot));
            if(candidates.length > 0) { await botJoinDuel(pick(candidates), current._id, current.amount); }
        }, rand(5000, 20000));
    }
    if(duelsSeen.size > 500) { duelsSeen = new Map(); }
};

// ---------- case battles ----------

const battlesOpenGames = async () => ((await battlesGetData()).games || []).filter((game) => game.state === 'created' && game.bets.length < game.playerCount);
const battlesHasPlayer = (game, bot) => game.bets.some((bet) => bet.user && bet.user._id && bet.user._id.toString() === bot._id.toString());
const battlesFreeSlot = (game) => [...Array(game.playerCount).keys()].find((slot) => slot > 0 && !game.bets.some((bet) => bet.slot === slot));

const botJoinBattle = async (bot, game) => {
    const slot = battlesFreeSlot(game);
    if(slot === undefined) { return false; }
    await botEnsureBalance(bot, game.amount);
    const res = await botCall(battlesSendJoinSocket, bot, { gameId: game._id, slot: slot });
    if(res.success !== true && process.env.BOTS_DEBUG) { console.log('[bots] battle join', bot.username, res.error && res.error.message); }
    return res.success === true;
};

const botsFillBattle = async (gameId, whale) => {
    const keepSeat = chance(0.3);

    while(true) {
        await sleep(rand(5000, 25000));
        const game = (await battlesOpenGames()).find((element) => element._id === gameId);
        if(game === undefined) { return; }

        if(game.playerCount - game.bets.length === 1 && keepSeat) {
            await sleep(rand(60000, 150000));
            if((await battlesOpenGames()).find((element) => element._id === gameId) === undefined) { return; }
        }

        const candidates = botsOnline().filter((bot) => bot.whale === whale && !battlesHasPlayer(game, bot));
        if(candidates.length === 0) { return; }
        const fresh = (await battlesOpenGames()).find((element) => element._id === gameId);
        if(fresh === undefined) { return; }
        await botJoinBattle(pick(candidates), fresh);
    }
};

const botsBattlesLoop = async () => {
    while(true) {
        await sleep(rand(40000, 120000));
        try {
            if((await battlesOpenGames()).length >= 3) { continue; }

            const boxes = await Box.find({ state: 'active' }).select('amount').sort({ amount: 1 }).lean();
            if(boxes.length === 0) { continue; }

            const list = botsOnline().filter((bot) => !busy.has(bot._id.toString()));
            if(list.length === 0) { continue; }

            const whale = chance(0.12) && list.some((bot) => bot.whale);
            const bot = pick(list.filter((b) => b.whale === whale));
            const pool = whale ? boxes.slice(-3) : boxes.slice(0, Math.max(1, boxes.length - 2));
            const picks = {};
            for(let index = 0; index < randInt(1, whale ? 3 : 5); index++) {
                const box = chance(0.7) ? pool[0] : pick(pool);
                picks[box._id] = (picks[box._id] || 0) + 1;
            }
            const selection = Object.entries(picks).map(([id, count]) => ({ _id: id.toString(), count: count }));
            const cost = selection.reduce((sum, entry) => sum + boxes.find((box) => box._id.toString() === entry._id).amount * entry.count, 0);

            await botEnsureBalance(bot, cost);
            const res = await botCall(battlesSendCreateSocket, bot, {
                boxes: selection,
                playerCount: whale ? 2 : weighted([[2, 10], [3, 4], [4, 3]]),
                mode: 'standard',
                levelMin: 0,
                funding: 0,
                private: false,
                affiliateOnly: false,
                cursed: false,
                terminal: false
            });
            if(res.success !== true) {
                if(process.env.BOTS_DEBUG) { console.log('[bots] battle create', bot.username, res.error && res.error.message); }
                continue;
            }

            const game = (await battlesOpenGames()).find((element) => battlesHasPlayer(element, bot));
            if(game !== undefined) { botsFillBattle(game._id, whale).catch((err) => console.error('[bots] battle fill', err.message)); }
        } catch(err) {
            console.error('[bots] battles', err.message);
        }
    }
};

// Join battles opened by real players
let battlesSeen = new Map();

const botsBattlesWatchTick = async () => {
    try {
        const ids = new Set(bots.map((bot) => bot._id.toString()));
        for(const game of await battlesOpenGames()) {
            const creator = game.bets.find((bet) => bet.slot === 0);
            const creatorId = creator && creator.user && creator.user._id ? creator.user._id.toString() : null;
            if(creatorId === null || ids.has(creatorId)) { continue; }

            const key = game._id + ':' + game.bets.length;
            if(battlesSeen.has(key)) { continue; }
            battlesSeen.set(key, true);

            setTimeout(async () => {
                const current = (await battlesOpenGames()).find((element) => element._id === game._id);
                if(current === undefined || current.bets.length !== game.bets.length) { return; }
                const candidates = botsOnline().filter((bot) => !battlesHasPlayer(current, bot) && (current.amount >= 1000 * COIN ? bot.whale : true));
                if(candidates.length > 0) { await botJoinBattle(pick(candidates), current); }
            }, rand(6000, 20000));
        }
        if(battlesSeen.size > 500) { battlesSeen = new Map(); }
    } catch(err) {
        console.error('[bots] battles watch', err.message);
    }
};

// ---------- entry point ----------

module.exports = (io) => {
    if(process.env.BOTS_ENABLED !== 'true') { return; }
    botIo = io;

    const count = parseInt(process.env.BOTS_COUNT || '100', 10);
    const whales = parseInt(process.env.BOTS_WHALES || '5', 10);

    // Let the database connection and the game loops start first
    setTimeout(async () => {
        try {
            bots = await botsEnsureAccounts(count, whales);
            botsRefreshPresence();
            setInterval(botsRefreshPresence, 90 * 1000);
            setInterval(botsCrashTick, 400);
            setInterval(botsRollTick, 500);
            botsChatLoop();
            botsSoloLoop();
            botsDuelsLoop();
            botsBattlesLoop();
            setInterval(botsBattlesWatchTick, 4000);
            setInterval(botsDuelsWatchTick, 3000);
            console.log(`[bots] ${bots.length} fake players running (${whales} high rollers)`);
        } catch(err) {
            console.error('[bots] failed to start:', err.message);
        }
    }, 6000);
};

module.exports.botsOnlineCount = botsOnlineCount;
module.exports.botsOnChatMessage = botsOnChatMessage;
