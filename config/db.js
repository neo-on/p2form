const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });
    isConnected = true;
    console.log('MongoDB connected successfully');
  } catch (err) {
    isConnected = false;
    console.warn('MongoDB not available:', err.message);
    console.warn('Server will start without DB. Login/Register will not work until MongoDB is connected.');
  }
};

const getConnectionStatus = () => isConnected;

module.exports = { connectDB, getConnectionStatus };
