const logger = {
  info: (message, meta = {}) => {
    console.log(`[INFO] ${message}`, meta);
  },

  warn: (message, meta = {}) => {
    console.warn(`[WARN] ${message}`, meta);
  },

  error: (messageOrError, meta = {}) => {
    if (messageOrError instanceof Error) {
      console.error(
        `[ERROR] ${messageOrError.message}`,
        {
          stack: messageOrError.stack,
          ...meta
        }
      );
    } else {
      console.error(
        `[ERROR] ${messageOrError}`,
        meta
      );
    }
  },

  debug: (message, meta = {}) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(
        `[DEBUG] ${message}`,
        meta
      );
    }
  }
};

module.exports = logger;