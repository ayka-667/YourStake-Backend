const validator = require('validator');

// Share of every bet (win or lose) made by a referred player that goes to the code owner
const AFFILIATE_RATE = process.env.AFFILIATE_RATE !== undefined ? Number(process.env.AFFILIATE_RATE) : 0.1;

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

const generalCheckSendAffiliateClaimEarningsUser = (user) => {
    if(user === undefined) {
        throw new Error('Something went wrong. Please try again in a few seconds.');
    } else if(user.affiliates.available < Math.floor(process.env.AFFILIATE_MIN_CLAIM * 1000)) {
        throw new Error(`You’ll need a minimum of ${process.env.AFFILIATE_MIN_CLAIM} coins in earnings to claim.`);
    }
}

module.exports = {
    AFFILIATE_RATE,
    generalCheckSendAffiliateCodeData,
    generalCheckSendAffiliateCodeCode,
    generalCheckSendAffiliateClaimCodeData,
    generalCheckSendAffiliateClaimCodeUser,
    generalCheckSendAffiliateClaimCodeCode,
    generalCheckSendAffiliateClaimEarningsUser
}
