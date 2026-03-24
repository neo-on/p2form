/**
 * Seed script - creates test users in MongoDB
 * Run: npm run seed
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // --- UAT Test User (from "Process to be followed for API integration" doc) ---
  await User.deleteOne({ email: 'uat@sugarmill.com' });

  const uatUser = new User({
    email: 'uat@sugarmill.com',
    password: 'uat@123',
    isApproved: true,
    approvalId: 'M009_D001_A076',
    swsId: 'SW4267788494',
    projectNumber: 'P_19',
    undertakingName: 'DELIGHT PROTEINS LIMITED',
    plantName: 'Balrampur',
    plantCode: '8901',
    state: 'UTTAR PRADESH',
    capacity: '15000'
  });

  await uatUser.save();
  console.log('\nUAT Test User created (from Process doc):');
  console.log('  Email:       uat@sugarmill.com');
  console.log('  Password:    uat@123');
  console.log('  Approval ID: M009_D001_A076');
  console.log('  SWS ID:      SW4267788494');
  console.log('  Project No:  P_19');
  console.log('  Plant:       Balrampur (8901)');
  console.log('  Undertaking: DELIGHT PROTEINS LIMITED');
  console.log('  State:       UTTAR PRADESH');
  console.log('  Capacity:    15000 TCD');

  // --- Sample user from P2 API Document ---
  await User.deleteOne({ email: 'test@sugarmill.com' });

  const sampleUser = new User({
    email: 'test@sugarmill.com',
    password: 'password123',
    isApproved: true,
    approvalId: 'M009_D001_A076',
    swsId: 'SW0121626967',
    projectNumber: 'P_1',
    undertakingName: 'Vijay',
    plantName: 'GURDASPUR',
    plantCode: '101',
    state: 'KARNATAKA',
    capacity: '100.00'
  });

  await sampleUser.save();
  console.log('\nSample User created (from API doc):');
  console.log('  Email:       test@sugarmill.com');
  console.log('  Password:    password123');
  console.log('  Plant:       GURDASPUR (101)');

  await mongoose.disconnect();
  console.log('\nDone! Both users seeded.');
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
