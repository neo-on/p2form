require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const { connectDB, getConnectionStatus } = require('./config/db');
const authRoutes = require('./routes/auth');
const formRoutes = require('./routes/form');

const app = express();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function startServer() {
  // Attempt MongoDB connection (non-fatal if it fails)
  await connectDB();

  // Session config — use MongoStore only if DB connected
  const sessionConfig = {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
  };

  if (getConnectionStatus()) {
    const MongoStore = require('connect-mongo');
    sessionConfig.store = MongoStore.create({ mongoUrl: process.env.MONGODB_URI });
    console.log('Using MongoStore for sessions');
  } else {
    console.warn('Using in-memory session store (MongoDB unavailable)');
  }

  app.use(session(sessionConfig));

  // Routes
  app.use('/', authRoutes);
  app.use('/', formRoutes);

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`P2 Form App running on http://localhost:${PORT}`);
  });
}

startServer();
