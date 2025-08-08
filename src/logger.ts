import { pino } from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Where to store logs
const logFilePath = path.join(__dirname, '..', 'logs', 'app.log');

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
    }
  ]
}));

export default logger;
