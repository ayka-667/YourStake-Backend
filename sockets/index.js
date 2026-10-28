module.exports = (io) => {

    require('./general')(io);
    require('./crash')(io);
    require('./roll')(io);
    require('./blackjack')(io);
    require('./duels')(io);
    require('./mines')(io);
    require('./towers')(io);
    require('./roulette')(io);
    require('./originals')(io);
    require('./cashier')(io);
    require('./admin')(io);

}
