const mongoose = require('mongoose');

// One document per instant game round (plinko, dice, flip).
const originalGameSchema = new mongoose.Schema({
    game: { type: String },
    amount: { type: Number },
    payout: { type: Number },
    multiplier: { type: Number },
    options: { type: mongoose.Schema.Types.Mixed },
    outcome: { type: mongoose.Schema.Types.Mixed },
    fair: {
        seed: { type: mongoose.Schema.ObjectId, ref: 'UserSeed' },
        nonce: { type: Number }
    },
    user: { type: mongoose.Schema.ObjectId, ref: 'User' },
    state: { type: String },
    updatedAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

originalGameSchema.index({ user: 1, createdAt: -1 });
originalGameSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('OriginalGame', originalGameSchema);
