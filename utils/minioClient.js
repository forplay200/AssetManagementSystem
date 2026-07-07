'use strict';
const Minio = require('minio');

// MinIO client configuration
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY
});

// Bucket name for assets
const BUCKET_NAME = process.env.MINIO_BUCKET || 'assets';

// Ensure the bucket exists
minioClient.bucketExists(BUCKET_NAME, function(err, exists) {
  if (err) {
    console.error('Error checking bucket existence:', err);
    return;
  }
  if (!exists) {
    minioClient.makeBucket(BUCKET_NAME, function(err) {
      if (err) {
        console.error('Error creating bucket:', err);
        return;
      }
      console.log('Bucket created successfully:', BUCKET_NAME);
    });
  }
});

module.exports = {
  minioClient,
  BUCKET_NAME
};
