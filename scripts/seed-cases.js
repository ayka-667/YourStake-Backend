// Creates a set of original items and cases so Cases / Case Battles have content.
// Usage: node scripts/seed-cases.js   (safe to re-run: it replaces what it created before)
require('dotenv').config({ path: __dirname + '/../config/config.env' });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const puppeteer = require('puppeteer-core');

const Box = require('../database/models/Box');
const LimitedItem = require('../database/models/LimitedItem');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SEED_PREFIX = 'seed-';
const COIN = 1000;

// ---------- item art ----------

const RARITY = {
    common: ['#9aa7b8', '#5d6b7d'],
    uncommon: ['#4ade80', '#15803d'],
    rare: ['#38bdf8', '#1d4ed8'],
    epic: ['#c084fc', '#7e22ce'],
    legendary: ['#fde047', '#d97706'],
    mythic: ['#fb7185', '#be123c']
};

const shapes = {
    coin: (a, b) => `<circle cx="50" cy="50" r="34" fill="url(#g)"/><circle cx="50" cy="50" r="25" fill="none" stroke="${b}" stroke-width="4" opacity=".6"/><path d="M50 36v28M42 42h12a6 6 0 0 1 0 12H44a6 6 0 0 0 0 12h12" fill="none" stroke="${b}" stroke-width="5" stroke-linecap="round"/>`,
    gem: (a, b) => `<path d="M30 22h40l16 20-36 44-36-44z" fill="url(#g)"/><path d="M14 42h72L50 86z" fill="${b}" opacity=".45"/><path d="M30 22l8 20h24l8-20M38 42l12 44 12-44" fill="none" stroke="#fff" stroke-width="2" opacity=".55"/>`,
    bar: (a, b) => `<path d="M22 64l10-26h36l10 26z" fill="url(#g)"/><path d="M22 64h56v8H22z" fill="${b}"/><path d="M36 44h28" stroke="#fff" stroke-width="3" opacity=".5" stroke-linecap="round"/>`,
    crown: (a, b) => `<path d="M18 70l-4-38 20 16 16-24 16 24 20-16-4 38z" fill="url(#g)"/><rect x="18" y="70" width="64" height="9" rx="3" fill="${b}"/><circle cx="50" cy="56" r="6" fill="#fff" opacity=".7"/>`,
    diamond: (a, b) => `<path d="M50 10l34 40-34 40-34-40z" fill="url(#g)"/><path d="M16 50h68M50 10v80M33 30l17 20 17-20" fill="none" stroke="#fff" stroke-width="2" opacity=".5"/>`,
    trophy: (a, b) => `<path d="M32 18h36v18a18 18 0 0 1-36 0z" fill="url(#g)"/><path d="M32 24H20v6a12 12 0 0 0 12 12M68 24h12v6a12 12 0 0 1-12 12" fill="none" stroke="${a}" stroke-width="5"/><path d="M46 54h8v14h-8z" fill="${b}"/><rect x="34" y="68" width="32" height="10" rx="3" fill="${b}"/>`,
    watch: (a, b) => `<rect x="38" y="10" width="24" height="80" rx="8" fill="${b}"/><circle cx="50" cy="50" r="24" fill="url(#g)"/><circle cx="50" cy="50" r="18" fill="#0f212e"/><path d="M50 38v12l8 6" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"/>`,
    chest: (a, b) => `<path d="M18 46a32 18 0 0 1 64 0z" fill="url(#g)"/><rect x="18" y="46" width="64" height="34" rx="4" fill="url(#g)"/><path d="M18 52h64" stroke="${b}" stroke-width="5"/><rect x="44" y="48" width="12" height="14" rx="2" fill="${b}"/>`
};

const itemSvg = (shape, rarity) => {
    const [a, b] = RARITY[rarity];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>${shapes[shape](a, b)}</svg>`;
};

const ITEMS = [
    ['Copper Coin', 'coin', 'common', 0.3],
    ['Silver Coin', 'coin', 'common', 0.8],
    ['Gold Coin', 'coin', 'uncommon', 2.5],
    ['Jade Shard', 'gem', 'uncommon', 5],
    ['Sapphire', 'gem', 'rare', 12],
    ['Silver Bar', 'bar', 'rare', 25],
    ['Amethyst', 'gem', 'epic', 45],
    ['Gold Bar', 'bar', 'legendary', 90],
    ['Royal Watch', 'watch', 'epic', 180],
    ['Ruby Heart', 'gem', 'mythic', 350],
    ['Golden Trophy', 'trophy', 'legendary', 700],
    ['Treasure Chest', 'chest', 'legendary', 1500],
    ['Emperor Crown', 'crown', 'mythic', 4000],
    ['Pink Diamond', 'diamond', 'mythic', 12000]
];

// [name, categories, colors, [item name, relative weight]...]
const CASES = [
    ['Starter Case', ['featured', 'low risk'], ['#64748b', '#334155'], [['Copper Coin', 50], ['Silver Coin', 30], ['Gold Coin', 14], ['Jade Shard', 5], ['Sapphire', 1]]],
    ['Silver Case', ['featured', '50/50'], ['#cbd5e1', '#64748b'], [['Silver Coin', 40], ['Gold Coin', 30], ['Jade Shard', 18], ['Sapphire', 9], ['Silver Bar', 2.5], ['Amethyst', 0.5]]],
    ['Gem Case', ['featured', 'high risk'], ['#38bdf8', '#7e22ce'], [['Gold Coin', 45], ['Jade Shard', 25], ['Sapphire', 18], ['Amethyst', 9], ['Ruby Heart', 2.5], ['Pink Diamond', 0.05]]],
    ['Gold Case', ['featured', '50/50'], ['#fde047', '#b45309'], [['Jade Shard', 30], ['Sapphire', 30], ['Silver Bar', 20], ['Gold Bar', 14], ['Royal Watch', 5], ['Golden Trophy', 1]]],
    ['Royal Case', ['high risk'], ['#c084fc', '#4c1d95'], [['Silver Bar', 35], ['Amethyst', 30], ['Gold Bar', 20], ['Royal Watch', 10], ['Treasure Chest', 4], ['Emperor Crown', 1]]],
    ['Whale Case', ['high risk', 'partners'], ['#fb7185', '#7f1d1d'], [['Gold Bar', 40], ['Royal Watch', 28], ['Ruby Heart', 18], ['Golden Trophy', 9], ['Emperor Crown', 4], ['Pink Diamond', 1]]]
];

const caseSvg = (name, [a, b]) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="400" height="400">
<defs>
  <linearGradient id="lid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
  <linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="#0f212e"/></linearGradient>
  <radialGradient id="glow" cx=".5" cy=".55" r=".5"><stop offset="0" stop-color="${a}" stop-opacity=".55"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></radialGradient>
</defs>
<circle cx="100" cy="110" r="95" fill="url(#glow)"/>
<path d="M32 92 L100 62 L168 92 L100 122 Z" fill="url(#lid)"/>
<path d="M32 92 V148 L100 180 V122 Z" fill="url(#body)"/>
<path d="M168 92 V148 L100 180 V122 Z" fill="${b}"/>
<path d="M32 92 L100 122 L168 92" fill="none" stroke="#ffffff" stroke-opacity=".35" stroke-width="2"/>
<path d="M66 107 V163 M134 107 V163" stroke="${a}" stroke-width="7" stroke-linecap="round" opacity=".9"/>
<rect x="88" y="128" width="24" height="24" rx="4" fill="${a}"/>
<circle cx="100" cy="140" r="5" fill="#0f212e"/>
</svg>`;

const slugify = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

(async () => {
    await mongoose.connect(process.env.DATABASE_URI);

    // Remove what a previous run created
    const oldItems = await LimitedItem.find({ assetId: { $regex: '^' + SEED_PREFIX } }).select('_id').lean();
    await Box.deleteMany({ 'items.item': { $in: oldItems.map((item) => item._id) } });
    await LimitedItem.deleteMany({ _id: { $in: oldItems.map((item) => item._id) } });

    // Items
    const items = {};
    for(const [name, shape, rarity, value] of ITEMS) {
        const item = await LimitedItem.create({
            assetId: SEED_PREFIX + slugify(name),
            name: name,
            image: 'data:image/svg+xml;base64,' + Buffer.from(itemSvg(shape, rarity)).toString('base64'),
            amount: Math.round(value * COIN),
            amountFixed: Math.round(value * COIN),
            accepted: false
        });
        items[name] = item;
    }

    // Case images rendered to PNG (the frontend loads /public/img/<slug>.png from the backend)
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
    const page = await browser.newPage();
    await page.setViewport({ width: 400, height: 400 });

    for(const [name, categories, colors, content] of CASES) {
        const slug = slugify(name);
        await page.setContent(`<html><body style="margin:0;background:transparent">${caseSvg(name, colors)}</body></html>`);
        await page.screenshot({ path: path.join(__dirname, '..', 'public', 'img', slug + '.png'), omitBackground: true, clip: { x: 0, y: 0, width: 400, height: 400 } });

        // Weights -> tickets out of 100,000
        const totalWeight = content.reduce((sum, [, weight]) => sum + weight, 0);
        let assigned = 0;
        const boxItems = content.map(([itemName, weight], index) => {
            const tickets = index === content.length - 1 ? 100000 - assigned : Math.max(1, Math.round(weight / totalWeight * 100000));
            assigned += tickets;
            return { item: items[itemName]._id, tickets: tickets };
        });

        // Same price formula as the admin panel: expected value + 15%
        const amount = boxItems.reduce((sum, entry) => {
            const item = Object.values(items).find((element) => element._id.equals(entry.item));
            return sum + Math.floor(item.amountFixed * (entry.tickets / 100000) * 1.15);
        }, 0);

        await Box.create({ name: name, slug: slug, amount: amount, levelMin: 0, items: boxItems, categories: categories, type: 'site', state: 'active' });
        console.log(`${name.padEnd(14)} price ${(amount / COIN).toFixed(2)}`);
    }

    await browser.close();
    await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
