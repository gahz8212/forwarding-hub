import { Request, Response } from 'express';
import puppeteer from 'puppeteer';
import axios from 'axios';
import pool from '../config/db';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { parseExcelToGridData, parsePdfToGridData } from '../services/fileParser';
import { saveVehiclePhotoAndDeduplicate } from '../utils/photoHelper';
import { Storage } from '@google-cloud/storage';

const storageClient = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME || 'forwarding-hub-assets';
const bucket = storageClient.bucket(bucketName);

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
    const userSession = (req.session as any).user;
    let query = `
      SELECT s.*, i.invoice_no as debit_note_invoice_no, i.payment_status as debit_note_payment_status 
      FROM shipments s
      LEFT JOIN invoices i ON s.bl_number = i.bl_number
    `;
    const params: any[] = [];

    if (userSession && userSession.role === 'client') {
      let clientName = '';
      if (userSession.client_id) {
        const [clients]: any = await pool.query('SELECT client_name FROM clients WHERE client_id = ?', [userSession.client_id]);
        if (clients.length > 0) {
          clientName = clients[0].client_name;
        }
      }
      query += ' WHERE s.shipper = ? OR (s.shipper = ? AND ? <> "")';
      params.push(userSession.username, clientName, clientName);
    }

    query += ' ORDER BY s.etd DESC';

    const [rows] = await pool.query(query, params);
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

    // Client ownership check
    const userSession = (req.session as any).user;
    if (userSession && userSession.role === 'client') {
      let clientName = '';
      if (userSession.client_id) {
        const [clients]: any = await pool.query('SELECT client_name FROM clients WHERE client_id = ?', [userSession.client_id]);
        if (clients.length > 0) {
          clientName = clients[0].client_name;
        }
      }
      if (shipment.shipper !== userSession.username && shipment.shipper !== clientName) {
        return res.status(403).json({ success: false, message: '해당 선적 정보 조회 권한이 없습니다.' });
      }
    }

    // Fetch vehicle statistics for progress rate
    const [vehicles]: any = await pool.query(
      "SELECT COUNT(*) as total, SUM(CASE WHEN status IN ('Yard In', 'Loaded') THEN 1 ELSE 0 END) as yard_in_count FROM vehicles WHERE shipment_id = ?",
      [shipment.id]
    );
    const vehicleStats = vehicles.length > 0 ? vehicles[0] : { total: 0, yard_in_count: 0 };

    // DB에서 가져온 데이터에 가상의 타임라인(Events)을 덧붙여서 응답
    const mockData = {
      ...shipment,
      // Date 객체일 경우 문자열로 변환 (yyyy-mm-dd)
      etd: shipment.etd ? shipment.etd.toISOString().split('T')[0] : '',
      eta: shipment.eta ? shipment.eta.toISOString().split('T')[0] : '',
      vehicleStats: {
        total: Number(vehicleStats.total || 0),
        yardInCount: Number(vehicleStats.yard_in_count || 0)
      },
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

  // GCS 업로드 유틸리티 함수
  const uploadBufferToGCS = async (file: Express.Multer.File, type: string) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const fileName = `${blNumber}_${type}_${uniqueSuffix}${ext}`;
    const gcsPath = `uploads/docs/${fileName}`;
    const blob = bucket.file(gcsPath);

    await blob.save(file.buffer, {
      contentType: file.mimetype,
      resumable: false
    });

    return `/${gcsPath}`;
  };

  try {
    const invoicePath = await uploadBufferToGCS(invoiceFile, 'invoice');
    const packingPath = await uploadBufferToGCS(packingFile, 'packingList');

    // 파일 분석 및 격자 데이터 추출 진행
    const parseFileToGrid = async (file: Express.Multer.File) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === '.xlsx' || ext === '.xls' || file.mimetype.includes('spreadsheet') || file.mimetype.includes('excel')) {
        return await parseExcelToGridData(file.buffer); // buffer 기반 파싱
      } else if (ext === '.pdf' || file.mimetype === 'application/pdf') {
        return await parsePdfToGridData(file.buffer); // buffer 기반 파싱
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

    // Update all pending vehicles to 'Trucking'
    const [shipmentRows]: any = await pool.query('SELECT id FROM shipments WHERE bl_number = ?', [blNumber]);
    if (shipmentRows.length > 0) {
      const shipmentId = shipmentRows[0].id;
      await pool.query("UPDATE vehicles SET status = 'Trucking' WHERE shipment_id = ? AND status = 'Pending'", [shipmentId]);
    }

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
  const userSession = (req.session as any).user;

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

    // 출항(Departed) 상태로 변경 시 카카오톡 정산 안내 알림 발송 및 서류 보관함 노출
    if (status === 'Departed' || status === '출항') {
      try {
        const [invoices]: any = await pool.query('SELECT invoice_no, final_amount_krw FROM invoices WHERE bl_number = ?', [blNumber]);
        if (invoices.length > 0) {
          const invoice = invoices[0];
          console.log(`B/L [${blNumber}] is Departed. Found invoice: ${invoice.invoice_no}. Sending KakaoTalk notification...`);
          
          if (userSession?.kakaoToken) {
            const messageText = `[정산서(데빗노트) 발급 알림]\nB/L 번호: ${blNumber}\n선적 상태가 '출항(Departed)'으로 변경되어 정산서가 발행되었습니다.\n\n정산 번호: ${invoice.invoice_no}\n최종 청구 금액: ₩${Number(invoice.final_amount_krw).toLocaleString()}\n\n상세 내역은 화주 메뉴의 [서류보관함] 또는 [정산 & 인보이스] 메뉴에서 확인해 주시기 바랍니다.`;
            
            await axios.post(
              'https://kapi.kakao.com/v2/api/talk/memo/default/send',
              `template_object=${JSON.stringify({
                object_type: 'text',
                text: messageText,
                link: { web_url: 'http://localhost:5173/invoices', mobile_web_url: 'http://localhost:5173/invoices' },
                button_title: '청구서 보기'
              })}`,
              {
                headers: {
                  'Authorization': `Bearer ${userSession.kakaoToken}`,
                  'Content-Type': 'application/x-www-form-urlencoded'
                }
              }
            );
          } else {
            console.warn('Kakao token not found in user session, skipped sending KakaoTalk notification.');
          }

          // 화주 실시간 알림창(토스트)용 소켓 이벤트 발행
          const [shipmentRows]: any = await pool.query('SELECT booking_id, vessel_name FROM shipments WHERE bl_number = ?', [blNumber]);
          if (shipmentRows.length > 0) {
            const shipment = shipmentRows[0];
            let shipperId = null;
            if (shipment.booking_id) {
              const [bookings]: any = await pool.query('SELECT user_id FROM bookings WHERE id = ?', [shipment.booking_id]);
              if (bookings.length > 0) {
                shipperId = bookings[0].user_id;
              }
            }
            if (shipperId) {
              io.to(`client_${shipperId}`).emit('pdf_generated_alert', {
                blNumber,
                shipperId,
                vesselName: shipment.vessel_name,
                message: `B/L [${blNumber}]의 정산서(데빗노트)가 발행되었습니다. 서류보관함에서 확인해 주세요.`
              });
            }
          }
        }
      } catch (kakaoErr: any) {
        console.error('KakaoTalk notification sending error:', kakaoErr.message);
      }
    }

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

    // Retrieve shipment details to locate docs folder
    const [shipments]: any = await pool.query('SELECT bl_number, shipper FROM shipments WHERE id = ?', [shipmentId]);
    
    let allDocsFiles: string[] = [];
    if (shipments.length > 0) {
      const { bl_number, shipper } = shipments[0];
      const safeBlNumber = bl_number ? bl_number.replace(/[^a-zA-Z0-9_-]/g, '_') : 'unknown_bl';
      const shipperName = shipper ? shipper.replace(/[^a-zA-Z0-9가-힣\s_-]/g, '').trim() || '일반화주' : '일반화주';

      // Scan temporary docs directory: uploads/temp/[bl_number]/docs
      const tempDocsDir = path.join(__dirname, '../../uploads', 'temp', safeBlNumber, 'docs');
      if (fs.existsSync(tempDocsDir)) {
        try {
          const files = fs.readdirSync(tempDocsDir);
          files.forEach(file => {
            if (file.match(/\.(jpg|jpeg|png)$/i)) {
              allDocsFiles.push(`/uploads/temp/${safeBlNumber}/docs/${file}`);
            }
          });
        } catch (e) {
          console.error('Error scanning temp docs dir:', e);
        }
      }

      // Scan permanent docs directory: uploads/[shipperName]/[YYYY]/[MM]/[bl_number]/docs
      // Search recursively under uploads/[shipperName] for [bl_number]/docs
      const shipperDir = path.join(__dirname, '../../uploads', shipperName);
      if (fs.existsSync(shipperDir)) {
        try {
          const findDocsFolder = (dir: string): string | null => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
              const filePath = path.join(dir, file);
              if (fs.statSync(filePath).isDirectory()) {
                if (file === safeBlNumber) {
                  const docsPath = path.join(filePath, 'docs');
                  if (fs.existsSync(docsPath)) return docsPath;
                }
                const found = findDocsFolder(filePath);
                if (found) return found;
              }
            }
            return null;
          };
          const docsFolderPath = findDocsFolder(shipperDir);
          if (docsFolderPath) {
            const files = fs.readdirSync(docsFolderPath);
            files.forEach(file => {
              if (file.match(/\.(jpg|jpeg|png)$/i)) {
                const rel = path.relative(path.join(__dirname, '../../'), docsFolderPath);
                allDocsFiles.push(`/${rel}/${file}`.replace(/\\/g, '/'));
              }
            });
          }
        } catch (e) {
          console.error('Error scanning permanent docs dir:', e);
        }
      }
    }

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

      let dUrls: string[] = [];
      if (v.deregistration_photo_url) {
        try {
          dUrls = JSON.parse(v.deregistration_photo_url);
        } catch (e) {
          dUrls = [v.deregistration_photo_url];
        }
      }

      // Fallback: If dUrls is empty in DB, try to find files in the docs folder matching this vehicle
      if (dUrls.length === 0 && allDocsFiles.length > 0) {
        const matchedFiles = allDocsFiles.filter(fileUrl => {
          const lowerFile = fileUrl.toLowerCase();
          const lowerVin = (v.vin || '').toLowerCase();
          const lowerPlate = (v.plate_number || '').replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase();
          const cleanDeregNo = (v.deregistration_no || '').replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase();
          
          return (lowerVin && lowerVin.length >= 6 && lowerFile.includes(lowerVin)) || 
                 (lowerPlate && lowerPlate.length >= 4 && lowerFile.includes(lowerPlate)) || 
                 (cleanDeregNo && cleanDeregNo.length >= 4 && lowerFile.includes(cleanDeregNo));
        });

        if (matchedFiles.length > 0) {
          dUrls = matchedFiles;
        } else if (vehicles.length === 1) {
          // If there is only one vehicle registered in this shipment, map all docs files to it
          dUrls = allDocsFiles;
        }
      }

      let vUrls: string[] = [];
      if (v.vin_photo_url) {
        try {
          vUrls = JSON.parse(v.vin_photo_url);
        } catch (e) {
          vUrls = [v.vin_photo_url];
        }
      }

      return {
        id: v.id,
        vin: v.vin,
        make: v.make || "Unknown",
        model: v.model || "Unknown",
        year: v.year || new Date().getFullYear(),
        drivability: v.drivability || "", // 빈 값(null)으로 전달하여 대기 중 분석 시에도 구동여부 미선택 상태 유지
        status: v.status || "Pending",
        condition_photo_urls: urls.map(url => url.startsWith('http') ? url : `http://localhost:5000${url}`),
        deregistration_photo_urls: dUrls.map((url: string) => url.startsWith('http') ? url : `http://localhost:5000${url}`),
        vin_photo_urls: vUrls.map((url: string) => url.startsWith('http') ? url : `http://localhost:5000${url}`),
        customs_cleared: !!v.customs_cleared,
        buyer: "",
        price: v.price || 0,
        plate_number: v.plate_number || "",
        mileage: v.mileage || "",
        initial_registration_date: v.initial_registration_date || "",
        vehicle_type: v.vehicle_type || "",
        length: v.length || 0,
        width: v.width || 0,
        height: v.height || 0,
        cbm: v.cbm || 0,
        weight: v.weight || 0
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
    const { photoUrls, type } = req.body; // 배열 ["http://localhost:5000/uploads/...", ...], type: 'document' | 'vin' | 'plate'

    if (!Array.isArray(photoUrls)) {
      return res.status(400).json({ success: false, message: 'photoUrls는 배열이어야 합니다.' });
    }

    // Determine target column dynamically
    const targetColumn = type === 'document' 
      ? 'deregistration_photo_url' 
      : type === 'vin' 
        ? 'vin_photo_url' 
        : 'condition_photo_url';

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
    const rawShipperName = vehicle.shipper || '일반화주';
    const shipperName = rawShipperName.replace(/[^a-zA-Z0-9가-힣\s_-]/g, '').trim() || '일반화주';
    
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

    // 파일 정규 폴더 내에서 그대로 유지하되, linked_ 접두사를 붙여 미분류 사진함에서 숨김
    for (const fullUrl of photoUrls) {
      if (!fullUrl) continue;
      const relativeUrl = fullUrl.replace(/^https?:\/\/[^\/]+/, '');

      if (relativeUrl.startsWith('/uploads/')) {
        const absolutePath = path.join(__dirname, '../../', relativeUrl);
        if (fs.existsSync(absolutePath)) {
          const dir = path.dirname(absolutePath);
          const fileName = path.basename(absolutePath);
          // 이미 linked_ 접두사가 없는 경우에만 추가
          if (!fileName.startsWith('linked_')) {
            const newFileName = `linked_${fileName}`;
            const newAbsolutePath = path.join(dir, newFileName);
            try {
              fs.renameSync(absolutePath, newAbsolutePath);
              const newRelativeUrl = relativeUrl.replace(`/${fileName}`, `/${newFileName}`);
              newSavedUrls.push(newRelativeUrl);
              continue;
            } catch (renameErr) {
              console.error('[assignPhotos] rename to linked_ failed:', renameErr);
            }
          } else {
            // 이미 linked_ 접두사가 있는 경우 그대로 사용
            newSavedUrls.push(relativeUrl);
            continue;
          }
        }
      }
      newSavedUrls.push(relativeUrl);
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

    // 2. 배정 완료된 사진들의 linked_ 접두사를 복원하여 미분류 상태로 되돌림
    if (blNumber) {
      const [shipments]: any = await pool.query(
        'SELECT shipper, etd FROM shipments WHERE bl_number = ?',
        [blNumber]
      );
      if (shipments.length > 0) {
        const dbShipment = shipments[0];
        const rawShipperName = dbShipment.shipper || '일반화주';
        const shipperName = rawShipperName.replace(/[^a-zA-Z0-9가-힣\s_-]/g, '').trim() || '일반화주';
        const uploadDate = dbShipment.etd ? new Date(dbShipment.etd) : new Date();
        const year = uploadDate.getFullYear().toString();
        const month = String(uploadDate.getMonth() + 1).padStart(2, '0');
        const safeBlNumber = String(blNumber).replace(/[^a-zA-Z0-9_-]/g, '_');

        const realFolder = path.join(__dirname, '../../uploads', shipperName, year, month, safeBlNumber);
        for (const sub of ['docs', 'exterior'] as const) {
          const subDir = path.join(realFolder, sub);
          if (fs.existsSync(subDir)) {
            for (const file of fs.readdirSync(subDir)) {
              // linked_로 시작하는 파일인 경우 복원
              if (file.startsWith('linked_')) {
                const originalFileName = file.replace(/^linked_/, '');
                const oldPath = path.join(subDir, file);
                const newPath = path.join(subDir, originalFileName);
                try {
                  fs.renameSync(oldPath, newPath);
                } catch (e) {
                  console.error(`[resetDashboardData] rename failed for ${file}:`, e);
                }
              }
            }
          }
        }
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
    const { vehicles, blNumber } = req.body;

    if (!shipmentId) {
      return res.status(400).json({ success: false, message: '선적 ID가 필요합니다.' });
    }

    // 차량 정보 업데이트 (파일 이동 로직 없이 DB 제원만 업데이트)
    if (vehicles && Array.isArray(vehicles)) {
      for (const v of vehicles) {
        await pool.query(
          `UPDATE vehicles 
           SET vin = ?, plate_number = ?, vehicle_type = ?, mileage = ?, initial_registration_date = ?, 
               make = ?, model = ?, year = ?, price = ?, drivability = ?,
               length = ?, width = ?, height = ?, weight = ?, cbm = ?
           WHERE id = ? AND shipment_id = ?`,
          [
            v.vin || null, v.plate_number || null, v.vehicle_type || null, v.mileage || null, parseDateForDb(v.initial_registration_date),
            v.make || null, v.model || null, v.year || null, v.price || null, v.drivability || null,
            v.length || null, v.width || null, v.height || null, v.weight || null, v.cbm || null,
            v.id, shipmentId
          ]
        );
      }
    }

    // 2. 화주명 및 날짜 정보 조회
    const [shipments]: any = await pool.query('SELECT shipper, bl_number FROM shipments WHERE id = ?', [shipmentId]);
    if (shipments.length === 0) {
      return res.status(404).json({ success: false, message: '선적 정보를 찾을 수 없습니다.' });
    }
    const rawShipperName = shipments[0].shipper || '일반화주';
    const shipperName = rawShipperName.replace(/[^a-zA-Z0-9가-힣\s_-]/g, '').trim() || '일반화주';
    const finalBlNumber = blNumber || shipments[0].bl_number || 'UNKNOWN_BL';

    const dateObj = new Date();
    const year = dateObj.getFullYear().toString();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');

    const safeBlNumber = String(finalBlNumber).replace(/[^a-zA-Z0-9_-]/g, '_');

    // 3. 최종 저장 목적지: uploads/화주명/연/월/BL/
    const blTargetDir = path.join(__dirname, '../../uploads', shipperName, year, month, safeBlNumber);
    if (!fs.existsSync(blTargetDir)) {
      fs.mkdirSync(blTargetDir, { recursive: true });
    }

    // URL 변경 맵 (old relative url -> new relative url)
    const urlRemap = new Map<string, string>();

    // 파일을 BL 폴더의 하위 폴더(docs 또는 exterior)로 이동하는 헬퍼
    const moveFileToBL = (srcPath: string, originalRelUrl: string, sub: 'docs' | 'exterior') => {
      if (!fs.existsSync(srcPath)) return;
      const fileName = path.basename(srcPath);
      const subTargetDir = path.join(blTargetDir, sub);
      if (!fs.existsSync(subTargetDir)) {
        fs.mkdirSync(subTargetDir, { recursive: true });
      }

      const destPath = path.join(subTargetDir, fileName);
      // 중복 파일명 방지
      if (!fs.existsSync(destPath)) {
        fs.renameSync(srcPath, destPath);
      } else {
        fs.unlinkSync(srcPath); // 이미 동일 파일 있으면 삭제
      }
      const newRelUrl = `/uploads/${shipperName}/${year}/${month}/${safeBlNumber}/${sub}/${fileName}`;
      urlRemap.set(originalRelUrl, newRelUrl);
    };

    // 4. temp/BL/docs/ 및 temp/BL/exterior/ 파일을 BL/docs/ 및 BL/exterior/ 폴더로 그대로 이동
    const tempRoot = path.join(__dirname, '../../uploads', 'temp', safeBlNumber);
    for (const sub of ['docs', 'exterior'] as const) {
      const subDir = path.join(tempRoot, sub);
      if (fs.existsSync(subDir)) {
        for (const file of fs.readdirSync(subDir)) {
          const filePath = path.join(subDir, file);
          if (fs.statSync(filePath).isFile() && file.match(/\.(jpg|jpeg|png)$/i)) {
            const oldRelUrl = `/uploads/temp/${safeBlNumber}/${sub}/${file}`;
            moveFileToBL(filePath, oldRelUrl, sub);
          }
        }
        // 빈 하위 폴더 제거
        try { fs.rmdirSync(subDir); } catch (e) {}
      }
    }
    // temp/BL 루트 폴더 제거
    try { fs.rmdirSync(tempRoot); } catch (e) {}

    // 5. uploads/화주명/연/월/VIN/ 폴더의 파일도 BL/exterior/ 폴더로 이동 (차량 관련 사진이므로 exterior)
    const [allVehicles]: any = await pool.query(
      'SELECT id, vin, condition_photo_url, deregistration_photo_url, vin_photo_url FROM vehicles WHERE shipment_id = ?',
      [shipmentId]
    );

    for (const veh of allVehicles) {
      const vin = veh.vin;
      if (!vin) continue;
      const vinDir = path.join(__dirname, '../../uploads', shipperName, year, month, vin);
      if (fs.existsSync(vinDir)) {
        for (const file of fs.readdirSync(vinDir)) {
          const filePath = path.join(vinDir, file);
          if (fs.statSync(filePath).isFile() && file.match(/\.(jpg|jpeg|png)$/i)) {
            const oldRelUrl = `/uploads/${shipperName}/${year}/${month}/${vin}/${file}`;
            moveFileToBL(filePath, oldRelUrl, 'exterior');
          }
        }
        // 빈 VIN 폴더 제거
        try { fs.rmdirSync(vinDir); } catch (e) {}
      }

      // 6. DB의 각 사진 컬럼(condition, deregistration, vin) URL 경로 업데이트
      for (const col of ['condition_photo_url', 'deregistration_photo_url', 'vin_photo_url'] as const) {
        const val = veh[col];
        if (val) {
          let urls: string[] = [];
          try { urls = JSON.parse(val); } catch (e) { urls = [val]; }
          const updatedUrls = urls.map((u: string) => urlRemap.get(u) || u);
          if (JSON.stringify(urls) !== JSON.stringify(updatedUrls)) {
            await pool.query(`UPDATE vehicles SET ${col} = ? WHERE id = ?`, [JSON.stringify(updatedUrls), veh.id]);
          }
        }
      }
    }
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

    // 정규 폴더 내 파일인 경우 linked_ 및 analyzed_ 접두사를 모두 제거하여 미분류 사진함에 다시 노출
    if (relativeUrl.startsWith('/uploads/')) {
      const absolutePath = path.join(__dirname, '../../', relativeUrl);
      if (fs.existsSync(absolutePath)) {
        const dir = path.dirname(absolutePath);
        const fileName = path.basename(absolutePath);
        
        let cleanFileName = fileName;
        if (cleanFileName.startsWith('linked_')) {
          cleanFileName = cleanFileName.replace(/^linked_/, '');
        }
        if (cleanFileName.startsWith('analyzed_')) {
          cleanFileName = cleanFileName.replace(/^analyzed_/, '');
        }
        
        if (cleanFileName !== fileName) {
          const originalAbsolutePath = path.join(dir, cleanFileName);
          try {
            fs.renameSync(absolutePath, originalAbsolutePath);
            // 프론트엔드에 원래 URL로 복원 전달
            const restoredUrl = relativeUrl.replace(`/${fileName}`, `/${cleanFileName}`);
            return res.json({ success: true, message: '제거 완료', data: updatedUrls, restoredUrl });
          } catch (renameErr) {
            console.error('[removePhoto] rename from linked/analyzed failed:', renameErr);
          }
        }
      }
    }

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

    // 2. Commercial Invoice HTML 생성
    const invoiceHtml = `
      <html>
        <head>
          <meta charset="utf-8">
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap" rel="stylesheet">
          <style>
            body { font-family: 'Noto Sans KR', sans-serif; padding: 40px; color: #333; }
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
          <h1>COMMERCIAL INVOICE (상업 송장)</h1>
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
          
          <div class="section-title">VEHICLE PRICE LIST</div>
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
            Total Price: $${vehicles.reduce((sum: number, v: any) => sum + (v.price || 0), 0).toLocaleString()}
          </div>
        </body>
      </html>
    `;

    // 3. Packing List HTML 생성
    const packingHtml = `
      <html>
        <head>
          <meta charset="utf-8">
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap" rel="stylesheet">
          <style>
            body { font-family: 'Noto Sans KR', sans-serif; padding: 40px; color: #333; }
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
          <h1>PACKING LIST (포장 명세서)</h1>
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
          
          <div class="section-title">VEHICLE PACKING DETAILS</div>
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>VIN (차대번호)</th>
                <th>Make/Model (제조사/차명)</th>
                <th>Year (연식)</th>
                <th>Weight (KGS)</th>
                <th>Volume (CBM)</th>
              </tr>
            </thead>
            <tbody>
              ${vehicles.map((v: any, idx: number) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${v.vin}</td>
                  <td>${v.make || 'Unknown'} / ${v.model || 'Unknown'}</td>
                  <td>${v.year || ''}</td>
                  <td>${Number(v.weight || 0).toLocaleString()} KGS</td>
                  <td>${Number(v.cbm || 0).toFixed(2)} CBM</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div style="margin-top: 40px; display: flex; justify-content: flex-end; gap: 40px; font-weight: bold; font-size: 16px;">
            <div>Total Weight: ${vehicles.reduce((sum: number, v: any) => sum + Number(v.weight || 0), 0).toLocaleString()} KGS</div>
            <div>Total Volume: ${vehicles.reduce((sum: number, v: any) => sum + Number(v.cbm || 0), 0).toFixed(2)} CBM</div>
          </div>
        </body>
      </html>
    `;

    // 4. Puppeteer를 이용한 두 개의 PDF 파일 생성
    const pdfDir = path.join(__dirname, '../../uploads/pdf');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }
    const invoicePdfPath = path.join(pdfDir, `${blNumber}_invoice.pdf`);
    const packingPdfPath = path.join(pdfDir, `${blNumber}_packing.pdf`);

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    // Generate Invoice PDF
    const pageInvoice = await browser.newPage();
    await pageInvoice.setContent(invoiceHtml);
    await pageInvoice.pdf({ path: invoicePdfPath, format: 'A4', printBackground: true });
    
    // Generate Packing PDF
    const pagePacking = await browser.newPage();
    await pagePacking.setContent(packingHtml);
    await pagePacking.pdf({ path: packingPdfPath, format: 'A4', printBackground: true });

    await browser.close();

    const invoiceRelativeUrl = `/uploads/pdf/${blNumber}_invoice.pdf`;
    const packingRelativeUrl = `/uploads/pdf/${blNumber}_packing.pdf`;
    const invoiceAbsoluteUrl = `http://localhost:5000${invoiceRelativeUrl}`;
    const packingAbsoluteUrl = `http://localhost:5000${packingRelativeUrl}`;

    // 5. Kakao Talk 나에게 보내기 API를 사용하여 알림톡 발송
    const messageText = `[선적 서류 및 PDF 통지]\nB/L: ${blNumber}\n화주명: ${shipment.shipper || '일반화주'}\n차량 대수: ${vehicles.length}대\n\n상업송장(Invoice) 및 패킹리스트(Packing List) PDF 생성이 완료되었습니다. 아래 버튼 또는 서류보관함에서 각각 확인해 주세요.`;

    await axios.post(
      'https://kapi.kakao.com/v2/api/talk/memo/default/send',
      `template_object=${JSON.stringify({
        object_type: 'text',
        text: messageText,
        link: { web_url: invoiceAbsoluteUrl, mobile_web_url: invoiceAbsoluteUrl },
        button_title: 'PDF 상업송장 보기'
      })}`,
      {
        headers: {
          'Authorization': `Bearer ${userSession.kakaoToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    // 6. DB에 생성된 PDF 파일 경로 업데이트 (shipments 테이블)
    await pool.query(
      'UPDATE shipments SET invoice_file_path = ?, packing_list_file_path = ? WHERE id = ?',
      [invoiceRelativeUrl, packingRelativeUrl, shipmentId]
    );

    // 7. 실시간 소켓 알림 발송 (화주 룸 및 B/L 룸)
    let shipperId = null;
    if (shipment.booking_id) {
      const [bookings]: any = await pool.query('SELECT user_id FROM bookings WHERE id = ?', [shipment.booking_id]);
      if (bookings.length > 0) {
        shipperId = bookings[0].user_id;
      }
    }

    const io = req.app.get('io');
    if (shipperId) {
      io.to(`client_${shipperId}`).emit('pdf_generated_alert', {
        blNumber,
        shipperId,
        vesselName: shipment.vessel_name,
        message: `B/L [${blNumber}]의 상업송장 및 패킹리스트 PDF 서류가 발행되었습니다. 서류보관함에서 확인 및 승인해 주세요.`
      });
    }
    io.to(blNumber).emit('pdf_generated_alert', {
      blNumber,
      message: `상업송장 및 패킹리스트 PDF 서류가 발행되었습니다.`
    });

    res.json({ success: true, message: '상업송장/패킹리스트 PDF 분할 생성 및 카카오톡 전송 성공', data: { invoiceUrl: invoiceAbsoluteUrl, packingUrl: packingAbsoluteUrl } });
  } catch (error: any) {
    console.error('PDF 생성 및 전송 오류:', error);
    res.status(500).json({ success: false, message: 'PDF 생성 또는 카카오톡 전송 중 서버 오류: ' + (error.response?.data?.message || error.message) });
  }
};

export const approveDoc = async (req: Request, res: Response) => {
  const { blNumber, docType } = req.body;
  if (!blNumber || !['invoice', 'packing'].includes(docType)) {
    return res.status(400).json({ success: false, message: '부적절한 요청 매개변수입니다.' });
  }

  try {
    const columnName = docType === 'invoice' ? 'invoice_approved' : 'packing_approved';
    await pool.query(`UPDATE shipments SET ${columnName} = 1 WHERE bl_number = ?`, [blNumber]);

    // Check if both are now approved
    const [rows]: any = await pool.query('SELECT invoice_approved, packing_approved, status FROM shipments WHERE bl_number = ?', [blNumber]);
    if (rows.length > 0) {
      const { invoice_approved, packing_approved, status } = rows[0];
      if (invoice_approved === 1 && packing_approved === 1 && ['Pending Documents', 'Documents Uploaded'].includes(status)) {
        // Both approved, change status to 'Documents Verified'
        await pool.query('UPDATE shipments SET status = \'Documents Verified\' WHERE bl_number = ?', [blNumber]);

        // Update all pending vehicles to 'Trucking'
        const [shipmentRows]: any = await pool.query('SELECT id FROM shipments WHERE bl_number = ?', [blNumber]);
        if (shipmentRows.length > 0) {
          const shipmentId = shipmentRows[0].id;
          await pool.query("UPDATE vehicles SET status = 'Trucking' WHERE shipment_id = ? AND status = 'Pending'", [shipmentId]);
        }

        // Notify admin via Socket.io
        const io = req.app.get('io');
        io.to('admin').emit('shipment_status_changed', { blNumber, status: 'Documents Verified' });
        io.to(blNumber).emit('shipment_status_changed', { blNumber, status: 'Documents Verified' });
      }
    }

    return res.json({ success: true, message: '서류 승인 완료' });
  } catch (error: any) {
    console.error('approveDoc error:', error);
    return res.status(500).json({ success: false, message: '서류 승인 처리 중 에러 발생: ' + error.message });
  }
};

export const deleteDoc = async (req: Request, res: Response) => {
  const { blNumber, docType } = req.body;
  if (!blNumber || !['invoice', 'packing'].includes(docType)) {
    return res.status(400).json({ success: false, message: '부적절한 요청 매개변수입니다.' });
  }

  try {
    const filePathColumn = docType === 'invoice' ? 'invoice_file_path' : 'packing_list_file_path';
    const approvedColumn = docType === 'invoice' ? 'invoice_approved' : 'packing_approved';

    // Clear file path and approval state
    await pool.query(`UPDATE shipments SET ${filePathColumn} = NULL, ${approvedColumn} = 0 WHERE bl_number = ?`, [blNumber]);

    // Revert status to 'Pending Documents' if it was in 'Documents Uploaded' or 'Documents Verified'
    const [rows]: any = await pool.query('SELECT status FROM shipments WHERE bl_number = ?', [blNumber]);
    if (rows.length > 0) {
      const currentStatus = rows[0].status;
      if (['Documents Uploaded', 'Documents Verified'].includes(currentStatus)) {
        await pool.query('UPDATE shipments SET status = \'Pending Documents\' WHERE bl_number = ?', [blNumber]);

        // Notify via Socket.io
        const io = req.app.get('io');
        io.to('admin').emit('shipment_status_changed', { blNumber, status: 'Pending Documents' });
        io.to(blNumber).emit('shipment_status_changed', { blNumber, status: 'Pending Documents' });
      }
    }

    return res.json({ success: true, message: '서류 삭제 완료' });
  } catch (error: any) {
    console.error('deleteDoc error:', error);
    return res.status(500).json({ success: false, message: '서류 삭제 처리 중 에러 발생: ' + error.message });
  }
};

export const updateVehicleStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body; // 'Pending' | 'Trucking' | 'Yard In' | 'Loaded'

  if (!id || !status) {
    return res.status(400).json({ success: false, message: '차량 ID와 상태 값이 필요합니다.' });
  }

  try {
    // Get the vehicle and its shipment info
    const [vehicles]: any = await pool.query(
      'SELECT v.*, s.bl_number, s.vessel_name, s.booking_id, s.shipper FROM vehicles v JOIN shipments s ON v.shipment_id = s.id WHERE v.id = ?',
      [id]
    );
    if (vehicles.length === 0) {
      return res.status(404).json({ success: false, message: '차량을 찾을 수 없습니다.' });
    }
    const vehicle = vehicles[0];
    const shipmentId = vehicle.shipment_id;
    const blNumber = vehicle.bl_number;
    const vehicleModel = vehicle.model || vehicle.vin || '차량';

    // Update the vehicle's status
    await pool.query('UPDATE vehicles SET status = ? WHERE id = ?', [status, id]);

    // Find the user/shipper ID for alerts
    let shipperId = null;
    if (vehicle.booking_id) {
      const [bookings]: any = await pool.query('SELECT user_id FROM bookings WHERE id = ?', [vehicle.booking_id]);
      if (bookings.length > 0) {
        shipperId = bookings[0].user_id;
      }
    }

    const io = req.app.get('io');
    const isNewYard = status === 'Yard In' || status === 'Loaded';

    if (isNewYard) {
      // Check if this was the last vehicle to be yard-ed
      const [allShipmentVehicles]: any = await pool.query('SELECT id, status, model, vin FROM vehicles WHERE shipment_id = ?', [shipmentId]);

      const totalCount = allShipmentVehicles.length;
      const yardInOrLoadedCount = allShipmentVehicles.filter((v: any) => v.status === 'Yard In' || v.status === 'Loaded').length;

      if (totalCount > 0 && yardInOrLoadedCount === totalCount) {
        // THIS WAS THE LAST VEHICLE!
        // 1. Update shipment status to 'Gate In' (CY반입)
        await pool.query('UPDATE shipments SET status = \'Gate In\' WHERE id = ?', [shipmentId]);

        // 2. Emit status changed events (admin & client/B/L)
        const payload = { blNumber, status: 'Gate In', last_updated: new Date() };
        io.to('admin').emit('shipment_status_changed', payload);
        io.to(blNumber).emit('shipment_status_changed', payload);

        // 3. Send popup alert to shipper
        if (shipperId) {
          io.to(`client_${shipperId}`).emit('pdf_generated_alert', {
            blNumber,
            shipperId,
            message: `마지막 차량 [${vehicleModel}]을 포함한 모든 차량(${totalCount}대)이 야드에 반입(CY반입) 완료되었습니다.`
          });
        }

        // 4. Send KakaoTalk notification
        const userSession = (req as any).session?.user;
        if (userSession && userSession.kakaoToken) {
          const messageText = `[야드 반입 완료 통지]\nB/L: ${blNumber}\n선박명: ${vehicle.vessel_name || ''}\n\n마지막 차량 [${vehicleModel}]을 포함한 전체 차량 ${totalCount}대가 야드 반입(CY반입) 완료되었습니다.`;
          const relativeUrl = `/`; // Link to dashboard
          const absoluteUrl = `http://localhost:5000${relativeUrl}`;

          try {
            await axios.post(
              'https://kapi.kakao.com/v2/api/talk/memo/default/send',
              `template_object=${JSON.stringify({
                object_type: 'text',
                text: messageText,
                link: { web_url: absoluteUrl, mobile_web_url: absoluteUrl },
                button_title: '화물 트래킹 확인'
              })}`,
              {
                headers: {
                  'Authorization': `Bearer ${userSession.kakaoToken}`,
                  'Content-Type': 'application/x-www-form-urlencoded'
                }
              }
            );
          } catch (err) {
            console.error('야드 반입 카카오톡 전송 실패:', err);
          }
        }
      } else {
        // NOT the last vehicle. Just send alert to shipper menu (popup only)
        if (shipperId) {
          io.to(`client_${shipperId}`).emit('pdf_generated_alert', {
            blNumber,
            shipperId,
            message: `차량 [${vehicleModel}]이 야드에 반입 완료되었습니다. (진행률: ${yardInOrLoadedCount}/${totalCount}대)`
          });
        }
      }
    } else {
      // Reverted from Yard In to Trucking/Pending
      const [allShipmentVehicles]: any = await pool.query('SELECT id, status, model, vin FROM vehicles WHERE shipment_id = ?', [shipmentId]);
      const totalCount = allShipmentVehicles.length;
      const yardInOrLoadedCount = allShipmentVehicles.filter((v: any) => v.status === 'Yard In' || v.status === 'Loaded').length;

      // Get current shipment details
      const [shipments]: any = await pool.query('SELECT status FROM shipments WHERE id = ?', [shipmentId]);
      if (shipments.length > 0) {
        const currentShipmentStatus = shipments[0].status;
        if (currentShipmentStatus === 'Gate In') {
          // Revert shipment status back to 'Trucking' (트럭 운송)
          await pool.query('UPDATE shipments SET status = \'Trucking\' WHERE id = ?', [shipmentId]);

          // Emit status change socket event
          const payload = { blNumber, status: 'Trucking', last_updated: new Date() };
          io.to('admin').emit('shipment_status_changed', payload);
          io.to(blNumber).emit('shipment_status_changed', payload);

          // Send popup alert to shipper
          if (shipperId) {
            io.to(`client_${shipperId}`).emit('pdf_generated_alert', {
              blNumber,
              shipperId,
              message: `차량 [${vehicleModel}]의 야드반입이 취소되어 대시보드가 '트럭 운송' 상태로 복구되었습니다. (반입 진행률: ${yardInOrLoadedCount}/${totalCount}대)`
            });
          }
        } else {
          // Just notify the shipper that a vehicle status reverted, so progress rate updates
          if (shipperId) {
            io.to(`client_${shipperId}`).emit('pdf_generated_alert', {
              blNumber,
              shipperId,
              message: `차량 [${vehicleModel}]의 반입 상태가 취소되었습니다. (반입 진행률: ${yardInOrLoadedCount}/${totalCount}대)`
            });
          }
          // Emit a generic status change to trigger progress rate component re-fetch
          const payload = { blNumber, status: currentShipmentStatus, last_updated: new Date() };
          io.to(blNumber).emit('shipment_status_changed', payload);
        }
      }
    }

    return res.json({ success: true, message: '차량 상태 변경 완료' });
  } catch (error: any) {
    console.error('updateVehicleStatus error:', error);
    return res.status(500).json({ success: false, message: '서버 에러가 발생했습니다: ' + error.message });
  }
};

export const getVehicleSpecByVIN = async (req: Request, res: Response) => {
  const { vin } = req.params;
  const vinStr = typeof vin === 'string' ? vin : '';

  if (!vinStr || vinStr.length !== 17) {
    return res.status(400).json({ success: false, message: '올바른 17자리 차대번호를 입력해주세요.' });
  }

  const vinUpper = vinStr.toUpperCase();

  try {
    const SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY;
    let carData = null;

    if (SERVICE_KEY) {
      try {
        const apiUrl = `http://apis.data.go.kr/1611000/CarSpcifyInfoService/getCarSpecificationInfo`;
        const response = await axios.get(apiUrl, {
          params: {
            serviceKey: SERVICE_KEY,
            vin: vinUpper,
            type: 'json'
          },
          timeout: 4000
        });
        carData = response.data?.response?.body?.items?.item;
      } catch (apiErr: any) {
        console.warn('공공데이터 API 조회 실패, Fallback 모드로 전환:', apiErr.message);
      }
    }

    if (carData) {
      const lengthM = parseFloat(carData.length || 0) / 1000;
      const widthM = parseFloat(carData.width || 0) / 1000;
      const heightM = parseFloat(carData.height || 0) / 1000;
      const weightKg = parseFloat(carData.totWt || 0);
      const calculatedCbm = Math.round((lengthM * widthM * heightM) * 1000) / 1000;

      // Format firstRegDt YYYYMMDD -> YYYY-MM-DD
      let rawDt = carData.firstRegDt || '';
      let formattedDt = '2023-05-15';
      if (rawDt) {
        const cleaned = rawDt.replace(/\D/g, '');
        if (cleaned.length === 8) {
          formattedDt = `${cleaned.substring(0, 4)}-${cleaned.substring(4, 6)}-${cleaned.substring(6, 8)}`;
        } else {
          formattedDt = rawDt;
        }
      }

      return res.json({
        success: true,
        data: {
          vin: vinUpper,
          modelName: carData.carNm || '알 수 없는 모델',
          make: carData.carPrdNm || 'Hyundai/Kia',
          year: parseInt(carData.carYyyy || '2023', 10),
          initialRegistrationDate: formattedDt,
          dimensions: {
            length: parseInt(carData.length || '0'),
            width: parseInt(carData.width || '0'),
            height: parseInt(carData.height || '0')
          },
          weight: weightKg,
          cbm: calculatedCbm
        }
      });
    }

    // Fallback Mock Dictionary based on VIN prefixes
    let modelName = '아반떼 (AVANTE)';
    let make = 'HYUNDAI';
    let length = 4710;
    let width = 1825;
    let height = 1420;
    let weight = 1245;
    let year = 2022;
    let initialRegistrationDate = '2022-02-28';

    if (vinUpper.includes('KMH')) {
      modelName = '쏘나타 (SONATA)';
      make = 'HYUNDAI';
      length = 4900;
      width = 1860;
      height = 1445;
      weight = 1475;
      year = 2021;
      initialRegistrationDate = '2021-04-12';
    } else if (vinUpper.includes('KPT') || vinUpper.includes('KMF')) {
      modelName = '포터 (PORTER)';
      make = 'HYUNDAI';
      length = 5100;
      width = 1740;
      height = 1970;
      weight = 1895;
      year = 2000;
      initialRegistrationDate = '2000-11-10';
    } else if (vinUpper.includes('KNAD') || vinUpper.includes('KNAG')) {
      modelName = '카니발 (CARNIVAL)';
      make = 'KIA';
      length = 5155;
      width = 1995;
      height = 1775;
      weight = 2050;
      year = 2021;
      initialRegistrationDate = '2021-08-10';
    } else if (vinUpper.includes('KNA') || vinUpper.includes('KNE')) {
      modelName = '스포티지 (SPORTAGE)';
      make = 'KIA';
      length = 4660;
      width = 1865;
      height = 1660;
      weight = 1545;
      year = 2023;
      initialRegistrationDate = '2022-11-05';
    } else if (vinUpper.includes('KNM')) {
      modelName = '봉고 3 (BONGO III)';
      make = 'KIA';
      length = 5125;
      width = 1740;
      height = 1995;
      weight = 1930;
      year = 2020;
      initialRegistrationDate = '2020-07-15';
    }

    const lengthM = length / 1000;
    const widthM = width / 1000;
    const heightM = height / 1000;
    const calculatedCbm = Math.round((lengthM * widthM * heightM) * 1000) / 1000;

    return res.json({
      success: true,
      data: {
        vin: vinUpper,
        modelName,
        make,
        year,
        initialRegistrationDate,
        dimensions: { length, width, height },
        weight,
        cbm: calculatedCbm
      }
    });

  } catch (error: any) {
    console.error('getVehicleSpecByVIN error:', error);
    return res.status(500).json({ success: false, message: '서버 내부 오류 또는 외부 API 연동 실패: ' + error.message });
  }
};

export const updateVehicleSpecs = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { make, model, year, initial_registration_date, length, width, height, weight, cbm } = req.body;

  try {
    const updates: string[] = [];
    const params: any[] = [];

    if (make !== undefined) { updates.push('make = ?'); params.push(make); }
    if (model !== undefined) { updates.push('model = ?'); params.push(model); }
    if (year !== undefined) { updates.push('year = ?'); params.push(year); }
    if (initial_registration_date !== undefined) { updates.push('initial_registration_date = ?'); params.push(initial_registration_date); }
    if (length !== undefined) { updates.push('length = ?'); params.push(length); }
    if (width !== undefined) { updates.push('width = ?'); params.push(width); }
    if (height !== undefined) { updates.push('height = ?'); params.push(height); }
    if (weight !== undefined) { updates.push('weight = ?'); params.push(weight); }
    if (cbm !== undefined) { updates.push('cbm = ?'); params.push(cbm); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: '업데이트할 필드가 없습니다.' });
    }

    params.push(id);
    await pool.query(`UPDATE vehicles SET ${updates.join(', ')} WHERE id = ?`, params);

    return res.json({ success: true, message: '제원 저장 완료' });
  } catch (error) {
    console.error('updateVehicleSpecs error:', error);
    return res.status(500).json({ success: false, message: '제원 저장 중 서버 에러' });
  }
};
