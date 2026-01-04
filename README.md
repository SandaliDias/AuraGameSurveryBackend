# Sensecheck Backend

Express.js backend API for the Sensecheck game.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env` file:
   ```env
   PORT=5000
   NODE_ENV=development
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/sensecheck
   ```

3. Run development server:
   ```bash
   npm run dev
   ```

## Deploy to Vercel

1. Push this folder to a new GitHub repo
2. Go to [vercel.com](https://vercel.com)
3. Import the repo
4. Add environment variables:
   - `NODE_ENV` = `production`
   - `MONGODB_URI` = `your-mongodb-connection-string`
5. Deploy!

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/results/session` | POST | Create session |
| `/api/results/session/:id` | GET | Get session |
| `/api/motor/trace` | POST | Save motor trace data |
| `/api/motor/attempts` | POST | Save motor attempts |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 5000) |
| `NODE_ENV` | Environment (development/production) |
| `MONGODB_URI` | MongoDB connection string |

