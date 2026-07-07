const Minio = require('minio');

// MinIO client configuration
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === 'true' || false,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY
});

// Bucket name
const BUCKET_NAME = process.env.MINIO_BUCKET || 'assets';

// Ensure bucket exists on startup
const bucketExists = async () => {
  try {
    const exists = await minioClient.bucketExists(BUCKET_NAME);
    if (!exists) {
      await minioClient.makeBucket(BUCKET_NAME, 'us-east-1');
      console.log(`Bucket '${BUCKET_NAME}' created successfully.`);
    } else {
      console.log(`Bucket '${BUCKET_NAME}' already exists.`);
    }
  } catch (err) {
    console.error('Error checking/creating bucket:', err);
  }
};

bucketExists();

module.exports = { minioClient, BUCKET_NAME };
