/*
 * Fake players ("bots") that keep the YourStake lively when few real players are online.
 *
 * Bots are regular users (email ending in @bots.local) that go through the very same
 * controller functions as real players, so their bets, cashouts and wins are real
 * database entries and show up everywhere (crash/roll lists, live bets feed, leaderboard).
 *
 * Games: crash, roll, roulette, mines, towers, plinko, dice, flip, dice duels and blackjack.
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
const { originalsSendBetSocket } = require('../controllers/originals');
const { rouletteGetData, rouletteSendBetSocket } = require('../controllers/roulette');
const { duelsGetData, duelsSendCreateSocket, duelsSendJoinSocket } = require('../controllers/duels');
const {
    blackjackGetTablesRaw,
    blackjackSendJoinSocket,
    blackjackSendBetSocket,
    blackjackSendInsuranceSocket,
    blackjackSendHitSocket,
    blackjackSendStandSocket,
    blackjackSendDoubleSocket
} = require('../controllers/blackjack');
const { blackjackGetCardsValue } = require('../utils/blackjack');
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

// Plinko, dice and flip: a short session of a few instant bets.
const botPlayOriginals = async (bot) => {
    const game = weighted([['plinko', 4], ['dice', 3], ['flip', 2]]);
    const count = randInt(1, game === 'plinko' ? 5 : 3);
    const risk = weighted([['low', 4], ['medium', 3], ['high', 1]]);
    const rows = pick([8, 10, 12, 14, 16]);
    const direction = pick(['under', 'over']);
    const target = Math.round(rand(10, 90) * 100) / 100;

    for(let index = 0; index < count; index++) {
        const amount = botAmount(bot);
        await botEnsureBalance(bot, amount);

        let data = { game: game, amount: amount };
        if(game === 'plinko') { data = { ...data, risk: risk, rows: rows }; }
        else if(game === 'dice') { data = { ...data, direction: direction, target: target }; }
        else { data = { ...data, side: pick(['heads', 'tails']) }; }

        const res = await botCall(originalsSendBetSocket, bot, data);
        if(res.success !== true) { return; }
        await sleep(rand(1200, 3500));
    }
};

const botsSoloLoop = async () => {
    while(true) {
        await sleep(rand(2500, 7000));
        const list = botsOnline().filter((bot) => !busy.has(bot._id.toString()));
        if(list.length === 0) { continue; }

        const bot = chance(0.08) ? (list.find((b) => b.whale) || pick(list)) : pick(list.filter((b) => !b.whale).length ? list.filter((b) => !b.whale) : list);
        const id = bot._id.toString();
        busy.add(id);
        const play = weighted([[botPlayMines, 4], [botPlayTowers, 2], [botPlayOriginals, 4]]);
        play(bot)
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

// Spread a stake over one to four roulette spots, mostly outside bets.
const botRouletteBets = (amount) => {
    const spots = randInt(1, 4);
    const chip = Math.max(10, Math.floor(amount / spots));
    const sides = { color: ['red', 'black'], parity: ['even', 'odd'], half: ['low', 'high'] };
    let bets = [];
    for(let index = 0; index < spots; index++) {
        const type = weighted([['color', 5], ['parity', 2], ['half', 2], ['dozen', 3], ['column', 2], ['number', 4]]);
        const value = type === 'number' ? randInt(0, 36) : (type === 'dozen' || type === 'column' ? randInt(1, 3) : pick(sides[type]));
        bets.push({ type: type, value: value, amount: chip });
    }
    return bets;
};

// ---------- live roulette ----------

// gameId -> { target, players: Set } so each round gets a believable number of bots.
let roulettePlans = new Map();

const botRouletteBet = async (bot, table, limits) => {
    const min = Math.round(limits.min * COIN);
    const max = Math.round(limits.max * COIN);
    const amount = Math.min(max, Math.max(min, botAmount(bot)));
    await botEnsureBalance(bot, amount);
    const res = await botCall(rouletteSendBetSocket, bot, { table: table.table, bets: botRouletteBets(amount) });
    if(res.success !== true && process.env.BOTS_DEBUG) { console.log('[bots] roulette', bot.username, res.error && res.error.message); }
    return res.success === true;
};

const botsRouletteTick = async () => {
    try {
        const data = rouletteGetData();

        for(const table of data.tables) {
            const game = table.game;
            if(game === null || game.state !== 'created' || game.remaining < 2500) { continue; }

            let plan = roulettePlans.get(game._id.toString());
            if(plan === undefined) {
                const whale = table.type === 'whale';
                plan = { target: whale ? weighted([[0, 3], [1, 4], [2, 2]]) : randInt(1, 6), players: new Set() };
                roulettePlans.set(game._id.toString(), plan);
            }
            if(plan.players.size >= plan.target || chance(0.45) !== true) { continue; }

            const candidates = botsOnline().filter((bot) => bot.whale === (table.type === 'whale') && plan.players.has(bot._id.toString()) !== true);
            if(candidates.length === 0) { continue; }

            const bot = pick(candidates);
            plan.players.add(bot._id.toString());
            botRouletteBet(bot, table, data.limits[table.type]).then((placed) => {
                // Some players add a second stack before the timer runs out
                if(placed === true && chance(0.25)) { setTimeout(() => botRouletteBet(bot, table, data.limits[table.type]), rand(2000, 6000)); }
            });
        }

        if(roulettePlans.size > 200) { roulettePlans = new Map(); }
    } catch(err) {
        console.error('[bots] roulette', err.message);
    }
};

// ---------- blackjack ----------

const BLACKJACK_SEATS = 5;
const BLACKJACK_WINDOW = 1000 * 10;

let blackjackBusy = false;
let blackjackWaits = new Map();

const blackjackPlayerUserId = (player) => {
    if(player === undefined || player === null || player.user === undefined || player.user === null || player.user._id === undefined) { return null; }
    return player.user._id.toString();
};

const blackjackFreeSeats = (table) => {
    return [...Array(BLACKJACK_SEATS).keys()].filter((seat) => table.players.some((player) => player.seat === seat) !== true);
};

const blackjackTimeLeft = (table) => {
    return new Date(table.game.updatedAt).getTime() + BLACKJACK_WINDOW - new Date().getTime();
};

// Small random delay before acting, so bots do not answer in the same tick as the deal
const blackjackWait = (key, min, max) => {
    const now = new Date().getTime();
    const until = blackjackWaits.get(key);

    if(until === undefined) { blackjackWaits.set(key, now + Math.round(rand(min, max))); return false; }
    if(now < until) { return false; }

    blackjackWaits.delete(key);
    return true;
};

// A bot keeps (or drops) its seat for the whole round instead of flip-flopping between ticks
const blackjackWillBet = (table, seat) => {
    const text = `${table.game._id}:${seat}`;
    let hash = 0;

    for(let index = 0; index < text.length; index++) { hash = (hash * 31 + text.charCodeAt(index)) % 1000; }

    return hash < 780;
};

const blackjackLimits = (type) => {
    const standard = type !== 'whale';
    const min = Number(standard ? process.env.BLACKJACK_MIN_AMOUNT_STANDARD : process.env.BLACKJACK_MIN_AMOUNT_WHALE) || (standard ? 0.01 : 10);
    const max = Number(standard ? process.env.BLACKJACK_MAX_AMOUNT_STANDARD : process.env.BLACKJACK_MAX_AMOUNT_WHALE) || (standard ? 1000 : 100000);

    return { min: Math.floor(min * COIN), max: Math.floor(max * COIN) };
};

// Same chips as the table's bet controls: bots build their bet one chip click at a time like players
const BLACKJACK_CHIPS = {
    standard: [100, 10, 1, 0.1].map((value) => value * COIN),
    whale: [500, 200, 100, 50].map((value) => value * COIN)
};
const BLACKJACK_MAX_CLICKS = 12;

let blackjackPlacing = new Set();

const blackjackBetAmount = (bot, type) => {
    const amount = type === 'whale'
        ? weighted([[100, 8], [200, 8], [250, 5], [500, 9], [600, 3], [1000, 7], [1500, 4], [2000, 3], [2500, 3], [5000, 1]]) * COIN
        : (bot.whale ? botSmallAmount() * 10 : botSmallAmount());

    return Math.round(amount);
};

// Splits an amount into chip clicks (largest chips first), within the table limits and a click budget
const blackjackChipPlan = (amount, type) => {
    const chips = BLACKJACK_CHIPS[type === 'whale' ? 'whale' : 'standard'];
    const limits = blackjackLimits(type);
    let left = Math.max(limits.min, Math.min(limits.max, amount));
    const clicks = [];

    for(const chip of chips) {
        while(left >= chip && clicks.length < BLACKJACK_MAX_CLICKS) {
            clicks.push(chip);
            left = left - chip;
        }
    }

    if(clicks.length === 0) { clicks.push(chips[chips.length - 1]); }

    return clicks;
};

const blackjackPlaceChips = async (bot, tableId, seat, gameId, clicks) => {
    const key = `${gameId}:${seat}`;
    blackjackPlacing.add(key);

    try {
        for(let index = 0; index < clicks.length; index++) {
            if(index > 0) { await sleep(index === 1 ? rand(250, 600) : rand(140, 420)); }

            // Stop clicking once the round has moved on or betting is about to close
            const table = blackjackGetTablesRaw().find((element) => element.table === tableId);
            if(table === undefined || table.game === undefined || String(table.game._id) !== gameId) { return; }
            if(table.game.state !== 'countdown' || blackjackTimeLeft(table) < 900) { return; }

            const res = await botCall(blackjackSendBetSocket, bot, {
                table: tableId,
                bets: [{ seat: seat, amount: { main: clicks[index], sideLeft: 0, sideRight: 0 } }]
            });

            if(res.success !== true) {
                if(process.env.BOTS_DEBUG) { console.log('[bots] blackjack bet', bot.username, res.error && res.error.message); }
                return;
            }
        }
    } finally {
        blackjackPlacing.delete(key);
    }
};

const botsBlackjackBets = async (table, botById) => {
    for(const player of table.players) {
        const botId = blackjackPlayerUserId(player);
        if(botId === null || botById.has(botId) !== true) { continue; }
        if(player.bet !== null && player.bet !== undefined) { continue; }
        if(blackjackPlacing.has(`${table.game._id}:${player.seat}`) === true) { continue; }
        if(blackjackWillBet(table, player.seat) !== true) { continue; }
        if(blackjackWait(`bet:${table.game._id}:${player.seat}`, 800, 3200) !== true) { continue; }

        const bot = botById.get(botId);
        const clicks = blackjackChipPlan(blackjackBetAmount(bot, table.game.type), table.game.type);
        await botEnsureBalance(bot, clicks.reduce((sum, chip) => sum + chip, 0));

        // Not awaited: each bot clicks at its own pace while the tick moves on
        blackjackPlaceChips(bot, table.table, player.seat, String(table.game._id), clicks);
    }
};

const botsBlackjackInsurance = async (table, botById) => {
    for(const player of table.players) {
        const botId = blackjackPlayerUserId(player);
        if(botId === null || botById.has(botId) !== true) { continue; }
        if(player.bet === undefined || player.bet === null) { continue; }
        if(player.bet.actions === undefined || player.bet.actions.length !== 1) { continue; }
        if(blackjackWait(`insurance:${table.game._id}:${player.seat}`, 800, 3000) !== true) { continue; }

        const bot = botById.get(botId);
        await botEnsureBalance(bot, Math.floor(player.bet.amount.main / 2));
        await botCall(blackjackSendInsuranceSocket, bot, { table: table.table, insurance: chance(0.25) });
    }
};

const botsBlackjackTurn = async (table, botById) => {
    const player = table.players.find((element) => element.seat === table.playersPos);
    if(player === undefined) { return; }

    const botId = blackjackPlayerUserId(player);
    if(botId === null || botById.has(botId) !== true) { return; }
    if(player.bet === undefined || player.bet === null || Array.isArray(player.bet.cards) !== true) { return; }
    if(player.bet.cards.length === 0) { return; }

    const cards = player.bet.cards;
    const actions = player.bet.actions === undefined ? [] : player.bet.actions;
    if(blackjackWait(`turn:${table.game._id}:${player.seat}:${cards.length}:${actions.length}`, 700, 2400) !== true) { return; }

    const bot = botById.get(botId);
    const value = blackjackGetCardsValue(cards);
    const data = { table: table.table, seat: player.seat };
    let res = null;

    if(cards.length === 2 && value >= 9 && value <= 11 && chance(0.25) === true) {
        await botEnsureBalance(bot, player.bet.amount.main);
        res = await botCall(blackjackSendDoubleSocket, bot, data);
    } else if(value <= 16) {
        res = await botCall(blackjackSendHitSocket, bot, data);
    } else {
        res = await botCall(blackjackSendStandSocket, bot, data);
    }

    if(res !== null && res.success !== true && process.env.BOTS_DEBUG) { console.log('[bots] blackjack action', bot.username, res.error && res.error.message); }
};

const botsBlackjackTick = async () => {
    if(blackjackBusy === true || bots.length === 0) { return; }

    blackjackBusy = true;

    try {
        const botById = new Map(bots.map((bot) => [bot._id.toString(), bot]));

        for(const table of blackjackGetTablesRaw()) {
            if(table.game === undefined || table.game === null) { continue; }

            const state = table.game.state;

            if(state === 'running') {
                if(table.playersPos === 'all') { await botsBlackjackInsurance(table, botById); }
                else if(table.playersPos !== null && table.playersPos !== undefined) { await botsBlackjackTurn(table, botById); }
            } else if(state === 'countdown' && blackjackTimeLeft(table) > 1500) {
                await botsBlackjackBets(table, botById);
            }
        }

        if(blackjackWaits.size > 5000) { blackjackWaits = new Map(); }
    } catch(err) {
        console.error('[bots] blackjack', err.message);
    } finally {
        blackjackBusy = false;
    }
};

const botsBlackjackSeatsLoop = async () => {
    while(true) {
        await sleep(rand(6000, 15000));

        try {
            if(bots.length === 0) { continue; }

            const botById = new Map(bots.map((bot) => [bot._id.toString(), bot]));
            const tables = blackjackGetTablesRaw();

            // Do not let the bots fill the whole lobby: a dozen active tables is plenty
            const busyTables = tables.filter((table) => table.players.some((player) => {
                const id = blackjackPlayerUserId(player);
                return id !== null && botById.has(id);
            })).length;

            // Only tables that can still take a seat before the cards are dealt
            const available = tables.filter((table) => {
                if(table.game === undefined || table.game === null) { return false; }
                if(table.game.state !== 'created' && table.game.state !== 'countdown') { return false; }
                if(table.game.state === 'countdown' && blackjackTimeLeft(table) < 6000) { return false; }
                return blackjackFreeSeats(table).length > 0;
            });

            if(available.length === 0) { continue; }

            // Prefer a table where a real player is already waiting, so the site never feels empty
            const withHuman = available.filter((table) => table.players.some((player) => {
                const id = blackjackPlayerUserId(player);
                return id !== null && botById.has(id) !== true;
            }));
            const empty = available.filter((table) => table.players.length === 0);

            let table = null;
            if(withHuman.length > 0 && chance(0.6) === true) { table = pick(withHuman); }
            else if(empty.length > 0 && busyTables < 12) { table = pick(empty); }
            else if(withHuman.length > 0) { table = pick(withHuman); }

            if(table === null) { continue; }

            const whaleTable = table.game.type === 'whale';
            const seated = new Set(table.players.map(blackjackPlayerUserId).filter((id) => id !== null));
            const candidates = botsOnline().filter((bot) => bot.whale === whaleTable && seated.has(bot._id.toString()) !== true);

            if(candidates.length === 0) { continue; }

            const seats = blackjackFreeSeats(table).sort(() => Math.random() - 0.5).slice(0, table.players.length === 0 ? randInt(1, 3) : randInt(1, 2));
            const pool = [...candidates].sort(() => Math.random() - 0.5);

            for(let index = 0; index < seats.length && index < pool.length; index++) {
                const bot = pool[index];
                const res = await botCall(blackjackSendJoinSocket, bot, { table: table.table, seat: seats[index] });

                if(res.success !== true && process.env.BOTS_DEBUG) { console.log('[bots] blackjack seat', bot.username, res.error && res.error.message); }
            }
        } catch(err) {
            console.error('[bots] blackjack seats', err.message);
        }
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
            botsBlackjackSeatsLoop();
            setInterval(botsDuelsWatchTick, 3000);
            setInterval(botsBlackjackTick, 1000);
            setInterval(botsRouletteTick, 1200);
            console.log(`[bots] ${bots.length} fake players running (${whales} high rollers)`);
        } catch(err) {
            console.error('[bots] failed to start:', err.message);
        }
    }, 6000);
};

module.exports.botsOnlineCount = botsOnlineCount;
module.exports.botsOnChatMessage = botsOnChatMessage;
