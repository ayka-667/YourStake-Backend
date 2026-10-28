const mongoose = require('mongoose');

const rouletteBetSchema = new mongoose.Schema({
    amount: { type: Number },
    payout: { type: Number },
    multiplier: { type: Number },
    bets: [{
        _id: false,
        type: { type: String },
        value: { type: mongoose.Schema.Types.Mixed },
        amount: { type: Number }
    }],
    game: { type: mongoose.Schema.ObjectId, ref: 'RouletteGame' },
    user: { type: mongoose.Schema.ObjectId, ref: 'User' },
    updatedAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

rouletteBetSchema.index({ user: 1, createdAt: -1 });
rouletteBetSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('RouletteBet', rouletteBetSchema);
