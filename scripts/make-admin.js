// Usage: node scripts/make-admin.js <username>
require('dotenv').config({ path: __dirname + '/../config/config.env' });
const mongoose = require('mongoose');
const User = require('../database/models/User');

(async () => {
    const username = process.argv[2];
    if (!username) {
        console.error('Usage: node scripts/make-admin.js <username>');
        process.exit(1);
    }

    await mongoose.connect(process.env.DATABASE_URI);
    const user = await User.findOneAndUpdate({ username }, { rank: 'admin' }, { new: true });
    console.log(user ? `${user.username} is now admin.` : `No user named "${username}".`);
    await mongoose.disconnect();
})();
