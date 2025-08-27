import { pino } from 'pino';
import path from 'path';
import { getPaths } from '../utils.ts';

const { __dirname } = getPaths(import.meta.url);

// Where to store logs
const errorLogFilePath = path.join(__dirname, '..','..', 'logs', 'error.log');
const logFilePath = path.join(__dirname, '..', '..', 'logs', 'app.log');

const logger = pino({
  level: 'info',
  timestamp: pino.stdTimeFunctions.isoTime, // readable timestamps
}, pino.transport({
  targets: [
    {
      target: 'pino-pretty', // pretty-print to console
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
      level: 'info',
    },
    {
      target: 'pino/file', // write raw logs to a file
      options: { destination: logFilePath },
      level: 'info',
    },
    {
      target: 'pino/file',
      options: { destination: errorLogFilePath},
      level: 'error'
    }
  ]
}));

export default logger;
