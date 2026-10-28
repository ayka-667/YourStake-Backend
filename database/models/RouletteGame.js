const mongoose = require('mongoose');

const rouletteGameSchema = new mongoose.Schema({
    table: { type: Number },
    type: { type: String },
    outcome: { type: Number },
    fair: {
        seedServer: { type: String },
        hash: { type: String }
    },
    state: { type: String },
    updatedAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
}, { toJSON: { virtuals: true }, toObject: { virtuals: true } });

// Reverse populate with virtuals
rouletteGameSchema.virtual('bets', {
    ref: 'RouletteBet',
    localField: '_id',
    foreignField: 'game',
    justOne: false
});

rouletteGameSchema.index({ state: 1 });

module.exports = mongoose.model('RouletteGame', rouletteGameSchema);
