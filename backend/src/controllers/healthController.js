const db = require('../models');
const redisClient = require('../redisClient');
const { minioClient } = require('../utils/minioClient');

exports.getHealth = async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: { status: 'ok' },
      redis: { status: 'ok' },
      minio: { status: 'ok' }
    }
  };

  // Check database
  try {
    await db.sequelize.authenticate();
  } catch (error) {
    health.status = 'error';
    health.services.database = { status: 'error', error: error.message };
  }

  // Check Redis
  try {
    await redisClient.ping();
  } catch (error) {
    health.status = 'error';
    health.services.redis = { status: 'error', error: error.message };
  }

  // Check MinIO
  try {
    const bucketExists = await minioClient.bucketExists(process.env.MINIO_BUCKET || 'assets');
    if (!bucketExists) {
      throw new Error('Bucket does not exist');
    }
  } catch (error) {
    health.status = 'error';
    health.services.minio = { status: 'error', error: error.message };
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
};

