const vision = require('@google-cloud/vision');
async function test() {
  try {
    const client = new vision.ImageAnnotatorClient();
    console.log("Vision Client Initialized. Testing connection...");
    // Just a basic test to see if credentials exist
    const [result] = await client.documentTextDetection({
      image: { source: { imageUri: 'gs://forwarding-bucket/uploads/shipper/2026/07/KMTC78532170/exterior/shipper_photo_1720000000_xxxxx.jpg' } } // fake image
    });
    console.log("Vision API call returned (if it says file not found, then ADC auth is working!)");
  } catch (err) {
    console.error("Vision API Error:", err.message);
  }
}
test();
