const mongoose = require('mongoose');

// One rewarded ad watched (or started) by a user.
const adViewSchema = new mongoose.Schema({
    token: { type: String },
    reward: { type: Number },
    user: { type: mongoose.Schema.ObjectId, ref: 'User' },
    state: { type: String }, // started, granted
    grantedAt: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

adViewSchema.index({ token: 1 }, { unique: true });
adViewSchema.index({ user: 1, state: 1, grantedAt: -1 });

module.exports = mongoose.model('AdView', adViewSchema);
