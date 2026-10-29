// Daily reward: free play coins, claimable once every 24 hours.
// Users who redeemed an affiliate code get the bigger reward.

const DAILY_REWARD = process.env.DAILY_REWARD !== undefined ? Number(process.env.DAILY_REWARD) : 10;
const DAILY_REWARD_AFFILIATED = process.env.DAILY_REWARD_AFFILIATED !== undefined ? Number(process.env.DAILY_REWARD_AFFILIATED) : 100;
const DAILY_COOLDOWN = 1000 * 60 * 60 * 24;

// Login streak: claiming again within 48h of the last claim keeps the streak going.
// Every streak day adds half the base reward, up to day 7 (x4).
const DAILY_STREAK_WINDOW = 1000 * 60 * 60 * 48;
const DAILY_STREAK_MAX = 7;
const DAILY_STREAK_BONUS = 0.5;

const dailyIsAffiliated = (user) => {
    return user.affiliates !== undefined && user.affiliates !== null && user.affiliates.referrer !== undefined && user.affiliates.referrer !== null;
}

const dailyGetReward = (base, streak) => {
    return Math.floor(base * (1 + DAILY_STREAK_BONUS * (Math.min(streak, DAILY_STREAK_MAX) - 1)) * 1000);
}

// { reward, affiliated, cooldownLeft, streak, nextStreak, streakMax, streakLeft, rewards } for the rewards page
const dailyGetStatus = (user) => {
    const daily = user.daily !== undefined && user.daily !== null ? user.daily : {};
    const claimedAt = daily.claimedAt ? new Date(daily.claimedAt).getTime() : null;
    const now = new Date().getTime();
    const affiliated = dailyIsAffiliated(user);
    const base = affiliated === true ? DAILY_REWARD_AFFILIATED : DAILY_REWARD;
    const cooldownLeft = claimedAt !== null ? Math.max(0, claimedAt + DAILY_COOLDOWN - now) : 0;

    // The streak is lost once the 48h window after the last claim is over
    const alive = claimedAt !== null && now - claimedAt <= DAILY_STREAK_WINDOW;
    const streak = alive === true ? (daily.streak || 1) : 0;
    const nextStreak = streak + 1;

    return {
        reward: dailyGetReward(base, nextStreak),
        affiliated: affiliated,
        cooldownLeft: cooldownLeft,
        streak: streak,
        nextStreak: nextStreak,
        streakMax: DAILY_STREAK_MAX,
        streakLeft: alive === true ? Math.max(0, claimedAt + DAILY_STREAK_WINDOW - now) : 0,
        rewards: Array.from({ length: DAILY_STREAK_MAX }, (element, index) => dailyGetReward(base, index + 1))
    };
}

const dailyCheckCanClaim = (status) => {
    if(status.cooldownLeft > 0) {
        const total = Math.ceil(status.cooldownLeft / 60000);
        const hours = Math.floor(total / 60);
        const minutes = total % 60;
        throw new Error('You already claimed your daily reward. Come back in ' + (hours > 0 ? hours + 'h ' : '') + minutes + 'min.');
    }
}

module.exports = {
    DAILY_COOLDOWN,
    dailyGetStatus,
    dailyCheckCanClaim
}
