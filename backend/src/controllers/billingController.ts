import { Request, Response } from 'express';
import axios from 'axios';
import pool from '../config/db';
import { calculateSafeInvoice, mapVehicleTypeToCargoType } from '../services/billingService';

// GET /api/billing/clients
export const getClients = async (req: Request, res: Response) => {
  try {
    const userSession = (req.session as any).user;
    if (!userSession) {
      return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }

    const [rows] = await pool.query('SELECT * FROM clients ORDER BY created_at DESC');
    res.json({ success: true, clients: rows });
  } catch (error) {
    console.error('getClients error:', error);
    res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
  }
};

// POST /api/billing/clients
export const saveClient = async (req: Request, res: Response) => {
  try {
    const userSession = (req.session as any).user;
    if (!userSession || userSession.role !== 'admin') {
      return res.status(403).json({ success: false, message: '권한이 없습니다.' });
    }

    const {
      client_id,
      client_name,
      margin_type,
      ocean_margin_rate,
      local_margin_rate,
      fixed_margin_per_unit
    } = req.body;

    if (!client_id || !client_name || !margin_type) {
      return res.status(400).json({ success: false, message: '필수 값이 누락되었습니다.' });
    }

    const query = `
      INSERT INTO clients (client_id, client_name, margin_type, ocean_margin_rate, local_margin_rate, fixed_margin_per_unit)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        client_name = ?,
        margin_type = ?,
        ocean_margin_rate = ?,
        local_margin_rate = ?,
        fixed_margin_per_unit = ?
    `;

    await pool.query(query, [
      client_id,
      client_name,
      margin_type,
      ocean_margin_rate || 0,
      local_margin_rate || 0,
      fixed_margin_per_unit || 0,
      client_name,
      margin_type,
      ocean_margin_rate || 0,
      local_margin_rate || 0,
      fixed_margin_per_unit || 0
    ]);

    const io = req.app.get('io');
    if (io) {
      io.emit('billing_settings_changed', { type: 'client' });
    }

    res.json({ success: true, message: '화주 마진 설정이 저장되었습니다.' });
  } catch (error) {
    console.error('saveClient error:', error);
    res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
  }
};

// GET /api/billing/costs
export const getCostRates = async (req: Request, res: Response) => {
  try {
    const userSession = (req.session as any).user;
    if (!userSession) {
      return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }

    const [rows] = await pool.query('SELECT * FROM cost_rates ORDER BY cargo_type');
    res.json({ success: true, costRates: rows });
  } catch (error) {
    console.error('getCostRates error:', error);
    res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
  }
};

// POST /api/billing/costs
export const saveCostRates = async (req: Request, res: Response) => {
  try {
    const userSession = (req.session as any).user;
    if (!userSession || userSession.role !== 'admin') {
      return res.status(403).json({ success: false, message: '권한이 없습니다.' });
    }

    const { rates } = req.body;
    if (!Array.isArray(rates)) {
      return res.status(400).json({ success: false, message: '잘못된 형식입니다.' });
    }

    const query = `
      INSERT INTO cost_rates (cargo_type, ocean_cost_usd, lashing_cost_krw, thc_cost_krw, wharfage_cost_krw, bl_fee_krw, customs_cost_krw)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        ocean_cost_usd = ?,
        lashing_cost_krw = ?,
        thc_cost_krw = ?,
        wharfage_cost_krw = ?,
        bl_fee_krw = ?,
        customs_cost_krw = ?
    `;

    for (const rate of rates) {
      await pool.query(query, [
        rate.cargo_type,
        rate.ocean_cost_usd,
        rate.lashing_cost_krw,
        rate.thc_cost_krw,
        rate.wharfage_cost_krw,
        rate.bl_fee_krw,
        rate.customs_cost_krw,
        rate.ocean_cost_usd,
        rate.lashing_cost_krw,
        rate.thc_cost_krw,
        rate.wharfage_cost_krw,
        rate.bl_fee_krw,
        rate.customs_cost_krw
      ]);
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('billing_settings_changed', { type: 'cost' });
    }

    res.json({ success: true, message: '선사 기준 원가 단가가 저장되었습니다.' });
  } catch (error) {
    console.error('saveCostRates error:', error);
    res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
  }
};

// POST /api/billing/invoices/calculate
export const calculateInvoice = async (req: Request, res: Response) => {
  try {
    const userSession = (req.session as any).user;
    if (!userSession) {
      return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }

    const { shipmentId, clientId, exchangeRate } = req.body;
    if (!shipmentId || !clientId || !exchangeRate) {
      return res.status(400).json({ success: false, message: '필수 인자가 누락되었습니다.' });
    }

    // 1. Fetch vehicles of this shipment
    const [vehicles]: any = await pool.query(
      'SELECT vin, model, vehicle_type FROM vehicles WHERE shipment_id = ?',
      [shipmentId]
    );

    if (vehicles.length === 0) {
      return res.status(400).json({ success: false, message: '해당 선적건에 등록된 차량이 없습니다.' });
    }

    // 2. Fetch client margin settings
    const [clientRows]: any = await pool.query(
      'SELECT * FROM clients WHERE client_id = ?',
      [clientId]
    );

    if (clientRows.length === 0) {
      return res.status(400).json({ success: false, message: '해당 화주의 마진 설정을 찾을 수 없습니다.' });
    }
    const clientMargin = clientRows[0];

    // 3. Fetch cost rates
    const [costRates]: any = await pool.query(
      'SELECT * FROM cost_rates WHERE is_active = 1'
    );

    // 4. Map and build car list
    const carList = vehicles.map((v: any) => ({
      vin: v.vin,
      model_name: v.model || 'Unknown',
      cargo_type: mapVehicleTypeToCargoType(v.vehicle_type, v.model)
    }));

    // 5. Calculate
    const calcResult = calculateSafeInvoice(
      carList,
      clientMargin,
      costRates,
      String(exchangeRate)
    );

    res.json({
      success: true,
      data: calcResult
    });
  } catch (error: any) {
    console.error('calculateInvoice error:', error);
    res.status(500).json({ success: false, message: error.message || '서버 에러가 발생했습니다.' });
  }
};

// POST /api/billing/invoices
export const createInvoice = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();
  try {
    const userSession = (req.session as any).user;
    if (!userSession || userSession.role !== 'admin') {
      return res.status(403).json({ success: false, message: '권한이 없습니다.' });
    }

    const {
      invoice_no,
      client_id,
      bl_number,
      vessel_name,
      pol,
      pod,
      exchange_rate,
      total_ocean_usd,
      total_local_krw,
      final_amount_krw,
      bl_fee_krw,
      customs_fee_krw,
      due_date,
      items
    } = req.body;

    if (!invoice_no || !client_id || !vessel_name || !exchange_rate || !final_amount_krw || !due_date || !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: '필수 값이 누락되었습니다.' });
    }

    await connection.beginTransaction();

    // Check if invoice_no already exists
    const [existing]: any = await connection.query(
      'SELECT invoice_no FROM invoices WHERE invoice_no = ?',
      [invoice_no]
    );

    if (existing.length > 0) {
      connection.release();
      return res.status(400).json({ success: false, message: '이미 존재하는 인보이스 번호입니다.' });
    }

    // Insert Invoice Master
    await connection.query(
      `INSERT INTO invoices 
        (invoice_no, client_id, bl_number, vessel_name, pol, pod, exchange_rate, total_ocean_usd, total_local_krw, final_amount_krw, bl_fee_krw, customs_fee_krw, payment_status, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
      [
        invoice_no,
        client_id,
        bl_number || null,
        vessel_name,
        pol || '',
        pod || '',
        exchange_rate,
        total_ocean_usd,
        total_local_krw,
        final_amount_krw,
        bl_fee_krw || 40000,
        customs_fee_krw || 33000,
        due_date
      ]
    );

    // Insert Items
    const itemQuery = `
      INSERT INTO invoice_items 
        (invoice_no, vin, model_name, cargo_type, applied_ocean_usd, applied_lashing_krw, applied_thc_krw, applied_wharfage_krw)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const item of items) {
      await connection.query(itemQuery, [
        invoice_no,
        item.vin,
        item.model_name,
        item.cargo_type,
        item.applied_ocean_usd,
        item.applied_lashing_krw,
        item.applied_thc_krw,
        item.applied_wharfage_krw
      ]);
    }

    // Update shipments table's invoice_amount and is_paid if bl_number is provided
    if (bl_number) {
      await connection.query(
        'UPDATE shipments SET invoice_amount = ?, invoice_currency = "KRW", is_paid = FALSE WHERE bl_number = ?',
        [final_amount_krw, bl_number]
      );
    }

    await connection.commit();
    res.json({ success: true, message: '인보이스가 정상적으로 작성 및 저장되었습니다.' });
  } catch (error) {
    await connection.rollback();
    console.error('createInvoice error:', error);
    res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
  } finally {
    connection.release();
  }
};

// GET /api/billing/invoices
export const getInvoices = async (req: Request, res: Response) => {
  try {
    const userSession = (req.session as any).user;
    if (!userSession) {
      return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }

    let query = `
      SELECT i.*, c.client_name 
      FROM invoices i 
      JOIN clients c ON i.client_id = c.client_id
    `;
    const params: any[] = [];

    // If client, restrict to their own client_id
    if (userSession.role === 'client') {
      const clientId = userSession.client_id;
      if (!clientId) {
        return res.json({ success: true, invoices: [] });
      }
      query += ' WHERE i.client_id = ?';
      params.push(clientId);
    }

    query += ' ORDER BY i.created_at DESC';

    const [rows] = await pool.query(query, params);
    res.json({ success: true, invoices: rows });
  } catch (error) {
    console.error('getInvoices error:', error);
    res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
  }
};

// GET /api/billing/invoices/:invoiceNo
export const getInvoiceDetail = async (req: Request, res: Response) => {
  try {
    const userSession = (req.session as any).user;
    if (!userSession) {
      return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }

    const { invoiceNo } = req.params;

    // Fetch master
    const [masters]: any = await pool.query(
      `SELECT i.*, c.client_name, c.margin_type, c.ocean_margin_rate, c.local_margin_rate, c.fixed_margin_per_unit
       FROM invoices i 
       JOIN clients c ON i.client_id = c.client_id
       WHERE i.invoice_no = ?`,
      [invoiceNo]
    );

    if (masters.length === 0) {
      return res.status(404).json({ success: false, message: '인보이스를 찾을 수 없습니다.' });
    }

    const master = masters[0];

    // If client, check ownership
    if (userSession.role === 'client' && master.client_id !== userSession.client_id) {
      return res.status(403).json({ success: false, message: '권한이 없습니다.' });
    }

    // Fetch items
    const [items]: any = await pool.query(
      'SELECT * FROM invoice_items WHERE invoice_no = ? ORDER BY id',
      [invoiceNo]
    );

    res.json({
      success: true,
      invoice: master,
      items
    });
  } catch (error) {
    console.error('getInvoiceDetail error:', error);
    res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
  }
};

// POST /api/billing/invoices/:invoiceNo/pay
export const payInvoice = async (req: Request, res: Response) => {
  try {
    const userSession = (req.session as any).user;
    if (!userSession || userSession.role !== 'admin') {
      return res.status(403).json({ success: false, message: '권한이 없습니다.' });
    }

    const { invoiceNo } = req.params;

    const [rows]: any = await pool.query('SELECT bl_number FROM invoices WHERE invoice_no = ?', [invoiceNo]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '인보이스를 찾을 수 없습니다.' });
    }
    const blNumber = rows[0].bl_number;

    await pool.query(
      'UPDATE invoices SET payment_status = "PAID" WHERE invoice_no = ?',
      [invoiceNo]
    );

    if (blNumber) {
      await pool.query(
        'UPDATE shipments SET is_paid = TRUE WHERE bl_number = ?',
        [blNumber]
      );
    }

    res.json({ success: true, message: '결제 완료 처리되었습니다.' });
  } catch (error) {
    console.error('payInvoice error:', error);
    res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
  }
};

// GET /api/billing/exchange-rate
export const getLatestExchangeRate = async (req: Request, res: Response) => {
  try {
    const userSession = (req.session as any).user;
    if (!userSession) {
      return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }

    try {
      // 1. Try ExchangeRate-API free endpoint first
      const response = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 4000 });
      const krwRate = response.data.rates?.KRW;
      if (krwRate) {
        return res.json({ success: true, rate: Math.round(krwRate * 100) / 100 });
      }
    } catch (e: any) {
      console.warn('ExchangeRate-API failed, trying Frankfurter:', e.message);
    }

    try {
      // 2. Fallback to Frankfurter API
      const frankResponse = await axios.get('https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW', { timeout: 4000 });
      const frankRate = frankResponse.data.rates?.KRW;
      if (frankRate) {
        return res.json({ success: true, rate: Math.round(frankRate * 100) / 100 });
      }
    } catch (e: any) {
      console.warn('Frankfurter API failed:', e.message);
    }

    res.status(500).json({ success: false, message: '환율 정보를 가져오지 못했습니다.' });
  } catch (error: any) {
    console.error('getLatestExchangeRate error:', error.message);
    res.status(500).json({ success: false, message: '환율 API 호출에 실패했습니다.' });
  }
};
