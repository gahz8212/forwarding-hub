const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'forwarding-ocr',
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});

const bucketName = process.env.GCS_BUCKET_NAME || 'forwarding-bucket';
const bucket = storage.bucket(bucketName);

async function uploadDirectory(dirPath, gcsPrefix) {
  if (!fs.existsSync(dirPath)) {
    console.log(`Directory ${dirPath} does not exist.`);
    return;
  }
  
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      await uploadDirectory(fullPath, `${gcsPrefix}${file}/`);
    } else {
      const gcsPath = `${gcsPrefix}${file}`;
      console.log(`Uploading ${fullPath} to gs://${bucketName}/${gcsPath}...`);
      await bucket.upload(fullPath, {
        destination: gcsPath,
        resumable: false
      });
      console.log(`Uploaded ${gcsPath}`);
    }
  }
}

async function main() {
  const uploadsDir = path.join(__dirname, 'uploads');
  console.log(`Starting upload from ${uploadsDir}...`);
  await uploadDirectory(uploadsDir, 'uploads/');
  console.log('Upload complete.');
}

main().catch(console.error);
