const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://StackNovas:E1w8oBHfD71MzbEG@cluster0.c4jlm5g.mongodb.net/memorybridge?retryWrites=true&w=majority';

async function wipeEverything() {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected!');

    const db = mongoose.connection.db;

    // Drop or delete all documents in User, Visitor, Reminder, ActivityLog, PatientSetting
    const collections = await db.listCollections().toArray();
    for (const col of collections) {
      console.log(`Wiping collection: ${col.name}`);
      await db.collection(col.name).deleteMany({});
    }

    console.log('✅ ALL MONGO_DB COLLECTIONS WIPED CLEAN (100% FRESH START)!');

    // Clear memory arrays in Node process if active
    if (global._memoryBridgeVisitors) global._memoryBridgeVisitors = [];
    if (global._memoryBridgeReminders) global._memoryBridgeReminders = [];
    if (global._memoryBridgeUsers) global._memoryBridgeUsers = [];

    process.exit(0);
  } catch (err) {
    console.error('Error wiping database:', err);
    process.exit(1);
  }
}

wipeEverything();
