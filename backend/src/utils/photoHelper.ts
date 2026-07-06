import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Saves a vehicle photo to the vehicle's folder, naming it vin_1.jpg, vin_2.jpg, etc.,
 * and deduplicating by file hash.
 * Returns the relative URL of the saved file (either new or existing duplicate).
 */
export function saveVehiclePhotoAndDeduplicate(
  buffer: Buffer,
  targetDir: string,
  vin: string,
  shipperName: string,
  year: string,
  month: string
): string {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const newHash = crypto.createHash('md5').update(buffer).digest('hex');

  // Check if a file with the same content (hash) already exists in targetDir
  const existingFiles = fs.readdirSync(targetDir);
  for (const file of existingFiles) {
    const filePath = path.join(targetDir, file);
    if (fs.statSync(filePath).isFile()) {
      try {
        const fileBuffer = fs.readFileSync(filePath);
        const existingHash = crypto.createHash('md5').update(fileBuffer).digest('hex');
        if (newHash === existingHash) {
          console.log(`[DEDUPLICATE] Duplicate found, reusing: ${file}`);
          return `/uploads/${shipperName}/${year}/${month}/${vin}/${file}`;
        }
      } catch (err) {
        console.error(`Error reading existing file for hashing: ${filePath}`, err);
      }
    }
  }

  // Find next index for vin_N.jpg
  let nextIdx = 1;
  while (true) {
    const candidateName = `${vin}_${nextIdx}.jpg`;
    if (!existingFiles.includes(candidateName)) {
      const targetPath = path.join(targetDir, candidateName);
      fs.writeFileSync(targetPath, buffer);
      return `/uploads/${shipperName}/${year}/${month}/${vin}/${candidateName}`;
    }
    nextIdx++;
  }
}
