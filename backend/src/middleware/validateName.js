// Display names are text, never filenames. Check raw controls before trimming.
module.exports = function validateName(field, min, max) {
  return (req, res, next) => {
    const raw = req.body?.[field];
    let message;
    if (typeof raw !== 'string') message = 'Must be a string';
    else if (/[\u0000-\u001f\u007f-\u009f]/.test(raw)) message = 'Must not contain control characters';
    else if (raw.trim().length < min || raw.trim().length > max) message = `Must contain ${min}–${max} characters`;
    if (message) return res.status(400).json({ message: 'Validation failed', errors: [{ field, location: 'body', message }] });
    req.body[field] = raw.trim();
    next();
  };
};
