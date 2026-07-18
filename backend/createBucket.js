const { Storage } = require('@google-cloud/storage');
require('dotenv').config();
const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'forwarding-ocr',
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});

const bucketName = process.env.GCS_BUCKET_NAME || 'forwarding-bucket';

async function createBucket() {
  try {
    const [bucket] = await storage.createBucket(bucketName, {
      location: 'ASIA-NORTHEAST3'
    });
    console.log(`Bucket ${bucket.name} created.`);
    
    // Make it public (if needed)
    await bucket.makePublic();
    console.log(`Bucket ${bucket.name} is now public.`);
  } catch (err) {
    if (err.code === 409) {
      console.log(`Bucket ${bucketName} already exists or is owned by another project.`);
      
      // If it exists but owned by someone else, we need to create a unique one!
      const uniqueName = `forwarding-hub-assets-${Math.floor(Math.random()*10000)}`;
      console.log(`Trying to create unique bucket: ${uniqueName}`);
      const [newBucket] = await storage.createBucket(uniqueName, { location: 'ASIA-NORTHEAST3' });
      await newBucket.makePublic();
      console.log(`Created and made public: ${newBucket.name}`);
      
      // update .env
      const fs = require('fs');
      fs.appendFileSync('.env', `\nGCS_BUCKET_NAME=${uniqueName}\n`);
    } else {
      console.error('ERROR:', err);
    }
  }
}
createBucket();
