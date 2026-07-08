const validate = (schema) => {
  return (req, res, next) => {
    next();
  };
};

module.exports = { validate };