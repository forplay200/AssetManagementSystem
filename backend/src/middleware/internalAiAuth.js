const crypto = require('crypto');

module.exports = function internalAiAuth(req, res, next) {
  const expected = process.env.AI_SERVICE_TOKEN;
  const received = req.header('X-AI-Service-Token');
  if (!expected) return res.status(503).json({ message: 'AI service authentication is not configured' });
  if (!received) return res.status(401).json({ message: 'AI service authentication required' });

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length
      || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
    return res.status(403).json({ message: 'Invalid AI service credentials' });
  }
  next();
};
