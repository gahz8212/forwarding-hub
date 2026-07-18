const fs = require('fs');

let fileController = fs.readFileSync('backend/src/controllers/fileController.ts', 'utf-8');

// Replace duplicate check logic
fileController = fileController.replace(
  `        // uploads/temp/BL번호 및 해당 화주의 영구 저장 폴더(uploads/화주명) 전체를 재귀적으로 돌며 동일 해시 파일이 존재하는지 검증
        const tempRoot = path.join(__dirname, '../../uploads', 'temp');
        const currentTempDir = path.join(tempRoot, safeBlNumber);
        const shipperRoot = path.join(__dirname, '../../uploads', shipperName);
        
        const checkHashRecursively = (dir: string): boolean => {
          if (!fs.existsSync(dir)) return false;
          const items = fs.readdirSync(dir);
          for (const item of items) {
            const fullPath = path.join(dir, item);
            if (fs.statSync(fullPath).isDirectory()) {
              if (checkHashRecursively(fullPath)) return true;
            } else if (fs.statSync(fullPath).isFile()) {
              try {
                const existingBuffer = fs.readFileSync(fullPath);
                const existingMd5 = crypto.createHash('md5').update(existingBuffer).digest('hex');
                if (uploadMd5 === existingMd5) {
                  console.log(\`[DEDUPLICATE GLOBAL] Duplicate found at: \${fullPath}. Skipping.\`);
                  return true;
                }
              } catch (err) {
                // Ignore file read issues for scanning
              }
            }
          }
          return false;
        };

        if (checkHashRecursively(currentTempDir) || checkHashRecursively(shipperRoot)) {
          isDuplicate = true;
        }`,
  `        const uploadMd5Base64 = crypto.createHash('md5').update(optimizedBuffer).digest('base64');
        try {
          const [tempFiles] = await bucket.getFiles({ prefix: \`uploads/temp/\${safeBlNumber}/\` });
          const [shipperFiles] = await bucket.getFiles({ prefix: \`uploads/\${shipperName}/\` });
          for (const file of [...tempFiles, ...shipperFiles]) {
            if (file.metadata?.md5Hash === uploadMd5Base64) {
              console.log(\`[DEDUPLICATE GCS] Duplicate found at: \${file.name}. Skipping.\`);
              isDuplicate = true;
              break;
            }
          }
        } catch (e) {
          console.error('[GCS DEDUPLICATE SCAN] error:', e);
        }`
);

// Replace saving logic in uploadVehiclePhotos
fileController = fileController.replace(
  `        const targetRelativeUrl = \`/uploads/\${shipperName}/\${year}/\${month}/\${safeBlNumber}/\${subFolder}/\${fileName}\`;
        const targetPath = path.join(realFolder, fileName);
        
        fs.writeFileSync(targetPath, optimizedBuffer);

        ocrResult.serverUrl = \`http://localhost:5000\${targetRelativeUrl}\`;`,
  `        const targetRelativeUrl = \`/uploads/\${shipperName}/\${year}/\${month}/\${safeBlNumber}/\${subFolder}/\${fileName}\`;
        const gcsPath = targetRelativeUrl.replace(/^\\//, '');
        await bucket.file(gcsPath).save(optimizedBuffer, { resumable: false, contentType: 'image/jpeg' });
        ocrResult.serverUrl = \`https://storage.googleapis.com/\${bucketName}/\${gcsPath}\`;`
);

// Replace getUrlsFromDir in getUnclassifiedPhotos
fileController = fileController.replace(
  `    const getUrlsFromDir = (dirPath: string, relativeSub: string) => {
      if (!fs.existsSync(dirPath)) return [];
      const files = fs.readdirSync(dirPath).filter(file => file.match(/\\.(jpg|jpeg|png)$/i));
      
      // 파일 크기와 해시가 완전히 동일한 경우 경로 목록에서 자체 중복 제거
      const seenHashes = new Set<string>();
      const uniqueUrls: string[] = [];
      
      for (const file of files) {
        // linked_ 접두사 파일은 이미 차량에 배정 완료된 상태이므로 미분류 사진함에서 숨김
        if (file.startsWith('linked_')) continue;

        // analyzed_ 접두사 파일은 이미 OCR 분석이 완료된 서류이므로 미분류 사진함에서 숨김
        if (file.startsWith('analyzed_')) continue;

        try {
          const filePath = path.join(dirPath, file);
          const fileBuffer = fs.readFileSync(filePath);
          const fileHash = crypto.createHash('md5').update(fileBuffer).digest('hex');
          
          if (!seenHashes.has(fileHash)) {
            seenHashes.add(fileHash);
            uniqueUrls.push(\`http://localhost:5000/uploads/\${shipperName}/\${year}/\${month}/\${safeBlNumber}/\${relativeSub}/\${file}\`);
          }
        } catch (e) {
          uniqueUrls.push(\`http://localhost:5000/uploads/\${shipperName}/\${year}/\${month}/\${safeBlNumber}/\${relativeSub}/\${file}\`);
        }
      }
      return uniqueUrls;
    };

    let exteriorFiles = getUrlsFromDir(exteriorFolder, 'exterior');
    const docsFiles = getUrlsFromDir(docsFolder, 'docs');`,
  `    const getUrlsFromDir = async (relativeSub: string) => {
      const gcsPrefix = \`uploads/\${shipperName}/\${year}/\${month}/\${safeBlNumber}/\${relativeSub}/\`;
      const [files] = await bucket.getFiles({ prefix: gcsPrefix });
      
      const seenHashes = new Set<string>();
      const uniqueUrls: string[] = [];
      
      for (const file of files) {
        const fileName = file.name.split('/').pop() || '';
        if (fileName.startsWith('linked_')) continue;
        if (fileName.startsWith('analyzed_')) continue;
        
        const fileHash = file.metadata?.md5Hash || file.name;
        if (!seenHashes.has(fileHash)) {
          seenHashes.add(fileHash);
          uniqueUrls.push(\`https://storage.googleapis.com/\${bucketName}/\${file.name}\`);
        }
      }
      return uniqueUrls;
    };

    let exteriorFiles = await getUrlsFromDir('exterior');
    const docsFiles = await getUrlsFromDir('docs');`
);

// Replace analyzePendingPhotos logic
fileController = fileController.replace(
  `        const urlObj = new URL(url);
        const relativePath = urlObj.pathname.replace('/uploads/', ''); // e.g. temp/BL번호/docs/photo.jpg
        const absolutePath = path.join(__dirname, '../../uploads', relativePath);
        
        if (!fs.existsSync(absolutePath)) {
          console.error('File not found:', absolutePath);
          continue;
        }

        let buffer = fs.readFileSync(absolutePath);
        const originalPath = path.join(path.dirname(absolutePath), \`original_\${path.basename(absolutePath)}\`);
        
        // OCR 분석용으로는 압축되지 않은 원본 파일을 우선 사용 (한글 폰트 유실 방지)
        if (fs.existsSync(originalPath)) {
          buffer = fs.readFileSync(originalPath);
          // 읽은 후 원본 백업 파일은 삭제 (용량 확보)
          fs.unlinkSync(originalPath);
        }

        const ocrResult: any = await analyzeVehiclePhoto(buffer);`,
  `        const gcsPath = url.replace(\`https://storage.googleapis.com/\${bucketName}/\`, '').replace(\`http://localhost:5000/\`, '');
        const file = bucket.file(gcsPath);
        
        const [exists] = await file.exists();
        if (!exists) {
          console.error('File not found in GCS:', gcsPath);
          continue;
        }
        
        const [buffer] = await file.download();
        const ocrResult: any = await analyzeVehiclePhoto(buffer);`
);

fileController = fileController.replace(
  `        // OCR 분석 완료 후 파일명 앞에 analyzed_ 접두사를 추가하여 미분류 사진함에서 제외
        const tempFileName = path.basename(absolutePath);
        let newRelativeUrl = urlObj.pathname;
        if (!tempFileName.startsWith('analyzed_')) {
          const newFileName = \`analyzed_\${tempFileName}\`;
          const newAbsolutePath = path.join(path.dirname(absolutePath), newFileName);
          try {
            fs.renameSync(absolutePath, newAbsolutePath);
            newRelativeUrl = urlObj.pathname.replace(\`/\${tempFileName}\`, \`/\${newFileName}\`);
          } catch (renameErr) {
            console.error('[analyzePendingPhotos] rename to analyzed_ failed:', renameErr);
          }
        }

        ocrResult.serverUrl = \`http://localhost:5000\${newRelativeUrl}\`;`,
  `        // OCR 분석 완료 후 파일명 앞에 analyzed_ 접두사를 추가하여 미분류 사진함에서 제외
        const tempFileName = gcsPath.split('/').pop() || '';
        let newGcsPath = gcsPath;
        if (!tempFileName.startsWith('analyzed_')) {
          const newFileName = \`analyzed_\${tempFileName}\`;
          const parts = gcsPath.split('/');
          parts.pop();
          newGcsPath = [...parts, newFileName].join('/');
          try {
            await file.move(newGcsPath);
          } catch (renameErr) {
            console.error('[analyzePendingPhotos] rename to analyzed_ failed:', renameErr);
          }
        }

        ocrResult.serverUrl = \`https://storage.googleapis.com/\${bucketName}/\${newGcsPath}\`;`
);

fileController = fileController.replace(
  `        const isDoc = relativePath.includes('/docs/') || ocrResult.type === 'document';
        const isVin = relativePath.includes('/vin/') || ocrResult.type === 'vin';`,
  `        const isDoc = gcsPath.includes('/docs/') || ocrResult.type === 'document';
        const isVin = gcsPath.includes('/vin/') || ocrResult.type === 'vin';`
);

// Check if any http://localhost:5000 remains
if (fileController.includes('http://localhost:5000')) {
  console.log('WARNING: Still found localhost:5000 in fileController!');
}

fs.writeFileSync('backend/src/controllers/fileController.ts', fileController);
console.log('Patch complete.');
