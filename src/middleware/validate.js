function validate(schema) {
  return function (req, res, next) {
    next();
  };
}

module.exports = { validate };
