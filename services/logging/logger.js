import winston from 'winston';

// Check if running in serverless environment (Vercel)
const isServerless = process.env.VERCEL === '1';
const isProduction = process.env.NODE_ENV === 'production';

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Console format for local development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Console-only logging (works on Vercel serverless)
export const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: isServerless || isProduction ? logFormat : consoleFormat,
    })
  ],
});

// Interaction logger
export const interactionLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: isServerless || isProduction ? logFormat : consoleFormat,
    }),
  ],
});
