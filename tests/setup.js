const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

// Start the in-memory MongoDB instance before tests
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  
  // Set the environment variable purely so modules expecting MONGODB_URI are happy
  process.env.MONGODB_URI = uri;
  
  // Prevent mongoose from throwing deprecation warnings loosely 
  await mongoose.connect(uri);
});

// Drop database cleanly after each test suite finishes its sub-block
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (let key in collections) {
    const collection = collections[key];
    await collection.deleteMany();
  }
});

// Fully tear down the in-memory server after all tests
afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});
