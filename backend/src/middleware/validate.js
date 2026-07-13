const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validate = (schema = {}) => (req, res, next) => {
  const errors = [];

  for (const [location, fields] of Object.entries(schema)) {
    const source = req[location] || {};

    for (const [field, rules] of Object.entries(fields || {})) {
      const value = source[field];
      const missing = value === undefined || value === null || value === '';

      if (rules.required && missing) {
        errors.push({ field, location, message: `${field} is required` });
        continue;
      }
      if (missing) continue;
      if (rules.type && typeof value !== rules.type) {
        errors.push({ field, location, message: `${field} must be a ${rules.type}` });
        continue;
      }
      if (rules.minLength && value.length < rules.minLength) {
        errors.push({ field, location, message: `${field} must be at least ${rules.minLength} characters` });
      }
      if (rules.email && !EMAIL_PATTERN.test(value)) {
        errors.push({ field, location, message: `${field} must be a valid email address` });
      }
    }
  }

  if (errors.length) {
    return res.status(400).json({ message: 'Validation failed', errors });
  }
  return next();
};

module.exports = { validate };
