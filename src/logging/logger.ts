process.env.PINO_DISABLE_EXIT_FLUSH = 'true';

import {pino} from 'pino'; 
import path from 'path';
import fs from 'fs';
import { getPaths } from '../utils.js';

const { __dirname } = getPaths(import.meta.url);

// log storage
const errorLogFilePath = path.join(__dirname, '..','..', 'logs', 'error.log');
const logFilePath = path.join(__dirname, '..', '..', 'logs', 'app.log');

// create log folder if it doesnt exist
const logsDir = path.dirname(logFilePath);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logger = pino({
  level: 'info',
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
  //@ts-ignore
}, pino.transport({
  targets: [
    {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
      level: 'info',
    },
    {
      target: 'pino/file',
      options: { 
        destination: logFilePath,
        sync: false,
        mkdir: true
      },
      level: 'info',
    },
    {
      target: 'pino/file',
      options: { 
        destination: errorLogFilePath,
        sync: false,
        mkdir: true
      },
      level: 'error'
    }
  ]
}));

export default logger;