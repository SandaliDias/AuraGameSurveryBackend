import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import helmet from 'helmet';
import compression from 'compression';

// Routes
import resultsRoutes from './routes/results.js';
import motorRoutes from './routes/motor.js';
import impairmentRoutes from './routes/impairment.js';
import deviceContextRoutes from './routes/deviceContext.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Check if running on Vercel (serverless)
const isVercel = process.env.VERCEL === '1';

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
}));

// Compression
app.use(compression());

// CORS - allow all origins
app.use(cors());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection (with caching for serverless)
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb && mongoose.connection.readyState === 1) {
    return cachedDb;
  }
  
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set');
  }
  
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      bufferCommands: false,
    });
    cachedDb = mongoose.connection;
    console.log('MongoDB connected');
    return cachedDb;
  } catch (error) {
    console.error('MongoDB error:', error.message);
    throw error;
  }
}

// DB middleware for all /api routes
app.use('/api', async (req, res, next) => {
  if (req.path === '/health') return next();
  
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database connection failed' });
  }
});

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'SenseCheck API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      results: '/api/results',
      motor: '/api/motor',
      impairment: '/api/impairment',
      deviceContext: '/api/device-context'
    }
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// API Routes
app.use('/api/results', resultsRoutes);
app.use('/api/motor', motorRoutes);
app.use('/api/impairment', impairmentRoutes);
app.use('/api/device-context', deviceContextRoutes);

// 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ success: false, error: err.message });
});

// Start server only if not on Vercel (Vercel handles this automatically)
if (!isVercel) {
  connectToDatabase().then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  });
}

// Export for Vercel
export default app;