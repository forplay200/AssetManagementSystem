const policy = require('../services/trialPolicy');
module.exports = async (req, res, next) => {
  if (!policy.enabled()) return next();
  try {
    const redis = require('../redisClient');
    const count = await redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],900) end return n", { keys: [`trial:uploads:${req.user.id}:${Math.floor(Date.now()/900000)}`], arguments: [] });
    if (count > policy.limit('TRIAL_UPLOADS_PER_15_MIN', 15)) { res.setHeader('Retry-After', '900'); return res.status(429).json({ message: 'Upload allowance reached. Please wait up to 15 minutes before trying again.' }); }
    next();
  } catch (error) { res.status(503).json({ message: 'Upload protection is unavailable. Please retry later.' }); }
};
