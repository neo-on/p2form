const dns = require('dns');
dns.setDefaultResultOrder('ipv4first'); // Force IPv4 globally to prevent IPv6 timeouts (ESOCKET)
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const { connectDB, getConnectionStatus } = require('./config/db');
const authRoutes = require('./routes/auth');
const formRoutes = require('./routes/form');
const draftRoutes = require('./routes/draft');

const app = express();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],  // Required: Helmet blocks onclick/onchange by default
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"]
    }
  }
}));
app.use(compression());
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

  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1); // Trust first proxy (Nginx)
    sessionConfig.cookie.secure = true; // Serve secure cookies
  }

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
  app.use('/', draftRoutes);

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`P2 Form App running on http://localhost:${PORT}`);
  });
}

startServer();
