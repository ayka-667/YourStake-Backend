// Usage: node scripts/make-admin.js <username|email>
//
// Works with the exact username, a case-insensitive username, or an e-mail.
// Safe to run several times: nothing changes if the user is already admin.
require('dotenv').config({ path: __dirname + '/../config/config.env' });
const mongoose = require('mongoose');
const User = require('../database/models/User');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

(async () => {
    const identifier = process.argv[2];

    if(!identifier) {
        console.error('Usage: node scripts/make-admin.js <username|email>');
        process.exit(1);
    }

    try {
        await mongoose.connect(process.env.DATABASE_URI, { serverSelectionTimeoutMS: 10000 });

        let user = await User.findOne({ username: identifier });

        if(user === null) {
            user = await User.findOne({ username: { $regex: `^${escapeRegex(identifier)}$`, $options: 'i' } });
        }

        if(user === null && identifier.includes('@')) {
            user = await User.findOne({ 'local.email': identifier.toLowerCase() });
        }

        if(user === null) {
            console.error(`No user found with username or e-mail "${identifier}".`);
            process.exitCode = 1;
            return;
        }

        if(user.rank === 'admin') {
            console.log(`${user.username} is already admin.`);
            return;
        }

        user = await User.findByIdAndUpdate(user._id, { rank: 'admin' }, { new: true });

        console.log(`${user.username} is now admin.`);
    } catch(err) {
        console.error(`Error: ${err.message}`);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
})();
