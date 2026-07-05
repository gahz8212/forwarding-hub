import { analyzeVehiclePhoto } from './src/services/ocrService';
import fs from 'fs';
import path from 'path';

async function test() {
  const file1 = './uploads/김화주/2026/07/KMHN141FBPA042262/photo_1783163180437_pid86411.jpg';
  const file2 = './uploads/김화주/2026/07/KMHN141FBPA042262/photo_1783163411035_99orqoph.jpg';

  const buffer = fs.readFileSync(file2);
  const result = await analyzeVehiclePhoto(buffer);
  console.log("OCR Result:", result);
}

test();
