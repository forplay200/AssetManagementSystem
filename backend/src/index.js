const express = require('express');const logger = require("./utils/logger");
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');
const db = require('./models');

const authRoutes = require('./routes/auth');
const assetsRoutes = require('./routes/assets');
const healthRoutes = require('./routes/health');
const userRoutes = require('./routes/users');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(helmet());
app.use(express.json());
const rateLimit = require('express-rate-limit');
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10000 });

app.use('/api/auth', apiLimiter, authRoutes);
app.use('/api/assets', apiLimiter, assetsRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/users', apiLimiter, userRoutes);

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Swagger documentation
const swaggerDocument = YAML.load(
  path.join(__dirname, '../swagger.yaml')
);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/', (req, res) => {
  res.json({ message: 'Hello from the backend!' });
});

db.sequelize.sync({ alter: true })
  .then(() => {
    logger.info('Database synced');

    app.listen(port, () => {
      logger.info(`Server running on port ${port}`);
    });
  })
  .catch(err => {
    logger.error('Database sync failed', err);
  });

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`, { stack: err.stack, url: req.originalUrl, method: req.method, ip: req.ip });
  res.status(500).json({ message: "Internal Server Error" });
});


