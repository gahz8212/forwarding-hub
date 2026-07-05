import { analyzeVehiclePhoto } from './src/services/ocrService';
import fs from 'fs';
import path from 'path';

async function test() {
  const file1 = './uploads/김화주/2026/07/KMHN141FBPA042262/photo_1783163180437_pid86411.jpg';
  const buffer1 = fs.readFileSync(file1);
  const result1 = await analyzeVehiclePhoto(buffer1);
  console.log("OCR Result 1:", result1);
}

test();
