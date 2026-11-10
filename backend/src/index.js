const express = require('express');const logger = require("./utils/logger");
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();
require('./services/trialPolicy').jwtSecret();
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');
const db = require('./models');
const { backfillKnownWorkspaceOwnership } = require('./utils/workspaceMigration');
const { up: migrateCanonicalRoles } = require('../migrations/20261007000000-canonicalize-roles');
const { up: migrateModelPackages } = require('../migrations/20261008000000-add-model-packages');

const { up: migrateAssetNames } = require('../migrations/20261013000000-add-asset-display-name');
const { up: migrateVideo } = require('../migrations/20261101000000-add-video-assets');
const { up: migrateAssetGovernance } = require('../migrations/20261104000000-add-asset-governance');
const { up: migrateRecycleBinConstraints } = require('../migrations/20261104010000-add-recycle-bin-constraints');
const { up: migrateFileProvenance } = require('../migrations/20261104020000-add-current-file-provenance');

const authRoutes = require('./routes/auth');
const assetsRoutes = require('./routes/assets');
const healthRoutes = require('./routes/health');
const userRoutes = require('./routes/users');
const teamRoutes = require('./routes/teams');
const commentRoutes = require('./routes/comments');

const app = express();
const proxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 3) throw new Error('Invalid TRUST_PROXY_HOPS');
app.set('trust proxy', proxyHops);
const port = process.env.PORT || 3000;

const origins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
if (require('./services/trialPolicy').enabled() && !origins.length) throw new Error('Configure CORS_ORIGINS for public trial use.');
app.use(cors({ origin: origins.length ? origins : false, exposedHeaders: ['Content-Disposition'] }));
app.use(helmet());
app.use(express.json({ limit: '4mb' }));
const rateLimit = require('express-rate-limit');
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10000 });

app.use('/api/auth', apiLimiter, authRoutes);
app.use('/api/assets', apiLimiter, assetsRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/users', apiLimiter, userRoutes);
app.use('/api/teams', apiLimiter, teamRoutes);
app.use('/api/comments', apiLimiter, commentRoutes);
app.use('/api/notifications', apiLimiter, require('./routes/notifications'));

// Serve uploaded files statically
app.use('/uploads', (req, res, next) => require('./services/assetEditSessions').enabled()
  ? res.status(404).json({ message: 'Use authenticated asset access.' }) : next(), express.static(path.join(__dirname, 'uploads')));

// Swagger documentation
const swaggerDocument = YAML.load(
  path.join(__dirname, '../swagger.yaml')
);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/', (req, res) => {
  res.json({ message: 'Hello from the backend!' });
});

migrateCanonicalRoles(db.sequelize.getQueryInterface())
  .then(() => migrateModelPackages(db.sequelize.getQueryInterface(), db.Sequelize))
  .then(() => migrateAssetNames(db.sequelize.getQueryInterface(), db.Sequelize))
  .then(() => migrateVideo(db.sequelize.getQueryInterface(), db.Sequelize))
  .then(() => migrateAssetGovernance(db.sequelize.getQueryInterface(), db.Sequelize))
  .then(() => migrateRecycleBinConstraints(db.sequelize.getQueryInterface(), db.Sequelize))
  .then(() => migrateFileProvenance(db.sequelize.getQueryInterface(), db.Sequelize))
  .then(() => require('../migrations/20261105000000-add-public-trial').up(db.sequelize.getQueryInterface(), db.Sequelize))
  .then(() => db.sequelize.sync({ alter: process.env.NODE_ENV !== 'production' && !require('./services/trialPolicy').enabled() }))
  .then(async () => {
    const backfilledAssets = await backfillKnownWorkspaceOwnership(db.sequelize);
    logger.info('Database synced');
    require('./services/assetAiJobs').startRecovery();
    require('./services/assetPurgeJobs').startRecovery();
    if (backfilledAssets) logger.info(`Assigned ${backfilledAssets} assets to known workspaces`);

    app.listen(port, () => {
      logger.info(`Server running on port ${port}`);
    });
  })
  .catch(err => {
    logger.error('Database startup failed', err);
  });

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`, { stack: err.stack, url: req.originalUrl, method: req.method, ip: req.ip });
  res.status(500).json({ message: "Internal Server Error" });
});


