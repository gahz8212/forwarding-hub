import { Request, Response } from 'express';
import puppeteer from 'puppeteer';
import axios from 'axios';
import pool from '../config/db';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { parseExcelToGridData, parsePdfToGridData } from '../services/fileParser';
import { saveVehiclePhotoAndDeduplicate } from '../utils/photoHelper';

function parseDateForDb(dateStr: any): string | null {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  if (str.includes('T')) {
    return str.split('T')[0];
  }
  const cleaned = str.replace(/\//g, '-');
  if (cleaned.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return cleaned;
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return null;
}

export const getAllShipments = async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query('SELECT * FROM shipments ORDER BY etd DESC');
    res.json({
      success: true,
      message: '전체 선적 및 선박 정보를 불러왔습니다.',
      data: rows
    });
  } catch (error) {
    console.error('전체 선적 조회 에러:', error);
    res.status(500).json({ success: false, message: '데이터를 가져오는 중 에러가 발생했습니다.' });
  }
};

export const getTrackingInfo = async (req: Request, res: Response) => {
  const { blNumber } = req.params;

  if (!blNumber) {
    return res.status(400).json({ success: false, message: 'B/L 번호를 입력해주세요.' });
  }

  try {
    const [rows]: any = await pool.query('SELECT * FROM shipments WHERE bl_number = ?', [blNumber]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '해당 B/L 번호의 정보를 찾을 수 없습니다.' });
    }

    const shipment = rows[0];

    // DB에서 가져온 데이터에 가상의 타임라인(Events)을 덧붙여서 응답
    const mockData = {
      ...shipment,
      // Date 객체일 경우 문자열로 변환 (yyyy-mm-dd)
      etd: shipment.etd ? shipment.etd.toISOString().split('T')[0] : '',
      eta: shipment.eta ? shipment.eta.toISOString().split('T')[0] : '',
      events: [
        { date: shipment.etd ? shipment.etd.toISOString().split('T')[0] + ' 14:00' : '2024-05-08 14:00', location: shipment.pol, status: 'Gate In Empty' },
        { date: shipment.etd ? shipment.etd.toISOString().split('T')[0] + ' 18:00' : '2024-05-10 18:00', location: shipment.pol, status: 'Vessel Departed' }
      ]
    };

    res.json({
      success: true,
      message: '트래킹 정보를 성공적으로 조회했습니다.',
      data: mockData
    });

  } catch (error) {
    console.error('트래킹 조회 에러:', error);
    res.status(500).json({ success: false, message: '트래킹 정보를 가져오는 중 에러가 발생했습니다.' });
  }
};

export const uploadDocs = async (req: Request, res: Response) => {
  const { blNumber } = req.body;
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

  if (!blNumber) {
    return res.status(400).json({ success: false, message: 'B/L 번호가 누락되었습니다.' });
  }

  const invoiceFile = files?.['invoice']?.[0];
  const packingFile = files?.['packingList']?.[0];

  if (!invoiceFile || !packingFile) {
    return res.status(400).json({ success: false, message: '상업송장(Invoice)과 패킹리스트(Packing List) 파일을 모두 업로드해야 합니다.' });
  }

  const rootUploadsDir = path.join(__dirname, '../../uploads');
  const getRelativeUrlPath = (file: Express.Multer.File) => {
    const relPath = path.relative(rootUploadsDir, file.destination);
    return `/uploads/${relPath}/${file.filename}`.replace(/\\/g, '/');
  };

  const invoicePath = getRelativeUrlPath(invoiceFile);
  const packingPath = getRelativeUrlPath(packingFile);

  try {
    // 파일 분석 및 격자 데이터 추출 진행
    const parseFileToGrid = async (file: Express.Multer.File) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === '.xlsx' || ext === '.xls' || file.mimetype.includes('spreadsheet') || file.mimetype.includes('excel')) {
        return await parseExcelToGridData(file.path);
      } else if (ext === '.pdf' || file.mimetype === 'application/pdf') {
        return await parsePdfToGridData(file.path);
      } else {
        throw new Error('지원하지 않는 파일 형식입니다. (Excel, PDF만 지원)');
      }
    };

    const invoiceGridData = await parseFileToGrid(invoiceFile);
    const packingGridData = await parseFileToGrid(packingFile);

    const invoiceKey = crypto.randomUUID();
    const packingKey = crypto.randomUUID();

    // 임시 테이블 저장
    await pool.query(
      'INSERT INTO temp_file_grids (id, file_name, file_type, grid_data) VALUES (?, ?, ?, ?)',
      [invoiceKey, invoiceFile.originalname, path.extname(invoiceFile.originalname).replace('.', ''), JSON.stringify(invoiceGridData)]
    );
    await pool.query(
      'INSERT INTO temp_file_grids (id, file_name, file_type, grid_data) VALUES (?, ?, ?, ?)',
      [packingKey, packingFile.originalname, path.extname(packingFile.originalname).replace('.', ''), JSON.stringify(packingGridData)]
    );

    // 1. DB의 선적 데이터 업데이트 (상태를 검증대기로 전환 및 생성 키 저장)
    await pool.query(
      `UPDATE shipments 
       SET invoice_file_path = ?, packing_list_file_path = ?, 
           invoice_file_key = ?, packing_list_file_key = ?,
           status = 'Documents Uploaded' 
       WHERE bl_number = ?`,
      [invoicePath, packingPath, invoiceKey, packingKey, blNumber]
    );

    // B/L 룸 소켓 실시간 이벤트 발행
    const io = req.app.get('io');
    const payload = { 
      blNumber, 
      status: 'Documents Uploaded',
      invoice_file_path: invoicePath,
      packing_list_file_path: packingPath,
      invoice_file_key: invoiceKey,
      packing_list_file_key: packingKey,
      last_updated: new Date()
    };
    io.to(blNumber).emit('shipment_status_changed', payload);
    io.to('admin').emit('shipment_status_changed', payload);

    res.json({
      success: true,
      message: '서류가 성공적으로 업로드 및 분석되었습니다. 오퍼레이터의 검증을 대기합니다.',
      data: { 
        invoicePath, 
        packingPath,
        invoiceKey,
        packingKey
      }
    });
  } catch (error: any) {
    console.error('서류 업로드 DB 업데이트 에러:', error);
    res.status(500).json({ success: false, message: '서류 정보 저장 및 분석 중 에러가 발생했습니다: ' + error.message });
  }
};

export const verifyDocs = async (req: Request, res: Response) => {
  const { blNumber } = req.body;

  if (!blNumber) {
    return res.status(400).json({ success: false, message: 'B/L 번호가 누락되었습니다.' });
  }

  try {
    await pool.query(
      `UPDATE shipments SET status = 'Documents Verified' WHERE bl_number = ?`,
      [blNumber]
    );

    // B/L 룸 소켓 실시간 이벤트 발행
    const io = req.app.get('io');
    const payload = { 
      blNumber, 
      status: 'Documents Verified',
      last_updated: new Date()
    };
    io.to(blNumber).emit('shipment_status_changed', payload);
    io.to('admin').emit('shipment_status_changed', payload);

    res.json({ success: true, message: '선적 서류 검증이 승인 완료되었습니다.' });
  } catch (error) {
    console.error('서류 검증 승인 에러:', error);
    res.status(500).json({ success: false, message: '서류 검증 승인 중 에러가 발생했습니다.' });
  }
};

export const assignTruck = async (req: Request, res: Response) => {
  const { blNumber, truckDate, truckPlateNumber, truckDriverPhone } = req.body;

  if (!blNumber || !truckDate || !truckPlateNumber || !truckDriverPhone) {
    return res.status(400).json({ success: false, message: '필수 배정 정보(B/L, 배정일, 차량번호, 기사연락처)가 누락되었습니다.' });
  }

  try {
    await pool.query(
      `UPDATE shipments 
       SET truck_date = ?, truck_plate_number = ?, truck_driver_phone = ?, status = 'Trucking' 
       WHERE bl_number = ?`,
      [truckDate, truckPlateNumber, truckDriverPhone, blNumber]
    );

    // B/L 룸 소켓 실시간 이벤트 발행
    const io = req.app.get('io');
    const payload = { 
      blNumber, 
      status: 'Trucking',
      truck_date: truckDate,
      truck_plate_number: truckPlateNumber,
      truck_driver_phone: truckDriverPhone,
      last_updated: new Date()
    };
    io.to(blNumber).emit('shipment_status_changed', payload);
    io.to('admin').emit('shipment_status_changed', payload);

    res.json({ success: true, message: '트럭 운송 차량 배정이 완료되었으며 운송 단계로 전이됩니다.' });
  } catch (error) {
    console.error('트럭 배정 에러:', error);
    res.status(500).json({ success: false, message: '트럭 배정 중 에러가 발생했습니다.' });
  }
};

export const updateShipmentStatus = async (req: Request, res: Response) => {
  const { blNumber, status } = req.body;

  if (!blNumber || !status) {
    return res.status(400).json({ success: false, message: 'B/L 번호와 변경할 상태가 누락되었습니다.' });
  }

  try {
    await pool.query(
      `UPDATE shipments SET status = ? WHERE bl_number = ?`,
      [status, blNumber]
    );

    // B/L 룸 소켓 실시간 이벤트 발행
    const io = req.app.get('io');
    const payload = { 
      blNumber, 
      status,
      last_updated: new Date()
    };
    io.to(blNumber).emit('shipment_status_changed', payload);
    io.to('admin').emit('shipment_status_changed', payload);

    res.json({ success: true, message: `선적 상태가 '${status}'(으)로 업데이트되었습니다.` });
  } catch (error) {
    console.error('선적 상태 업데이트 에러:', error);
    res.status(500).json({ success: false, message: '상태 업데이트 중 에러가 발생했습니다.' });
  }
};

export const reRequestDocs = async (req: Request, res: Response) => {
  const { blNumber } = req.body;

  if (!blNumber) {
    return res.status(400).json({ success: false, message: 'B/L 번호가 누락되었습니다.' });
  }

  try {
    // 1. 기존 파일 경로 조회
    const [rows]: any = await pool.query(
      'SELECT invoice_file_path, packing_list_file_path FROM shipments WHERE bl_number = ?',
      [blNumber]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '해당 B/L 번호의 선적 정보를 찾을 수 없습니다.' });
    }

    const shipment = rows[0];
    const uploadDir = path.join(__dirname, '../../uploads');

    // 2. 물리 파일 삭제
    if (shipment.invoice_file_path) {
      const relPath = shipment.invoice_file_path.replace(/^\/uploads\//, '');
      const invoiceAbsPath = path.join(uploadDir, relPath);
      if (fs.existsSync(invoiceAbsPath)) {
        try {
          fs.unlinkSync(invoiceAbsPath);
        } catch (err) {
          console.error('인보이스 파일 삭제 에러:', err);
        }
      }
    }

    if (shipment.packing_list_file_path) {
      const relPath = shipment.packing_list_file_path.replace(/^\/uploads\//, '');
      const packingAbsPath = path.join(uploadDir, relPath);
      if (fs.existsSync(packingAbsPath)) {
        try {
          fs.unlinkSync(packingAbsPath);
        } catch (err) {
          console.error('패킹리스트 파일 삭제 에러:', err);
        }
      }
    }

    // 3. DB 상태 및 서류 경로 초기화
    await pool.query(
      `UPDATE shipments 
       SET invoice_file_path = NULL, packing_list_file_path = NULL, status = 'Pending Documents' 
       WHERE bl_number = ?`,
      [blNumber]
    );

    // 4. B/L 룸 소켓 실시간 이벤트 발행
    const io = req.app.get('io');
    const payload = { 
      blNumber, 
      status: 'Pending Documents',
      invoice_file_path: null,
      packing_list_file_path: null,
      last_updated: new Date()
    };
    io.to(blNumber).emit('shipment_status_changed', payload);
    io.to('admin').emit('shipment_status_changed', payload);

    res.json({ success: true, message: '서류 재요청 처리가 완료되었습니다. 화주에게 다시 서류 제출을 요청합니다.' });

  } catch (error) {
    console.error('서류 재요청 처리 중 에러:', error);
    res.status(500).json({ success: false, message: '서류 재요청 처리 중 에러가 발생했습니다.' });
  }
};

export const getVehiclesByShipment = async (req: Request, res: Response) => {
  try {
    const { shipmentId } = req.params;
    const [vehicles]: any = await pool.query('SELECT * FROM vehicles WHERE shipment_id = ? ORDER BY id ASC', [shipmentId]);
    
    // 포맷팅 (condition_photo_urls 가 프론트엔드에서는 배열로 쓰이므로 처리)
    const formattedVehicles = vehicles.map((v: any) => {
      let urls: string[] = [];
      if (v.condition_photo_url) {
        try {
          urls = JSON.parse(v.condition_photo_url);
        } catch (e) {
          urls = [v.condition_photo_url];
        }
      }
      return {
        id: v.id,
        vin: v.vin,
        make: v.make || "Unknown",
        model: v.model || "Unknown",
        year: v.year || new Date().getFullYear(),
        drivability: v.drivability || "", // 빈 값(null)으로 전달하여 대기 중 분석 시에도 구동여부 미선택 상태 유지
        status: v.status || "Yard In",
        condition_photo_urls: urls.map(url => url.startsWith('http') ? url : `http://localhost:5000${url}`),
        deregistration_photo_urls: (() => {
          let dUrls = [];
          if (v.deregistration_photo_url) {
            try { dUrls = JSON.parse(v.deregistration_photo_url); } catch (e) { dUrls = [v.deregistration_photo_url]; }
          }
          return dUrls.map((url: string) => url.startsWith('http') ? url : `http://localhost:5000${url}`);
        })(),
        vin_photo_urls: (() => {
          let vUrls = [];
          if (v.vin_photo_url) {
            try { vUrls = JSON.parse(v.vin_photo_url); } catch (e) { vUrls = [v.vin_photo_url]; }
          }
          return vUrls.map((url: string) => url.startsWith('http') ? url : `http://localhost:5000${url}`);
        })(),
        customs_cleared: !!v.customs_cleared,
        buyer: "",
        price: v.price || 0,
        plate_number: v.plate_number || "",
        mileage: v.mileage || "",
        initial_registration_date: v.initial_registration_date || "",
        vehicle_type: v.vehicle_type || ""
      };
    });

    return res.json({ success: true, data: formattedVehicles });
  } catch (error) {
    console.error('getVehicles Error:', error);
    return res.status(500).json({ success: false, message: '차량 목록을 불러오는 중 오류가 발생했습니다.' });
  }
};

export const assignPhotosToVehicle = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { photoUrls } = req.body; // 배열 ["http://localhost:5000/uploads/2026-07/SHIP_1/unclassified/photo_123.jpg", ...]

    if (!Array.isArray(photoUrls)) {
      return res.status(400).json({ success: false, message: 'photoUrls는 배열이어야 합니다.' });
    }

    const { type } = req.body; // 'document' | 'vin' | 'plate' (default)
    const targetColumn = type === 'document' ? 'deregistration_photo_url' : type === 'vin' ? 'vin_photo_url' : 'condition_photo_url';

    // 차량 정보(vin, blNumber 등 확인용) 가져오기
    const [vehicles]: any = await pool.query(
      `SELECT v.vin, v.condition_photo_url, v.deregistration_photo_url, v.vin_photo_url, s.bl_number, s.shipper FROM vehicles v JOIN shipments s ON v.shipment_id = s.id WHERE v.id = ?`,
      [id]
    );

    if (vehicles.length === 0) {
      return res.status(404).json({ success: false, message: '차량을 찾을 수 없습니다.' });
    }

    const vehicle = vehicles[0];
    const vin = vehicle.vin || 'UNKNOWN_VIN';
    const shipperName = vehicle.shipper || '일반화주';
    
    const dateObj = new Date();
    const year = dateObj.getFullYear().toString();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    
    let existingUrls: string[] = [];
    const dbVal = vehicle[targetColumn];
    if (dbVal) {
      try {
        existingUrls = JSON.parse(dbVal);
      } catch (e) {
        existingUrls = [dbVal];
      }
    }

    const newSavedUrls: string[] = [];

    // 파일 물리적 이동
    for (const fullUrl of photoUrls) {
      if (!fullUrl) continue;
      
      try {
        // "http://localhost:5000/uploads/..." -> "/uploads/..."
        const relativeUrl = fullUrl.replace(/^https?:\/\/[^\/]+/, '');
        const sourcePath = path.join(__dirname, '../../', relativeUrl);
        
        if (fs.existsSync(sourcePath)) {
          // 목표 폴더: uploads/화주명/YYYY/MM/VIN/
          const targetDir = path.join(__dirname, '../../uploads', shipperName, year, month, vin);
          const fileBuffer = fs.readFileSync(sourcePath);
          const newRelativeUrl = saveVehiclePhotoAndDeduplicate(
            fileBuffer,
            targetDir,
            vin,
            shipperName,
            year,
            month
          );
          
          // 원래 임시 파일은 삭제
          fs.unlinkSync(sourcePath);
          newSavedUrls.push(newRelativeUrl);
        } else {
          // 이미 이동되었거나 못찾은 경우 그대로 추가
          newSavedUrls.push(relativeUrl);
        }
      } catch (err) {
        console.error('파일 이동 에러:', err);
      }
    }

    // 중복 제거 후 병합
    const mergedUrls = Array.from(new Set([...existingUrls, ...newSavedUrls]));

    await pool.query(`UPDATE vehicles SET ${targetColumn} = ? WHERE id = ?`, [JSON.stringify(mergedUrls), id]);

    return res.json({ success: true, message: '배정 완료', data: mergedUrls });
  } catch (error) {
    console.error('assignPhotos Error:', error);
    return res.status(500).json({ success: false, message: '사진 배정 중 서버 에러' });
  }
};

export const resetDashboardData = async (req: Request, res: Response) => {
  try {
    const { shipmentId } = req.params;
    const blNumber = req.query.blNumber as string;

    if (!shipmentId) {
      return res.status(400).json({ success: false, message: '선적 ID가 필요합니다.' });
    }

    // 1. DB에서 차량 정보 전체 삭제
    await pool.query('DELETE FROM vehicles WHERE shipment_id = ?', [shipmentId]);

    // 2. 미분류 사진함 (temp 폴더 내 BL번호 폴더) 비우기
    if (blNumber) {
      const safeBlNumber = String(blNumber).replace(/[^a-zA-Z0-9_-]/g, '_');
      const tempFolder = path.join(__dirname, '../../uploads', 'temp', safeBlNumber);
      
      if (fs.existsSync(tempFolder)) {
        fs.rmSync(tempFolder, { recursive: true, force: true });
        fs.mkdirSync(tempFolder, { recursive: true });
      }
    }

    return res.json({ success: true, message: '대시보드 데이터 및 미분류 사진이 모두 초기화되었습니다.' });
  } catch (error) {
    console.error('대시보드 초기화 에러:', error);
    return res.status(500).json({ success: false, message: '초기화 중 서버 에러가 발생했습니다.' });
  }
};

export const saveAllVehicles = async (req: Request, res: Response) => {
  try {
    const { shipmentId } = req.params;
    const { blNumber, vehicles } = req.body;

    if (!shipmentId || !blNumber) {
      return res.status(400).json({ success: false, message: '선적 ID와 BL 번호가 필요합니다.' });
    }

    // 1. 차량 정보 업데이트 (vehicles 배열 순회)
    if (vehicles && Array.isArray(vehicles)) {
      for (const v of vehicles) {
        await pool.query(
          `UPDATE vehicles 
           SET vin = ?, plate_number = ?, vehicle_type = ?, mileage = ?, initial_registration_date = ?, 
               make = ?, model = ?, year = ?, price = ?, drivability = ?
           WHERE id = ? AND shipment_id = ?`,
          [
            v.vin || null, v.plate_number || null, v.vehicle_type || null, v.mileage || null, parseDateForDb(v.initial_registration_date),
            v.make || null, v.model || null, v.year || null, v.price || null, v.drivability || null,
            v.id, shipmentId
          ]
        );
      }
    }

    // 2. 임시 폴더 내의 분석된 사진 및 원본 백업 파일 삭제 (미분류 외관 사진은 유지)
    const safeBlNumber = String(blNumber).replace(/[^a-zA-Z0-9_-]/g, '_');
    const tempFolder = path.join(__dirname, '../../uploads', 'temp', safeBlNumber);
    
    const cleanDir = (dir: string) => {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          if (fs.statSync(filePath).isFile()) {
            if (file.startsWith('analyzed_') || file.startsWith('original_')) {
              fs.unlinkSync(filePath);
            }
          }
        }
      }
    };

    cleanDir(tempFolder);
    cleanDir(path.join(tempFolder, 'docs'));
    cleanDir(path.join(tempFolder, 'exterior'));

    return res.json({ success: true, message: '모든 데이터가 저장되었습니다.' });
  } catch (error) {
    console.error('전체 저장 에러:', error);
    return res.status(500).json({ success: false, message: '저장 중 서버 에러가 발생했습니다.' });
  }
};


export const removePhotoFromVehicle = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { photoUrl, type } = req.body; // 'document' | 'vin' | 'plate' (default)

    if (!photoUrl) {
      return res.status(400).json({ success: false, message: 'photoUrl이 필요합니다.' });
    }

    const targetColumn = type === 'document' ? 'deregistration_photo_url' : type === 'vin' ? 'vin_photo_url' : 'condition_photo_url';

    const [vehicles]: any = await pool.query(
      `SELECT v.vin, v.condition_photo_url, v.deregistration_photo_url, v.vin_photo_url, s.shipper FROM vehicles v JOIN shipments s ON v.shipment_id = s.id WHERE v.id = ?`,
      [id]
    );

    if (vehicles.length === 0) {
      return res.status(404).json({ success: false, message: '차량을 찾을 수 없습니다.' });
    }

    const vehicle = vehicles[0];
    const relativeUrl = photoUrl.replace(/^https?:\/\/[^\/]+/, '');

    let existingUrls: string[] = [];
    const dbVal = vehicle[targetColumn];
    if (dbVal) {
      try {
        existingUrls = JSON.parse(dbVal);
      } catch (e) {
        existingUrls = [dbVal];
      }
    }

    const updatedUrls = existingUrls.filter((url: string) => url !== relativeUrl);

    await pool.query(`UPDATE vehicles SET ${targetColumn} = ? WHERE id = ?`, [JSON.stringify(updatedUrls), id]);

    return res.json({ success: true, message: '제거 완료', data: updatedUrls });
  } catch (error) {
    console.error('removePhoto Error:', error);
    return res.status(500).json({ success: false, message: '사진 제거 중 서버 에러' });
  }
};

export const sendPdfToShipper = async (req: Request, res: Response) => {
  const { shipmentId } = req.params;
  const { blNumber } = req.body;
  const userSession = (req.session as any).user;

  if (!userSession?.kakaoToken) {
    return res.status(403).json({ 
      success: false, 
      message: '카카오 로그인이 필요합니다. (포워더가 카카오로 로그인해야 카톡 알림 발송이 가능합니다)' 
    });
  }

  try {
    // 1. 선적 정보 및 차량 목록 가져오기
    const [shipments]: any = await pool.query('SELECT * FROM shipments WHERE id = ?', [shipmentId]);
    if (shipments.length === 0) {
      return res.status(404).json({ success: false, message: '선적 정보를 찾을 수 없습니다.' });
    }
    const shipment = shipments[0];

    const [vehicles]: any = await pool.query('SELECT * FROM vehicles WHERE shipment_id = ?', [shipmentId]);

    // 2. HTML 컨텐츠 생성 (Commercial Invoice & Packing List 통합 양식)
    const htmlContent = `
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: sans-serif; padding: 40px; color: #333; }
            h1 { text-align: center; font-size: 24px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; font-size: 12px; }
            th { background-color: #f5f5f5; font-weight: bold; }
            .section-title { font-size: 16px; font-weight: bold; margin-top: 30px; border-bottom: 2px solid #333; padding-bottom: 5px; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
            .info-box { border: 1px solid #ccc; padding: 15px; border-radius: 5px; font-size: 13px; }
          </style>
        </head>
        <body>
          <h1>COMMERCIAL INVOICE & PACKING LIST</h1>
          <div class="info-grid">
            <div class="info-box">
              <strong>Shipper (Exporter):</strong><br/>
              ${shipment.shipper || '일반 화주'}<br/>
              B/L No: ${blNumber}<br/>
              POL: ${shipment.pol || ''}
            </div>
            <div class="info-box">
              <strong>Consignee (Importer/Buyer):</strong><br/>
              ${shipment.buyer || 'Unknown Buyer'}<br/>
              Vessel: ${shipment.vessel_name || ''}<br/>
              POD: ${shipment.pod || ''}
            </div>
          </div>
          
          <div class="section-title">VEHICLE LIST (차량 내역)</div>
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>VIN (차대번호)</th>
                <th>Make/Model (제조사/차명)</th>
                <th>Year (연식)</th>
                <th>Plate Number (차량번호)</th>
                <th>Price (USD)</th>
              </tr>
            </thead>
            <tbody>
              ${vehicles.map((v: any, idx: number) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${v.vin}</td>
                  <td>${v.make || 'Unknown'} / ${v.model || 'Unknown'}</td>
                  <td>${v.year || ''}</td>
                  <td>${v.plate_number || ''}</td>
                  <td>$${(v.price || 0).toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div style="margin-top: 40px; text-align: right; font-weight: bold; font-size: 16px;">
            Total Price: ${vehicles.reduce((sum: number, v: any) => sum + (v.price || 0), 0).toLocaleString()}
          </div>
        </body>
      </html>
    `;

    // 3. Puppeteer를 이용한 PDF 파일 생성
    const pdfDir = path.join(__dirname, '../../uploads/pdf');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }
    const pdfPath = path.join(pdfDir, `${blNumber}.pdf`);

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent);
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
    await browser.close();

    const pdfRelativeUrl = `/uploads/pdf/${blNumber}.pdf`;
    const pdfAbsoluteUrl = `http://localhost:5000${pdfRelativeUrl}`;

    // 4. Kakao Talk 나에게 보내기 API를 사용하여 알림톡 발송
    const messageText = `[선적 서류 및 PDF 통지]\nB/L: ${blNumber}\n화주명: ${shipment.shipper || '일반화주'}\n차량 대수: ${vehicles.length}대\n\n상업송장 및 패킹리스트 PDF 생성이 완료되어 카카오톡으로 전송되었습니다. 아래 버튼을 눌러 모바일 서류를 바로 확인해 주세요.`;

    await axios.post(
      'https://kapi.kakao.com/v2/api/talk/memo/default/send',
      `template_object=${JSON.stringify({
        object_type: 'text',
        text: messageText,
        link: { web_url: pdfAbsoluteUrl, mobile_web_url: pdfAbsoluteUrl },
        button_title: 'PDF 서류 보기'
      })}`,
      {
        headers: {
          'Authorization': `Bearer ${userSession.kakaoToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    // 5. DB에 생성된 PDF 파일 경로 업데이트 (shipments 테이블)
    await pool.query(
      'UPDATE shipments SET invoice_file_path = ?, packing_list_file_path = ? WHERE id = ?',
      [pdfRelativeUrl, pdfRelativeUrl, shipmentId]
    );

    res.json({ success: true, message: 'PDF 생성 및 카카오톡 전송 성공', data: { pdfUrl: pdfAbsoluteUrl } });
  } catch (error: any) {
    console.error('PDF 생성 및 전송 오류:', error);
    res.status(500).json({ success: false, message: 'PDF 생성 또는 카카오톡 전송 중 서버 오류: ' + (error.response?.data?.message || error.message) });
  }
};
