// Daily reward: free play coins, claimable once every 24 hours.
// Users who redeemed an affiliate code get the bigger reward.

const DAILY_REWARD = process.env.DAILY_REWARD !== undefined ? Number(process.env.DAILY_REWARD) : 10;
const DAILY_REWARD_AFFILIATED = process.env.DAILY_REWARD_AFFILIATED !== undefined ? Number(process.env.DAILY_REWARD_AFFILIATED) : 100;
const DAILY_COOLDOWN = 1000 * 60 * 60 * 24;

const dailyIsAffiliated = (user) => {
    return user.affiliates !== undefined && user.affiliates !== null && user.affiliates.referrer !== undefined && user.affiliates.referrer !== null;
}

// { reward, affiliated, cooldownLeft } for the rewards page
const dailyGetStatus = (user) => {
    const claimedAt = user.daily !== undefined && user.daily !== null ? user.daily.claimedAt : null;
    const affiliated = dailyIsAffiliated(user);
    const cooldownLeft = claimedAt ? Math.max(0, new Date(claimedAt).getTime() + DAILY_COOLDOWN - new Date().getTime()) : 0;
    return {
        reward: Math.floor((affiliated === true ? DAILY_REWARD_AFFILIATED : DAILY_REWARD) * 1000),
        affiliated: affiliated,
        cooldownLeft: cooldownLeft
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
