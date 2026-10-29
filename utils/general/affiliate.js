const validator = require('validator');

// Load database models
const User = require('../../database/models/User');

// Share of every bet (win or lose) made by a referred player that goes to the code owner
const AFFILIATE_RATE = process.env.AFFILIATE_RATE !== undefined ? Number(process.env.AFFILIATE_RATE) : 0.1;

// Most a code owner can earn from his referred players per day (UTC), in coins
const AFFILIATE_DAILY_CAP = Math.floor((process.env.AFFILIATE_DAILY_CAP !== undefined ? Number(process.env.AFFILIATE_DAILY_CAP) : 500) * 1000);

// Loopback and private addresses (proxy, local network) say nothing about who the player is
const affiliateIsPublicIp = (ip) => {
    if(typeof ip !== 'string' || ip === '') { return false; }
    const address = ip.replace(/^::ffff:/, '');
    return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(address) !== true;
}

// Credits the code owner, capped per day: one pipeline update so parallel bets can't go over the cap
const generalAffiliateCreditReferrer = (referrerId, amount) => {
    const day = new Date().toISOString().slice(0, 10);
    const earnedToday = { $cond: [{ $eq: ['$affiliates.cap.day', day] }, { $ifNull: ['$affiliates.cap.earned', 0] }, 0] };

    return User.updateOne({ _id: referrerId }, [
        { $set: { affiliateCredit: { $max: [0, { $min: [Math.floor(amount), { $subtract: [AFFILIATE_DAILY_CAP, earnedToday] }] }] } } },
        { $set: {
            'affiliates.earned': { $add: [{ $ifNull: ['$affiliates.earned', 0] }, '$affiliateCredit'] },
            'affiliates.available': { $add: [{ $ifNull: ['$affiliates.available', 0] }, '$affiliateCredit'] },
            'affiliates.cap.earned': { $add: [earnedToday, '$affiliateCredit'] },
            'affiliates.cap.day': day,
            updatedAt: new Date()
        } },
        { $unset: 'affiliateCredit' }
    ]);
}

const generalCheckSendAffiliateCodeData = (data) => {
    if(data === undefined || data === null) {
        throw new Error('Something went wrong! Please try again in a few seconds.');
    } else if(data.code === undefined || data.code === null || typeof data.code !== 'string' || data.code.trim() === '' || data.code.length < 2 || data.code.length > 20 || validator.isAlphanumeric(data.code, 'en-US', { ignore: '-_' }) !== true) {
        throw new Error('Your entered affiliate code is invalid.');
    }
}

const generalCheckSendAffiliateCodeCode = (checkCode) => {
    if(checkCode !== undefined && checkCode !== null) {
        throw new Error('You’ve entered an affiliate code that is already used by another user.');
    }
}

const generalCheckSendAffiliateClaimCodeData = (data) => {
    if(data === undefined || data === null) {
        throw new Error('Something went wrong! Please try again in a few seconds.');
    } else if(data.captcha === undefined || data.captcha === null || typeof data.captcha !== 'string') {
        throw new Error('Your provided captcha token is invalid.');
    } else if(data.code === undefined || data.code === null || typeof data.code !== 'string' || data.code.trim() === '' || data.code.length < 2 || data.code.length > 20 || validator.isAlphanumeric(data.code, 'en-US', { ignore: '-_' }) !== true) {
        throw new Error('Your entered affiliate code is invalid.');
    }
}

const generalCheckSendAffiliateClaimCodeUser = (user, addressDatabase) => {
    if(user === undefined || user === null) {
        throw new Error('Something went wrong. Please try again in a few seconds.');
    } else if(user.affiliates.referredAddress !== undefined || addressDatabase !== null) {
        throw new Error('You have already redeemed a affiliate code.');
    }
}

const generalCheckSendAffiliateClaimCodeCode = (user, codeDatabase) => {
    if(codeDatabase === null) {
        throw new Error('Your provided affiliate code is invalid.');
    } else if(user._id.toString() === codeDatabase._id.toString()) {
        throw new Error('You are not allowed to redeem your own affiliate code.');
    }
}

// The code owner must not share a network with the redeeming account (same person on an alt)
const generalCheckSendAffiliateClaimCodeNetwork = (userIps, codeDatabase) => {
    const ownerIps = (codeDatabase.ips || []).map((element) => element.address).filter(affiliateIsPublicIp);
    if(userIps.filter(affiliateIsPublicIp).some((ip) => ownerIps.includes(ip)) === true) {
        throw new Error('You are not allowed to redeem an affiliate code of an account on the same network as yours.');
    }
}

const generalCheckSendAffiliateClaimEarningsUser = (user) => {
    if(user === undefined) {
        throw new Error('Something went wrong. Please try again in a few seconds.');
    } else if(user.affiliates.available < Math.floor(process.env.AFFILIATE_MIN_CLAIM * 1000)) {
        throw new Error(`You’ll need a minimum of ${process.env.AFFILIATE_MIN_CLAIM} coins in earnings to claim.`);
    }
}

module.exports = {
    AFFILIATE_RATE,
    AFFILIATE_DAILY_CAP,
    affiliateIsPublicIp,
    generalAffiliateCreditReferrer,
    generalCheckSendAffiliateClaimCodeNetwork,
    generalCheckSendAffiliateCodeData,
    generalCheckSendAffiliateCodeCode,
    generalCheckSendAffiliateClaimCodeData,
    generalCheckSendAffiliateClaimCodeUser,
    generalCheckSendAffiliateClaimCodeCode,
    generalCheckSendAffiliateClaimEarningsUser
}
