// Rewarded ads: play coins for watching an ad.
// Google does not confirm web rewarded views to the server, so the limits below are
// what keeps the feature from being farmed: a daily cap, a cooldown between ads, a
// minimum watch time between start and claim, and one claim per started ad.

const ADS_REWARD = process.env.ADS_REWARD !== undefined ? Number(process.env.ADS_REWARD) : 0.5;
const ADS_DAILY_LIMIT = process.env.ADS_DAILY_LIMIT !== undefined ? Number(process.env.ADS_DAILY_LIMIT) : 10;
const ADS_COOLDOWN = (process.env.ADS_COOLDOWN !== undefined ? Number(process.env.ADS_COOLDOWN) : 60) * 1000;
const ADS_MIN_WATCH = (process.env.ADS_MIN_WATCH !== undefined ? Number(process.env.ADS_MIN_WATCH) : 8) * 1000;
const ADS_MAX_WATCH = 1000 * 60 * 10;

const adsStartOfDay = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// { reward, limit, watched, cooldownLeft } for the wallet tab
const adsGetStatus = (watched, lastGrantedAt) => {
    const cooldownLeft = lastGrantedAt ? Math.max(0, new Date(lastGrantedAt).getTime() + ADS_COOLDOWN - new Date().getTime()) : 0;
    return {
        reward: Math.floor(ADS_REWARD * 1000),
        limit: ADS_DAILY_LIMIT,
        watched: watched,
        cooldownLeft: cooldownLeft
    };
}

const adsCheckCanWatch = (status) => {
    if(status.watched >= status.limit) {
        throw new Error('You reached today’s limit of rewarded ads. Come back tomorrow.');
    } else if(status.cooldownLeft > 0) {
        throw new Error('Please wait ' + Math.ceil(status.cooldownLeft / 1000) + 's before the next ad.');
    }
}

const adsCheckClaimData = (data) => {
    if(data === undefined || data === null || typeof data.token !== 'string' || /^[a-f0-9]{48}$/.test(data.token) !== true) {
        throw new Error('This ad session is invalid.');
    }
}

const adsCheckClaimView = (view) => {
    if(view === null) {
        throw new Error('This ad session is invalid or was already used.');
    }

    const elapsed = new Date().getTime() - new Date(view.createdAt).getTime();
    if(elapsed < ADS_MIN_WATCH) {
        throw new Error('The ad needs to be watched to the end.');
    } else if(elapsed > ADS_MAX_WATCH) {
        throw new Error('This ad session expired. Please watch a new ad.');
    }
}

module.exports = {
    ADS_REWARD,
    adsStartOfDay,
    adsGetStatus,
    adsCheckCanWatch,
    adsCheckClaimData,
    adsCheckClaimView
}
