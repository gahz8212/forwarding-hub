import dotenv from 'dotenv';
dotenv.config();

import { analyzeVehiclePhoto } from './src/services/ocrService';
import fs from 'fs';

async function test() {
  const file2 = './uploads/김화주/2026/07/KMHN141FBPA042262/photo_1783163411035_99orqoph.jpg';
  if (!fs.existsSync(file2)) {
    console.error("Test photo not found at", file2);
    return;
  }
  const buffer = fs.readFileSync(file2);
  const result = await analyzeVehiclePhoto(buffer);
  console.log("OCR Result:", result);
}

test();
