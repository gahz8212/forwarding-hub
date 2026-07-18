const { Storage } = require('@google-cloud/storage');
require('dotenv').config();
const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'forwarding-ocr',
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});

const bucketName = process.env.GCS_BUCKET_NAME || 'forwarding-bucket';

async function makePublic() {
  try {
    const bucket = storage.bucket(bucketName);
    
    // For uniform bucket-level access, we need to set IAM policy
    const [policy] = await bucket.iam.getPolicy({requestedPolicyVersion: 3});
    
    policy.bindings.push({
      role: 'roles/storage.objectViewer',
      members: ['allUsers'],
    });

    await bucket.iam.setPolicy(policy);
    console.log(`Bucket ${bucket.name} is now publicly readable.`);
  } catch (err) {
    console.error('ERROR:', err);
  }
}
makePublic();
