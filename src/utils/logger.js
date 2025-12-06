import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '../../junk/logs');
    this.currentLogFile = path.join(this.logDir, `app-${this.getDateString()}.log`);

    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  getDateString() {
    const now = new Date();
    return now.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  getTimestamp() {
    return new Date().toISOString();
  }

  writeLog(level, service, message, data = null) {
    const logEntry = {
      timestamp: this.getTimestamp(),
      level,
      service,
      message,
      ...(data && { data })
    };

    // Console output with colors
    const colors = {
      INFO: '\x1b[36m',    // Cyan
      WARN: '\x1b[33m',    // Yellow
      ERROR: '\x1b[31m',   // Red
      SUCCESS: '\x1b[32m', // Green
      AUDIO: '\x1b[35m'    // Magenta
    };

    const color = colors[level] || '\x1b[0m';
    const reset = '\x1b[0m';

    const consoleMsg = `${color}[${level}] [${service}]${reset} ${message}`;
    console.log(consoleMsg);
    if (data) {
      console.log(data);
    }

    // File output
    const fileMsg = JSON.stringify(logEntry) + '\n';
    fs.appendFileSync(this.currentLogFile, fileMsg);
  }

  info(service, message, data) {
    this.writeLog('INFO', service, message, data);
  }

  warn(service, message, data) {
    this.writeLog('WARN', service, message, data);
  }

  error(service, message, data) {
    this.writeLog('ERROR', service, message, data);
  }

  success(service, message, data) {
    this.writeLog('SUCCESS', service, message, data);
  }

  audio(service, message, data) {
    this.writeLog('AUDIO', service, message, data);
  }
}

// Singleton instance
const logger = new Logger();
export default logger;
