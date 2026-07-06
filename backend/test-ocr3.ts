import dotenv from 'dotenv';
dotenv.config();

import { analyzeVehiclePhoto } from './src/services/ocrService';
import fs from 'fs';

async function test() {
  const dir = './uploads/김화주/2026/07/KMHN141FBPA042262/';
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file.endsWith('.jpg')) {
      const buffer = fs.readFileSync(dir + file);
      const result = await analyzeVehiclePhoto(buffer);
      if (result.rawText.includes('말소') || result.rawText.includes('등록증')) {
        console.log(`\n=== Found Deregistration Certificate: ${file} ===`);
        console.log(result);
        return;
      }
    }
  }
}
test();
