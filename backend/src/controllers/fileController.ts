import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pool from '../config/db';
import ExcelJS from 'exceljs';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
import { parseExcelToGridData, parsePdfToGridData } from '../services/fileParser';
import { analyzeVehiclePhoto } from '../services/ocrService';
import { decodeVin } from '../services/vinService';

// 파일 업로드 및 분석 컨트롤러
export const uploadFile = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '업로드된 파일이 없습니다.' });
    }

    const { originalname, path: filePath, mimetype } = req.file;
    const ext = path.extname(originalname).toLowerCase();
    let gridData: any[][] = [];

    // 파일 타입 분기 처리
    if (ext === '.xlsx' || ext === '.xls' || mimetype.includes('spreadsheet') || mimetype.includes('excel')) {
      gridData = await parseExcelToGridData(filePath);
    } else if (ext === '.pdf' || mimetype === 'application/pdf') {
      gridData = await parsePdfToGridData(filePath);
    } else {
      // 업로드 임시 파일 삭제
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.status(400).json({ success: false, message: '지원하지 않는 파일 형식입니다. (Excel, PDF만 지원)' });
    }

    // 파일 고유 UUID 생성
    const fileKey = crypto.randomUUID();

    // 데이터베이스 임시 테이블에 저장
    await pool.query(
      'INSERT INTO temp_file_grids (id, file_name, file_type, grid_data) VALUES (?, ?, ?, ?)',
      [fileKey, originalname, ext.replace('.', ''), JSON.stringify(gridData)]
    );

    // 업로드 임시 파일 삭제 (DB 저장했으므로 서버 디스크에서는 즉시 삭제)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

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
    // 임시 파일 업로드 성공했으나 파싱에서 에러난 경우 파일 삭제
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ success: false, message: '파일 파싱 중 에러가 발생했습니다: ' + error.message });
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
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalFileName)}"`);

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
    const { shipmentId, skipOcr, blNumber } = req.body;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, message: '업로드된 사진(또는 ZIP 파일)이 없습니다.' });
    }
    if (!shipmentId) {
      return res.status(400).json({ success: false, message: 'Shipment ID가 필요합니다.' });
    }

    const processedResults = [];
    const imageQueue: { originalname: string; buffer: Buffer }[] = [];

    // 화주명 조회
    const [shipment]: any = await pool.query('SELECT shipper FROM shipments WHERE id = ?', [shipmentId]);
    const shipperName = shipment.length > 0 && shipment[0].shipper ? shipment[0].shipper : '일반화주';

    const dateObj = new Date();
    const year = dateObj.getFullYear().toString();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');

    // 임시 폴더 경로 생성
    const tempFolder = path.join(__dirname, '../../uploads', 'temp');
    if (!fs.existsSync(tempFolder)) {
      fs.mkdirSync(tempFolder, { recursive: true });
    }

    // 1. 업로드된 파일들을 확인하여 ZIP 파일이면 압축 해제, 일반 이미지면 큐에 추가
    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();
      
      if (ext === '.zip' || file.mimetype === 'application/zip') {
        const zip = new AdmZip(file.path);
        const zipEntries = zip.getEntries();
        
        for (const entry of zipEntries) {
          if (!entry.isDirectory && entry.entryName.match(/\.(jpg|jpeg|png)$/i)) {
            if (entry.entryName.includes('__MACOSX') || entry.name.startsWith('.')) continue;
            imageQueue.push({
              originalname: entry.name,
              buffer: entry.getData()
            });
          }
        }
      } else if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
        imageQueue.push({
          originalname: file.originalname,
          buffer: fs.readFileSync(file.path)
        });
      }
    }

    if (imageQueue.length === 0) {
      return res.status(400).json({ success: false, message: '처리할 이미지 파일이 없습니다.' });
    }

    // 2. 추출된 이미지들을 순회하며 sharp 압축 및 OCR 분석 진행
    for (const image of imageQueue) {
      try {
        const optimizedBuffer = await sharp(image.buffer)
          .resize({ width: 1920, withoutEnlargement: true })
          .grayscale()
          .jpeg({ quality: 80 })
          .toBuffer();

        let ocrResult: any = { rawText: '', plateNumber: null, vin: null, type: 'unknown' };
        
        if (skipOcr !== 'true') {
          ocrResult = await analyzeVehiclePhoto(optimizedBuffer);
        }

        // 한글 파일명 깨짐을 방지하기 위해 완전한 난수로 파일명 생성
        const randomString = Math.random().toString(36).substring(2, 10);
        const tempFileName = `photo_${Date.now()}_${randomString}.jpg`;
        const tempRelativeUrl = `/uploads/temp/${tempFileName}`;
        const tempPath = path.join(tempFolder, tempFileName);
        
        fs.writeFileSync(tempPath, optimizedBuffer);

        ocrResult.serverUrl = `http://localhost:5000${tempRelativeUrl}`;

        // 3. 사진 타입이 확인된 경우 DB에 매핑 및 파일 물리적 이동
        if (ocrResult.vin || ocrResult.plateNumber) {
          const [existing]: any = await pool.query(
            'SELECT id, vin FROM vehicles WHERE shipment_id = ? AND (vin = ? OR deregistration_no = ?)',
            [shipmentId, ocrResult.vin || 'NULL', ocrResult.plateNumber || 'NULL']
          );

          let finalVin = ocrResult.vin;
          let updateId = null;

          if (existing.length > 0) {
            updateId = existing[0].id;
            finalVin = existing[0].vin || ocrResult.vin;
          }

          if (!finalVin) finalVin = 'UNKNOWN_VIN';

          // 정식 폴더로 이동 (uploads/화주명/YYYY/MM/VIN)
          const targetDir = path.join(__dirname, '../../uploads', shipperName, year, month, finalVin);
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          const targetPath = path.join(targetDir, tempFileName);
          const targetRelativeUrl = `/uploads/${shipperName}/${year}/${month}/${finalVin}/${tempFileName}`;
          
          fs.renameSync(tempPath, targetPath);
          ocrResult.serverUrl = `http://localhost:5000${targetRelativeUrl}`;

          if (existing.length > 0) {
            if (ocrResult.type === 'document' && ocrResult.plateNumber) {
               await pool.query('UPDATE vehicles SET deregistration_no = ? WHERE id = ?', [ocrResult.plateNumber, updateId]);
            }
            if (ocrResult.type === 'plate' || ocrResult.type === 'vin') {
               await pool.query('UPDATE vehicles SET condition_photo_url = ? WHERE id = ?', [JSON.stringify([targetRelativeUrl]), updateId]);
            }
          } else {
            if (ocrResult.vin) {
               const specs = await decodeVin(ocrResult.vin);
               await pool.query(
                 'INSERT INTO vehicles (shipment_id, vin, deregistration_no, make, model, year, status, condition_photo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                 [
                   shipmentId, 
                   ocrResult.vin, 
                   ocrResult.plateNumber || null,
                   specs ? specs.make : null,
                   specs ? specs.model : null,
                   specs ? specs.year : null,
                   'Yard In',
                   ocrResult.type !== 'document' ? JSON.stringify([targetRelativeUrl]) : null
                 ]
               );
               
               // 프론트엔드로 보내주기 위해 ocrResult.extracted 확장
               (ocrResult as any).make = specs ? specs.make : null;
               (ocrResult as any).model = specs ? specs.model : null;
               (ocrResult as any).year = specs ? specs.year : null;
            }
          }
        } else {
          processedResults.push({
            fileName: image.originalname,
            status: 'manual_review',
            reason: '차대번호 또는 차량번호를 식별하지 못했습니다.'
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

    // 4. 업로드된 원본 임시 파일들 삭제 (ZIP 포함)
    for (const file of files) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    }

    res.json({
      success: true,
      message: 'ZIP 파일 압축 해제, 이미지 최적화 및 OCR 자동 분류가 완료되었습니다.',
      data: processedResults
    });

  } catch (error: any) {
    console.error('차량 사진/ZIP 업로드 에러:', error);
    res.status(500).json({ success: false, message: '파일 처리 중 오류가 발생했습니다.' });
  }
};

