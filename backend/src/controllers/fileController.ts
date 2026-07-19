import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pool from '../config/db';
import ExcelJS from 'exceljs';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
import { Storage } from '@google-cloud/storage';
import { parseExcelToGridData, parsePdfToGridData } from '../services/fileParser';
import { analyzeVehiclePhoto } from '../services/ocrService';
import { decodeVin, VehicleSpecs } from '../services/vinService';
// import { saveVehiclePhotoAndDeduplicate } from '../utils/photoHelper'; // 전체저장 시 사용 (미사용 제거)
// import { getVehicleInfoFromPublicData } from '../services/publicDataService';

// GCS 클라이언트 인스턴스화
const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME || 'forwarding-bucket';
const bucket = storage.bucket(bucketName);

function normalizeBrandName(brand: string | null): string | null {
  if (!brand) return null;
  const upper = brand.trim().toUpperCase();
  if (upper.includes('HYUNDAI') || upper.includes('HMC') || upper.includes('현대')) return '현대';
  if (upper.includes('KIA') || upper.includes('KMC') || upper.includes('기아')) return '기아';
  if (upper.includes('SSANGYONG') || upper.includes('SSANG YONG') || upper.includes('쌍용') || upper.includes('KG MOBILITY') || upper.includes('KGM')) return '쌍용/KGM';
  if (upper.includes('RENAULT') || upper.includes('SAMSUNG') || upper.includes('르노') || upper.includes('삼성')) return '르노코리아';
  if (upper.includes('CHEVROLET') || upper.includes('쉐보레') || upper.includes('DAEWOO') || upper.includes('대우') || upper.includes('GM')) return '쉐보레/GM';
  return brand.trim();
}

// 파일 업로드 및 분석 컨트롤러 (메모리 버퍼 지원 및 디스크 정리 불필요 처리)
export const uploadFile = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '업로드된 파일이 없습니다.' });
    }

    const { originalname, buffer, mimetype } = req.file;
    const ext = path.extname(originalname).toLowerCase();
    let gridData: any[][] = [];

    // 파일 타입 분기 처리
    if (ext === '.xlsx' || ext === '.xls' || mimetype.includes('spreadsheet') || mimetype.includes('excel')) {
      gridData = await parseExcelToGridData(buffer);
    } else if (ext === '.pdf' || mimetype === 'application/pdf') {
      gridData = await parsePdfToGridData(buffer);
    } else {
      return res.status(400).json({ success: false, message: '지원하지 않는 파일 형식입니다. (Excel, PDF만 지원)' });
    }

    // 파일 고유 UUID 생성
    const fileKey = crypto.randomUUID();

    // 데이터베이스 임시 테이블에 저장
    await pool.query(
      'INSERT INTO temp_file_grids (id, file_name, file_type, grid_data) VALUES (?, ?, ?, ?)',
      [fileKey, originalname, ext.replace('.', ''), JSON.stringify(gridData)]
    );

    res.json({
      success: true,
      message: '파일 업로드 및 파싱에 성공했습니다.',
      data: {
        fileKey,
        fileName: originalname,
        rowCount: gridData.length,
        colCount: gridData[0]?.length || 0
      }
    });
  } catch (error: any) {
    console.error('파일 업로드/파싱 에러:', error);
    res.status(500).json({ success: false, message: '파일 파싱 중 에러가 발생했습니다: ' + error.message });
  }
};

// GCS 파일 업로드 컨트롤러
export const uploadFileToGCS = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '업로드할 파일이 존재하지 않습니다.' });
    }

    // 파일명 중복을 피하기 위해 타임스탬프 추가
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const uniqueFileName = `${Date.now()}-${originalName.replace(/\s+/g, '_')}`;
    const blob = bucket.file(`uploads/${uniqueFileName}`);

    // GCS 버킷으로 스트림 쓰기 생성
    const blobStream = blob.createWriteStream({
      resumable: false,
      metadata: {
        contentType: req.file.mimetype,
      },
    });

    blobStream.on('error', (err) => {
      console.error('GCS Upload Error:', err);
      res.status(500).json({ message: '파일 업로드 중 서버 오류가 발생했습니다.' });
    });

    blobStream.on('finish', () => {
      // 업로드 성공 시 공개적으로 접근 가능한 URL 생성
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
      
      // TODO: 데이터베이스(Cloud SQL)에 publicUrl 정보 저장하는 비즈니스 로직 추가

      res.status(200).json({
        message: '파일 업로드가 완료되었습니다.',
        url: publicUrl,
      });
    });

    // 버퍼 데이터를 스트림으로 전송
    blobStream.end(req.file.buffer);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '업로드 처리 중 예외가 발생했습니다.' });
  }
};

// 파일 그리드 데이터 조회 컨트롤러
export const getFileGrid = async (req: Request, res: Response) => {
  const { fileKey } = req.params;

  if (!fileKey) {
    return res.status(400).json({ success: false, message: '파일 키가 누락되었습니다.' });
  }

  try {
    const [rows]: any = await pool.query(
      'SELECT file_name, file_type, grid_data FROM temp_file_grids WHERE id = ?',
      [fileKey]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '존재하지 않거나 만료된 임시 파일입니다.' });
    }

    res.json({
      success: true,
      message: '그리드 데이터를 성공적으로 조회했습니다.',
      data: {
        fileName: rows[0].file_name,
        fileType: rows[0].file_type,
        gridData: rows[0].grid_data // JSON 컬럼이므로 mysql2가 자동으로 객체 파싱해줌
      }
    });
  } catch (error: any) {
    console.error('그리드 데이터 조회 에러:', error);
    res.status(500).json({ success: false, message: '그리드 데이터를 가져오는 중 에러가 발생했습니다.' });
  }
};

// shipper_mappings 테이블 자동 생성 및 초기화
const initShipperMappingsTable = async () => {

  try {
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shipper_mappings (
        shipper_name VARCHAR(100) PRIMARY KEY,
        mapping_json JSON NOT NULL,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ shipper_mappings 테이블 준비 완료');
  } catch (err) {
    console.error('❌ shipper_mappings 테이블 생성 실패:', err);
  }
};
initShipperMappingsTable();

// 화주별 파일 매핑 저장 컨트롤러
export const saveShipperMapping = async (req: Request, res: Response) => {
  const { shipperName, mapping } = req.body;
  if (!shipperName || !mapping) {
    return res.status(400).json({ success: false, message: '화주명과 매핑 정보가 누락되었습니다.' });
  }
  try {
    await pool.query(
      'INSERT INTO shipper_mappings (shipper_name, mapping_json) VALUES (?, ?) ON DUPLICATE KEY UPDATE mapping_json = ?, last_updated = CURRENT_TIMESTAMP',
      [shipperName, JSON.stringify(mapping), JSON.stringify(mapping)]
    );
    res.json({ success: true, message: '화주별 매핑 설정이 저장되었습니다.' });
  } catch (err: any) {
    console.error('매핑 저장 에러:', err);
    res.status(500).json({ success: false, message: '매핑 저장 중 오류 발생: ' + err.message });
  }
};

// 화주별 파일 매핑 조회 컨트롤러
export const getShipperMapping = async (req: Request, res: Response) => {
  const { shipperName } = req.params;
  if (!shipperName) {
    return res.status(400).json({ success: false, message: '화주명이 누락되었습니다.' });
  }
  try {
    const [rows]: any = await pool.query(
      'SELECT mapping_json FROM shipper_mappings WHERE shipper_name = ?',
      [shipperName]
    );
    if (rows.length === 0) {
      return res.json({ success: true, exists: false, data: null });
    }
    res.json({ success: true, exists: true, data: rows[0].mapping_json });
  } catch (err: any) {
    console.error('매핑 조회 에러:', err);
    res.status(500).json({ success: false, message: '매핑 조회 중 오류 발생: ' + err.message });
  }
};

// 관세 신고용 엑셀 변환/다운로드 컨트롤러
export const exportCustomsExcel = async (req: Request, res: Response) => {
  const { verifierFileName, extractedRows } = req.body;
  if (!verifierFileName || !extractedRows) {
    return res.status(400).json({ success: false, message: '파일명 또는 데이터가 누락되었습니다.' });
  }

  const EXTRACTION_KEYS_MAP: Record<string, string> = {
    vin: "차대번호",
    make: "제조사",
    model: "모델명",
    year: "연식",
    weight: "중량",
    cbm: "CBM",
    drivability: "구동상태",
    deregistration_no: "말소증번호"
  };

  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Customs Declaration');

    // 1. 타이틀
    sheet.mergeCells('A1:G1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = '관세 신고용 검증 데이터';
    titleCell.font = { name: 'Malgun Gothic', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' } // Navy blue
    };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).height = 40;

    const labelStyle = {
      font: { name: 'Malgun Gothic', size: 10, bold: true, color: { argb: 'FF333333' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }, // Gray-200
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      }
    };
    
    const valueStyle = {
      font: { name: 'Malgun Gothic', size: 10 },
      alignment: { vertical: 'middle', horizontal: 'left' },
      border: {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      }
    };

    // 2. 스칼라 데이터 (단일 필드) - items와 _rowIndex를 제외한 모든 루트 키를 스칼라 필드로 취급
    const scalarKeys = Object.keys(extractedRows).filter(k => k !== 'items' && k !== '_rowIndex');
    let nextSectionRow = 3;

    if (scalarKeys.length > 0) {
      sheet.getCell('A3').value = '[ 단일 데이터 필드 (스칼라) ]';
      sheet.getCell('A3').font = { name: 'Malgun Gothic', size: 11, bold: true };

      let currentScalarRowIdx = 4;
      sheet.getRow(currentScalarRowIdx).height = 25;

      scalarKeys.forEach((keyId, i) => {
        const colGroupIdx = i % 3; // 한 행에 최대 3개 배치 (A-B, C-D, E-F)
        if (i > 0 && colGroupIdx === 0) {
          currentScalarRowIdx++;
          sheet.getRow(currentScalarRowIdx).height = 25;
        }

        const colIdx = colGroupIdx * 2 + 1; // Col A (1), C (3), E (5)
        const label = EXTRACTION_KEYS_MAP[keyId] || keyId;
        const val = extractedRows[keyId] || '-';

        const labelCell = sheet.getCell(currentScalarRowIdx, colIdx);
        labelCell.value = label;
        Object.assign(labelCell, labelStyle);

        const valCell = sheet.getCell(currentScalarRowIdx, colIdx + 1);
        valCell.value = val;
        Object.assign(valCell, valueStyle);
      });

      nextSectionRow = currentScalarRowIdx + 2; // 스칼라 영역 종료 후 2줄 띔
    }

    // 3. 품목 테이블 데이터
    sheet.getCell(nextSectionRow, 1).value = '[ 품목 테이블 데이터 ]';
    sheet.getCell(nextSectionRow, 1).font = { name: 'Malgun Gothic', size: 11, bold: true };

    const headers = [
      { header: '원본 행', key: '_rowIndex', width: 10 },
      { header: '차대번호 (VIN)', key: 'vin', width: 25 },
      { header: '제조사 (Make)', key: 'make', width: 15 },
      { header: '모델명 (Model)', key: 'model', width: 20 },
      { header: '연식 (Year)', key: 'year', width: 10 },
      { header: '중량 (Weight)', key: 'weight', width: 12 },
      { header: '부피 (CBM)', key: 'cbm', width: 12 },
      { header: '구동상태', key: 'drivability', width: 15 },
      { header: '말소등록번호', key: 'deregistration_no', width: 20 }
    ];

    const headerRowIdx = nextSectionRow + 1;
    const headerRow = sheet.getRow(headerRowIdx);
    headerRow.height = 25;

    headers.forEach((h, colIdx) => {
      const cell = sheet.getCell(headerRowIdx, colIdx + 1);
      cell.value = h.header;
      cell.font = { name: 'Malgun Gothic', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF3B82F6' } // Blue-500
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF1E40AF' } },
        left: { style: 'thin', color: { argb: 'FF1E40AF' } },
        bottom: { style: 'thin', color: { argb: 'FF1E40AF' } },
        right: { style: 'thin', color: { argb: 'FF1E40AF' } }
      };
    });

    const items = extractedRows.items || [];
    items.forEach((item: any, rowIdx: number) => {
      const currentRawIdx = headerRowIdx + 1 + rowIdx;
      const row = sheet.getRow(currentRawIdx);
      row.height = 20;

      headers.forEach((h, colIdx) => {
        const cell = sheet.getCell(currentRawIdx, colIdx + 1);
        let val = item[h.key];
        
        // 데이터 포맷 설정
        if (h.key === 'weight' || h.key === 'cbm' || h.key === 'year') {
          const num = Number(val);
          if (!isNaN(num)) {
            cell.value = num;
            cell.numFmt = h.key === 'year' ? '0' : '#,##0.00';
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          } else {
            cell.value = val || '';
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          }
        } else {
          cell.value = val || '';
          cell.alignment = { vertical: 'middle', horizontal: h.key === '_rowIndex' || h.key === 'drivability' || h.key === 'year' ? 'center' : 'left' };
        }

        cell.font = { name: 'Malgun Gothic', size: 9 };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
      });
    });

    // Auto-fit columns
    sheet.columns.forEach((column, i) => {
      if (headers[i]) {
        column.width = headers[i].width;
      }
    });

    // Set Response Headers for download
    const finalFileName = '관세사용_' + verifierFileName;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(finalFileName)}`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error('엑셀 수출 에러:', err);
    res.status(500).json({ success: false, message: '엑셀 파일 생성 중 오류 발생: ' + err.message });
  }
};

// 중고차량 사진 멀티 업로드 및 OCR 자동 분류 컨트롤러
export const uploadVehiclePhotos = async (req: Request, res: Response) => {
  try {
    const { shipmentId, skipOcr, blNumber, photoType } = req.body;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, message: '업로드된 사진(또는 ZIP 파일)이 없습니다.' });
    }
    if (!shipmentId) {
      return res.status(400).json({ success: false, message: 'Shipment ID가 필요합니다.' });
    }

    const processedResults = [];
    const imageQueue: { originalname: string; buffer: Buffer; rawBuffer?: Buffer }[] = [];
    const batchHashes = new Set<string>();

    // 선적 정보 및 화주명 조회 (shipmentId가 BL 번호인 경우도 대응)
    const [shipments]: any = await pool.query(
      'SELECT id, shipper, etd FROM shipments WHERE id = ? OR bl_number = ?',
      [shipmentId, blNumber || shipmentId]
    );
    const dbShipment = shipments[0];
    const resolvedShipmentId = dbShipment ? dbShipment.id : shipmentId;
    const rawShipperName = dbShipment && dbShipment.shipper ? dbShipment.shipper : '일반화주';
    const shipperName = rawShipperName.replace(/[^a-zA-Z0-9가-힣\s_-]/g, '').trim() || '일반화주';

    const uploadDate = dbShipment && dbShipment.etd ? new Date(dbShipment.etd) : new Date();
    const year = uploadDate.getFullYear().toString();
    const month = String(uploadDate.getMonth() + 1).padStart(2, '0');

    const safeBlNumber = blNumber ? String(blNumber).replace(/[^a-zA-Z0-9_-]/g, '_') : 'unknown_bl';
    
    // photoType에 따라 docs 또는 exterior 하위 폴더에 저장
    const subFolder = photoType === 'docs' ? 'docs' : 'exterior';
    // 정규 폴더 경로 생성 (uploads/화주명/연/월/BL/하위폴더)
    const realFolder = path.join(__dirname, '../../uploads', shipperName, year, month, safeBlNumber, subFolder);
    if (!fs.existsSync(realFolder)) {
      fs.mkdirSync(realFolder, { recursive: true });
    }

    // 1. 업로드된 파일들을 확인하여 ZIP 파일이면 압축 해제, 일반 이미지면 큐에 추가 (배치 내 중복 차단용 MD5 체크 병행)
    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();
      
      if (ext === '.zip' || file.mimetype === 'application/zip') {
        const zip = new AdmZip(file.buffer);
        const zipEntries = zip.getEntries();
        
        for (const entry of zipEntries) {
          if (!entry.isDirectory && entry.entryName.match(/\.(jpg|jpeg|png)$/i)) {
            if (entry.entryName.includes('__MACOSX') || entry.name.startsWith('.')) continue;
            try {
              const rawBuffer = entry.getData();
              const optimizedBuffer = await sharp(rawBuffer)
                .resize({ width: 1920, withoutEnlargement: true })
                .jpeg({ quality: 80 })
                .toBuffer();

              const fileHash = crypto.createHash('md5').update(optimizedBuffer).digest('hex');
              if (batchHashes.has(fileHash)) {
                console.log(`[BATCH DEDUPLICATE ZIP] Skip same file in ZIP batch: ${entry.name}`);
                continue;
              }
              batchHashes.add(fileHash);
              imageQueue.push({
                originalname: entry.name,
                buffer: optimizedBuffer,
                rawBuffer: rawBuffer
              });
            } catch (err) {
              console.error(`ZIP entry processing error: ${entry.name}`, err);
            }
          }
        }
      } else if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
        try {
          const rawBuffer = file.buffer;
          const optimizedBuffer = await sharp(rawBuffer)
            .resize({ width: 1920, withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();

          const fileHash = crypto.createHash('md5').update(optimizedBuffer).digest('hex');
          if (batchHashes.has(fileHash)) {
            console.log(`[BATCH DEDUPLICATE IMG] Skip same file in upload batch: ${file.originalname}`);
            continue;
          }
          batchHashes.add(fileHash);
          imageQueue.push({
            originalname: file.originalname,
            buffer: optimizedBuffer,
            rawBuffer: rawBuffer
          });
        } catch (err) {
          console.error(`Image upload processing error: ${file.originalname}`, err);
        }
      }
    }

    if (imageQueue.length === 0) {
      return res.status(400).json({ success: false, message: '처리할 이미지 파일이 없습니다.' });
    }

    // 2. 추출된 이미지들을 순회하며 sharp 압축 및 OCR 분석 진행
    for (const image of imageQueue) {
      try {
        const optimizedBuffer = image.buffer;

        let ocrResult: any = { rawText: '', plateNumber: null, vin: null, type: 'unknown' };
        
        if (skipOcr !== 'true' && image.rawBuffer) {
          // OCR 분석 시에는 압축되지 않은 원본 버퍼(image.rawBuffer)를 그대로 사용합니다.
          ocrResult = await analyzeVehiclePhoto(image.rawBuffer);
        }

        // 2차 검증: Sharp 압축이 완료된 최종 버퍼(optimizedBuffer) 기준으로 중복 체크
        const uploadMd5 = crypto.createHash('md5').update(optimizedBuffer).digest('hex');
        let isDuplicate = false;
        
        const uploadMd5Base64 = crypto.createHash('md5').update(optimizedBuffer).digest('base64');
        try {
          const [tempFiles] = await bucket.getFiles({ prefix: `uploads/temp/${safeBlNumber}/` });
          const [shipperFiles] = await bucket.getFiles({ prefix: `uploads/${shipperName}/` });
          for (const file of [...tempFiles, ...shipperFiles]) {
            if (file.metadata?.md5Hash === uploadMd5Base64) {
              console.log(`[DEDUPLICATE GCS] Duplicate found at: ${file.name}. Skipping.`);
              isDuplicate = true;
              break;
            }
          }
        } catch (e) {
          console.error('[GCS DEDUPLICATE SCAN] error:', e);
        }

        if (isDuplicate) {
          // 중복 파일은 기록만 남기고 저장/분석 루프에서 스킵
          processedResults.push({
            fileName: image.originalname,
            status: 'duplicate',
            reason: '이미 업로드된 동일 파일이 존재합니다.'
          });
          continue;
        }

        // 업로드 주체에 따라 파일명에 접두사 추가
        const isForwarderUpload = req.body.isForwarder === 'true' || req.body.isForwarder === true;
        const prefix = isForwarderUpload ? 'forwarder' : 'shipper';
        const randomString = Math.random().toString(36).substring(2, 10);
        const fileName = `${prefix}_photo_${Date.now()}_${randomString}.jpg`;
        const subFolder = photoType === 'docs' ? 'docs' : 'exterior';
        const targetRelativeUrl = `/uploads/${shipperName}/${year}/${month}/${safeBlNumber}/${subFolder}/${fileName}`;
        const gcsPath = targetRelativeUrl.replace(/^\//, '');
        await bucket.file(gcsPath).save(optimizedBuffer, { resumable: false, contentType: 'image/jpeg' });
        // 화주가 업로드하여 나중에 분석해야 할 때(skipOcr === 'true')만 원본 백업 파일을 저장합니다.
        if (image.rawBuffer && photoType === 'docs' && skipOcr === 'true') {
          const originalGcsPath = gcsPath.replace(fileName, `original_${fileName}`);
          await bucket.file(originalGcsPath).save(image.rawBuffer, { resumable: false, contentType: 'image/jpeg' });
        }
        ocrResult.serverUrl = `https://storage.googleapis.com/${bucketName}/${gcsPath}`;

        // 3. 사진 타입이 확인된 경우 DB에 매핑 및 파일 물리적 이동
        
        // [공공데이터 연동] 제거: 말소증 OCR 데이터 자체 추출로 선회
        // if (ocrResult.plateNumber && !ocrResult.vin) {
        //   const publicInfo = await getVehicleInfoFromPublicData(ocrResult.plateNumber);
        //   if (publicInfo && publicInfo.vin) { ... }
        // }

        // 타 선적에 이미 등록된 차대번호인지 글로벌 중복 검증 (DB 조회)
        if (ocrResult.vin && ocrResult.vin !== 'UNKNOWN_VIN') {
          const [globalExisting]: any = await pool.query(
            'SELECT id, shipment_id FROM vehicles WHERE vin = ? AND shipment_id != ?',
            [ocrResult.vin, resolvedShipmentId]
          );

          if (globalExisting.length > 0) {
            console.log(`[DEDUPLICATE VIN] VIN ${ocrResult.vin} already exists in another shipment (ID: ${globalExisting[0].shipment_id}). Skipping.`);
            processedResults.push({
              fileName: image.originalname,
              status: 'duplicate',
              reason: `이미 다른 선적에 등록된 차대번호(${ocrResult.vin})입니다.`
            });
            continue;
          }
        }

        if (ocrResult.vin || ocrResult.plateNumber) {
          const [existing]: any = await pool.query(
            'SELECT id, vin FROM vehicles WHERE shipment_id = ? AND (vin = ? OR deregistration_no = ?)',
            [resolvedShipmentId, ocrResult.vin || 'NULL', ocrResult.plateNumber || 'NULL']
          );

          let finalVin = ocrResult.vin;
          let updateId = null;

          if (existing.length > 0) {
            updateId = existing[0].id;
            finalVin = existing[0].vin || ocrResult.vin;
          }

          if (!finalVin) finalVin = 'UNKNOWN_VIN';
          ocrResult.vin = finalVin;

          const isDoc = ocrResult.type === 'document' || photoType === 'docs';
          const isVin = ocrResult.type === 'vin' || photoType === 'vin';
          const targetColumn = isDoc 
            ? 'deregistration_photo_url' 
            : isVin 
              ? 'vin_photo_url' 
              : 'condition_photo_url';

          if (existing.length > 0) {
            const [currVeh]: any = await pool.query(
              'SELECT condition_photo_url, deregistration_photo_url, vin_photo_url FROM vehicles WHERE id = ?',
              [updateId]
            );
            const parsePhotos = (fieldVal: string | null) => {
              if (!fieldVal) return [];
              try { return JSON.parse(fieldVal); } catch (e) { return [fieldVal]; }
            };

            const updates: string[] = [];
            const params: any[] = [];
            if (ocrResult.plateNumber) { updates.push('deregistration_no = ?'); params.push(ocrResult.plateNumber); }

            if (updates.length > 0) {
              params.push(updateId);
              await pool.query(`UPDATE vehicles SET ${updates.join(', ')} WHERE id = ?`, params);
            }
            
            // Append photo URL to the corresponding column
            const [currVehForUpdate]: any = await pool.query(`SELECT ${targetColumn} FROM vehicles WHERE id = ?`, [updateId]);
            let photos: string[] = [];
            if (currVehForUpdate[0]?.[targetColumn]) {
              try { photos = JSON.parse(currVehForUpdate[0][targetColumn]); } catch (e) { photos = [currVehForUpdate[0][targetColumn]]; }
            }
            if (!photos.includes(targetRelativeUrl)) photos.push(targetRelativeUrl);
            await pool.query(`UPDATE vehicles SET ${targetColumn} = ? WHERE id = ?`, [JSON.stringify(photos), updateId]);

            (ocrResult as any).id = updateId;
            
            // 기존 차량에 제원이 없으면 VIN으로 채워넣기
            const [existingSpecs]: any = await pool.query('SELECT make, model FROM vehicles WHERE id = ?', [updateId]);
            if (finalVin && finalVin.length === 17 && (!existingSpecs[0]?.make || !existingSpecs[0]?.model)) {
              try {
                const specs = await decodeVin(finalVin);
                if (specs) {
                  await pool.query(
                    'UPDATE vehicles SET make=?, model=?, year=? WHERE id=?',
                    [specs.make, specs.model, specs.year, updateId]
                  );
                  (ocrResult as any).make = specs.make;
                  (ocrResult as any).model = specs.model;
                  (ocrResult as any).year = specs.year;
                }
              } catch (e) { console.error('[decodeVin] specs update error:', e); }
            }
          } else {
            // 신규 차량 INSERT + 제원 동시 저장
            let specs: VehicleSpecs | null = null;
            if (finalVin && finalVin.length === 17 && finalVin !== 'UNKNOWN_VIN') {
              try { specs = await decodeVin(finalVin); } catch (e) { console.error('[decodeVin] insert error:', e); }
            }
            const [insertResult]: any = await pool.query(
              `INSERT INTO vehicles (
                shipment_id, vin, deregistration_no, plate_number, status, 
                condition_photo_url, deregistration_photo_url, vin_photo_url, 
                drivability, make, model, year
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                resolvedShipmentId,
                ocrResult.vin,
                ocrResult.plateNumber || null,
                ocrResult.plateNumber || null,
                'Pending',
                (!isDoc && !isVin) ? JSON.stringify([targetRelativeUrl]) : null,
                isDoc ? JSON.stringify([targetRelativeUrl]) : null,
                isVin ? JSON.stringify([targetRelativeUrl]) : null,
                null,
                specs?.make || null,
                specs?.model || null,
                specs?.year || null
              ]
            );
            (ocrResult as any).id = insertResult.insertId;
            if (specs) {
              (ocrResult as any).make = specs.make;
              (ocrResult as any).model = specs.model;
              (ocrResult as any).year = specs.year;
            }
          }
        } else {
          const reasonMsg = ocrResult.apiError 
            ? `OCR API 에러 발생: ${ocrResult.apiError}`
            : '차대번호 또는 차량번호를 식별하지 못했습니다.';
            
          processedResults.push({
            fileName: image.originalname,
            status: 'manual_review',
            reason: reasonMsg,
            extracted: ocrResult
          });
          continue;
        }

        processedResults.push({
          fileName: image.originalname,
          status: 'success',
          extracted: ocrResult
        });
      } catch (imgError) {
        console.error(`${image.originalname} 처리 실패:`, imgError);
        processedResults.push({
          fileName: image.originalname,
          status: 'error',
          reason: '이미지 압축 또는 OCR 처리 중 오류 발생'
        });
      }
    }

    // memoryStorage 사용 중이므로 디스크에 임시 파일이 없어 별도 삭제 불필요

    // Socket.io 이벤트 발송 (화주가 새로운 파일을 정상적으로 올렸을 경우에만 포워더 알림 발송 - 중복/에러는 무시)
    const io = req.app.get('io');
    const isForwarder = req.body.isForwarder === 'true' || req.body.isForwarder === true;
    const savedCount = processedResults.filter((r: any) => r.status !== 'duplicate' && r.status !== 'error').length;

    if (io && !isForwarder && savedCount > 0) {
      io.to('admin').emit('new_shipper_docs_alert', {
        shipmentId: resolvedShipmentId,
        blNumber: blNumber,
        count: savedCount,
        photoType: photoType || 'exterior',
        shipperName: shipperName
      });
    }

    res.json({
      success: true,
      message: 'ZIP 파일 압축 해제, 이미지 최적화 및 처리가 완료되었습니다.',
      data: processedResults
    });

  } catch (error: any) {
    console.error('차량 사진/ZIP 업로드 에러:', error);
    res.status(500).json({ success: false, message: '파일 처리 중 오류가 발생했습니다.' });
  }
};

export const getUnclassifiedPhotos = async (req: Request, res: Response) => {
  try {
    const { blNumber } = req.params;
    if (!blNumber) {
      return res.status(400).json({ success: false, message: 'BL 번호가 누락되었습니다.' });
    }

    // 선적 정보 및 화주명 조회하여 정규 디렉토리 경로 구성
    const [shipments]: any = await pool.query(
      'SELECT id, shipper, etd FROM shipments WHERE bl_number = ?',
      [blNumber]
    );

    if (shipments.length === 0) {
      return res.json({ success: true, data: { exterior: [], docs: [] } });
    }

    const dbShipment = shipments[0];
    const rawShipperName = dbShipment.shipper || '일반화주';
    const shipperName = rawShipperName.replace(/[^a-zA-Z0-9가-힣\s_-]/g, '').trim() || '일반화주';
    const uploadDate = dbShipment.etd ? new Date(dbShipment.etd) : new Date();
    const year = uploadDate.getFullYear().toString();
    const month = String(uploadDate.getMonth() + 1).padStart(2, '0');
    const safeBlNumber = String(blNumber).replace(/[^a-zA-Z0-9_-]/g, '_');

    // 정규 저장 경로
    const realFolder = path.join(__dirname, '../../uploads', shipperName, year, month, safeBlNumber);
    const exteriorFolder = path.join(realFolder, 'exterior');
    const docsFolder = path.join(realFolder, 'docs');

    const getUrlsFromDir = async (relativeSub: string) => {
      const gcsPrefix = `uploads/${shipperName}/${year}/${month}/${safeBlNumber}/${relativeSub}/`;
      const [files] = await bucket.getFiles({ prefix: gcsPrefix });
      
      const seenHashes = new Set<string>();
      const uniqueUrls: string[] = [];
      
      for (const file of files) {
        const fileName = file.name.split('/').pop() || '';
        if (fileName.startsWith('linked_')) continue;
        if (fileName.startsWith('analyzed_')) continue;
        if (fileName.startsWith('original_')) continue;
        
        const fileHash = file.metadata?.md5Hash || file.name;
        if (!seenHashes.has(fileHash)) {
          seenHashes.add(fileHash);
          uniqueUrls.push(`https://storage.googleapis.com/${bucketName}/${file.name}`);
        }
      }
      return uniqueUrls;
    };

    let exteriorFiles = await getUrlsFromDir('exterior');
    const docsFiles = await getUrlsFromDir('docs');

    return res.json({
      success: true,
      data: {
        exterior: Array.from(new Set(exteriorFiles)),
        docs: Array.from(new Set(docsFiles))
      }
    });
  } catch (error: any) {
    console.error('미분류 사진 조회 에러:', error);
    return res.status(500).json({ success: false, message: '미분류 사진 목록을 가져오는 중 오류가 발생했습니다.' });
  }
};

// 포워더가 선택한 대기 사진들에 대해 OCR 분석 수행 후 DB 저장 (파일은 temp 폴더에 그대로 유지)
export const analyzePendingPhotos = async (req: Request, res: Response) => {
  try {
    const { photoUrls, shipmentId, blNumber } = req.body;
    if (!photoUrls || !Array.isArray(photoUrls) || photoUrls.length === 0) {
      return res.status(400).json({ success: false, message: 'photoUrls 배열이 필요합니다.' });
    }
    if (!shipmentId) {
      return res.status(400).json({ success: false, message: 'shipmentId가 필요합니다.' });
    }

    let newVehiclesCount = 0;
    const processedResults = [];

    for (const url of photoUrls) {
      try {
        const gcsPath = url.replace(`https://storage.googleapis.com/${bucketName}/`, '').replace(`http://localhost:5000/`, '');
        const file = bucket.file(gcsPath);
        
        const [exists] = await file.exists();
        if (!exists) {
          console.error('File not found in GCS:', gcsPath);
          continue;
        }
        
        let buffer;
        const originalFileName = `original_${gcsPath.split('/').pop()}`;
        const partsOrig = gcsPath.split('/');
        partsOrig.pop();
        const originalGcsPath = [...partsOrig, originalFileName].join('/');
        const originalFile = bucket.file(originalGcsPath);
        
        const [originalExists] = await originalFile.exists();
        if (originalExists) {
          [buffer] = await originalFile.download();
          // 읽은 후 원본 백업 파일은 삭제 (용량 확보)
          await originalFile.delete().catch(() => {});
        } else {
          [buffer] = await file.download();
        }

        const ocrResult: any = await analyzeVehiclePhoto(buffer);

        // OCR 식별 여부와 상관없이 일단 차대번호가 없다면 UNKNOWN_VIN으로 규정하고 차량 등록을 보장
        const hasIdInfo = ocrResult.vin || ocrResult.plateNumber;
        let finalVin = ocrResult.vin;
        let updateId = null;

        if (hasIdInfo) {
          const [existing]: any = await pool.query(
            'SELECT id, vin FROM vehicles WHERE shipment_id = ? AND (vin = ? OR deregistration_no = ?)',
            [shipmentId, ocrResult.vin || 'NULL', ocrResult.plateNumber || 'NULL']
          );
          if (existing.length > 0) {
            updateId = existing[0].id;
            finalVin = existing[0].vin || ocrResult.vin;
          }
        }

        if (!finalVin) finalVin = 'UNKNOWN_VIN';
        ocrResult.vin = finalVin;

        // OCR 분석 완료 후 파일명 앞에 analyzed_ 접두사를 추가하여 미분류 사진함에서 제외
        const tempFileName = gcsPath.split('/').pop() || '';
        let newGcsPath = gcsPath;
        if (!tempFileName.startsWith('analyzed_')) {
          const newFileName = `analyzed_${tempFileName}`;
          const parts = gcsPath.split('/');
          parts.pop();
          newGcsPath = [...parts, newFileName].join('/');
          try {
            await file.move(newGcsPath);
          } catch (renameErr) {
            console.error('[analyzePendingPhotos] rename to analyzed_ failed:', renameErr);
          }
        }

        ocrResult.serverUrl = `https://storage.googleapis.com/${bucketName}/${newGcsPath}`;

        let decodedSpecs: any = null;
        if (finalVin && finalVin.length === 17 && finalVin !== 'UNKNOWN_VIN') {
          try {
            decodedSpecs = await decodeVin(finalVin);
          } catch (decodeErr) {
            console.error('[decodeVin Err] Failed to decode specs in pending docs analyzer:', decodeErr);
          }
        }

        const isDoc = gcsPath.includes('/docs/') || ocrResult.type === 'document';
        const isVin = gcsPath.includes('/vin/') || ocrResult.type === 'vin';
        const targetColumn = isDoc 
          ? 'deregistration_photo_url' 
          : isVin 
            ? 'vin_photo_url' 
            : 'condition_photo_url';

        if (updateId) {
          const [currVeh]: any = await pool.query(`SELECT ${targetColumn} FROM vehicles WHERE id = ?`, [updateId]);
          const parsePhotos = (fieldVal: string | null) => {
            if (!fieldVal) return [];
            try { return JSON.parse(fieldVal); } catch (e) { return [fieldVal]; }
          };
          
          const updates: string[] = [];
          const params: any[] = [];
          
          if (ocrResult.plateNumber) {
            updates.push('deregistration_no = ?');
            params.push(ocrResult.plateNumber);
          }
          if (decodedSpecs) {
            updates.push('make = ?, model = ?, year = ?, length = ?, width = ?, height = ?, weight = ?, cbm = ?, initial_registration_date = ?');
            params.push(
              decodedSpecs.make || null,
              decodedSpecs.modelName || null,
              decodedSpecs.year || null,
              decodedSpecs.dimensions?.length || null,
              decodedSpecs.dimensions?.width || null,
              decodedSpecs.dimensions?.height || null,
              decodedSpecs.weight || null,
              decodedSpecs.cbm || null,
              decodedSpecs.initialRegistrationDate || null
            );
          }

          if (updates.length > 0) {
            params.push(updateId);
            await pool.query(`UPDATE vehicles SET ${updates.join(', ')} WHERE id = ?`, params);
          }
          
          const photos = parsePhotos(currVeh[0]?.[targetColumn]);
          if (!photos.includes("/" + newGcsPath)) photos.push("/" + newGcsPath);
          await pool.query(`UPDATE vehicles SET ${targetColumn} = ? WHERE id = ?`, [JSON.stringify(photos), updateId]);
        } else {
           newVehiclesCount++;
           await pool.query(
             `INSERT INTO vehicles (
                shipment_id, vin, deregistration_no, plate_number, status, 
                condition_photo_url, deregistration_photo_url, vin_photo_url, drivability,
                make, model, year, length, width, height, weight, cbm, initial_registration_date
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
             [
               shipmentId,
               finalVin,
               ocrResult.plateNumber || null,
               ocrResult.plateNumber || null,
               'Pending',
               (!isDoc && !isVin) ? JSON.stringify(["/" + newGcsPath]) : null,
               isDoc ? JSON.stringify(["/" + newGcsPath]) : null,
               isVin ? JSON.stringify(["/" + newGcsPath]) : null,
               null,
               decodedSpecs?.make || null,
               decodedSpecs?.modelName || null,
               decodedSpecs?.year || null,
               decodedSpecs?.dimensions?.length || null,
               decodedSpecs?.dimensions?.width || null,
               decodedSpecs?.dimensions?.height || null,
               decodedSpecs?.weight || null,
               decodedSpecs?.cbm || null,
               decodedSpecs?.initialRegistrationDate || null
             ]
           );
        }
        
        processedResults.push({ fileName: tempFileName, status: 'success', extracted: ocrResult });
      } catch (err) {
        console.error('Error processing pending photo:', url, err);
      }
    }
    
    // 분석 완료 후, 프론트엔드 실시간 갱신을 위해 Socket.io 갱신 이벤트 전송
    const io = req.app.get('io');
    if (io) {
      io.to('admin').emit('refresh_vehicle_list', {
        shipmentId,
        blNumber
      });
    }
    
    return res.json({ success: true, data: { newVehiclesCount, processedResults } });
  } catch (error) {
    console.error('대기 사진 분석 에러:', error);
    return res.status(500).json({ success: false, message: '대기 사진 분석 중 오류가 발생했습니다.' });
  }
};

// 파일 다운로드 핸들러 (한글 파일명 및 브라우저 다운로드 호환성 해결)
export const downloadFile = async (req: Request, res: Response) => {
  const filePath = req.query.path as string;
  const friendlyName = req.query.name as string;

  if (!filePath) {
    return res.status(400).json({ success: false, message: '파일 경로가 필요합니다.' });
  }

  if (!filePath.startsWith('/uploads')) {
    return res.status(403).json({ success: false, message: '허용되지 않는 파일 접근입니다.' });
  }

  // GCP GCS 퍼블릭 URL로 리다이렉트
  const gcsPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
  const publicUrl = `https://storage.googleapis.com/${bucketName}/${gcsPath}`;
  
  res.redirect(publicUrl);
};
