// seed.js
// Creates:
//   - 1 Admin user (phone: +919999999999)
//   - 1 Sample user (phone: +919876543210)
//   - 1 Sample pond linked to the sample user
//
// Run: node seed.js

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const User    = require('./models/User');
const Project = require('./models/Project');

const run = async () => {
  await connectDB();

  // Clear existing
  await User.deleteMany({});
  await Project.deleteMany({});

  console.log('🧹 Cleared existing users and ponds');

  // Admin
  const admin = await User.create({
    name:  'Admin',
    phone: '+919999999999',
    email: 'admin@aquapro.local',
    role:  'admin',
  });
  console.log(`✅ Admin created → phone: ${admin.phone}  _id: ${admin._id}`);

  // Sample user
  const user = await User.create({
    name:  'Keerthi Raj',
    phone: '+919876543210',
    email: 'keerthi@aquapro.local',
    role:  'user',
  });
  console.log(`✅ Sample user created → phone: ${user.phone}  _id: ${user._id}`);

  // Sample pond
  const pond = await Project.create({
    pondName: 'Pond A',
    userId:   user._id,
  });

  // Link pond to user
  await User.findByIdAndUpdate(user._id, { $push: { ponds: pond._id } });

  console.log(`✅ Sample pond created → name: ${pond.pondName}  _id: ${pond._id}`);
  console.log('\n📋 Use these IDs in your ESP32 serial_reader and dashboard:');
  console.log(`   pondId  : ${pond._id}`);
  console.log(`   userId  : ${user._id}`);
  console.log('\n🚀 Start serial reader: node serial_reader.js ' + pond._id);

  await mongoose.disconnect();
  console.log('\n✅ Seeding complete. MongoDB disconnected.');
};

run().catch(err => {
  console.error('❌ Seed error:', err);
  process.exit(1);
});
