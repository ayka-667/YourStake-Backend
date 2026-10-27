// Checks that a MongoDB connection string works (connect, auth, write, delete).
// Usage: node scripts/test-db.js "mongodb://user:password@host:port/db?authSource=db"
const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

const uri = process.argv[2] || process.env.TEST_URI;
if(!uri) {
    console.error('Usage: node scripts/test-db.js "mongodb://user:password@host:port/db?authSource=db"');
    process.exit(1);
}

(async () => {
    try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
        await mongoose.connection.db.command({ ping: 1 });
        console.log('Connexion + authentification OK');

        const collection = mongoose.connection.db.collection('connection_test');
        await collection.insertOne({ at: new Date() });
        console.log('Ecriture OK');

        await collection.drop();
        console.log('Suppression OK');
    } catch(err) {
        console.error('ERREUR :', err.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
})();
