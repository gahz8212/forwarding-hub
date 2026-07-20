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

    const { shipmentIds, clientId, exchangeRate } = req.body;
    if (!shipmentIds || !Array.isArray(shipmentIds) || shipmentIds.length === 0 || !clientId || !exchangeRate) {
      return res.status(400).json({ success: false, message: '필수 인자가 누락되었습니다.' });
    }

    // 1. Fetch vehicles of ALL selected shipments
    const placeholders = shipmentIds.map(() => '?').join(',');
    const [vehicles]: any = await pool.query(
      `SELECT vin, model, vehicle_type, inland_cost_krw, surcharge_cost_krw FROM vehicles WHERE shipment_id IN (${placeholders})`,
      shipmentIds
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
      cargo_type: mapVehicleTypeToCargoType(v.vehicle_type, v.model),
      inland_cost_krw: Number(v.inland_cost_krw) || 0,
      surcharge_cost_krw: Number(v.surcharge_cost_krw) || 0
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
      items,
      shipmentIds
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
      await connection.rollback();
      connection.release();
      return res.status(400).json({ success: false, message: '이미 존재하는 인보이스 번호입니다.' });
    }

    // Compute ocean KRW (floor) to store explicitly
    const total_ocean_krw = Math.floor(Number(total_ocean_usd) * Number(exchange_rate));

    // Re-calculate local total from items directly (do NOT trust frontend-sent totals)
    const resolvedBlFee = Number(bl_fee_krw) || 40000;
    const resolvedCustomsFee = Number(customs_fee_krw) || 33000;
    const items_local_sum = items.reduce((sum: number, item: any) => {
      return sum
        + Number(item.applied_lashing_krw || 0)
        + Number(item.applied_thc_krw || 0)
        + Number(item.applied_wharfage_krw || 0)
        + Number(item.applied_inland_krw || 0);
    }, 0);
    const verified_local_krw = items_local_sum + resolvedBlFee + resolvedCustomsFee;
    const verified_final_krw = total_ocean_krw + verified_local_krw;

    // Insert Invoice Master
    await connection.query(
      `INSERT INTO invoices 
        (invoice_no, client_id, bl_number, vessel_name, pol, pod, exchange_rate, total_ocean_usd, total_ocean_krw, total_local_krw, final_amount_krw, bl_fee_krw, customs_fee_krw, payment_status, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
      [
        invoice_no,
        client_id,
        bl_number || null,
        vessel_name,
        pol || '',
        pod || '',
        exchange_rate,
        total_ocean_usd,
        total_ocean_krw,
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
        (invoice_no, vin, model_name, cargo_type, applied_ocean_usd, applied_lashing_krw, applied_thc_krw, applied_wharfage_krw, applied_inland_krw)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        item.applied_wharfage_krw,
        item.applied_inland_krw || 0
      ]);
    }

    // Update shipments table's invoice details and link the invoice_no
    if (shipmentIds && Array.isArray(shipmentIds) && shipmentIds.length > 0) {
      const placeholders = shipmentIds.map(() => '?').join(',');
      await connection.query(
        `UPDATE shipments SET invoice_amount = ?, invoice_currency = 'KRW', is_paid = FALSE, invoice_no = ? WHERE id IN (${placeholders})`,
        [final_amount_krw, invoice_no, ...shipmentIds]
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

    // If client, restrict to their own client_id and ONLY show SENT invoices
    if (userSession.role === 'client') {
      const clientId = userSession.client_id;
      if (!clientId) {
        return res.json({ success: true, invoices: [] });
      }
      query += " WHERE i.client_id = ? AND i.publish_status = 'SENT'";
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

// DELETE /api/billing/invoices/:invoiceNo
export const deleteInvoice = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();
  try {
    const userSession = (req.session as any).user;
    if (!userSession || userSession.role !== 'admin') {
      return res.status(403).json({ success: false, message: '권한이 없습니다.' });
    }

    const { invoiceNo } = req.params;

    const [rows]: any = await connection.query('SELECT bl_number, payment_status FROM invoices WHERE invoice_no = ?', [invoiceNo]);
    if (rows.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: '인보이스를 찾을 수 없습니다.' });
    }

    const invoice = rows[0];
    if (invoice.payment_status === 'PAID') {
      connection.release();
      return res.status(400).json({ success: false, message: '이미 결제 완료된 정산서는 삭제할 수 없습니다. 결제 취소가 필요합니다.' });
    }

    const blNumber = invoice.bl_number;

    await connection.beginTransaction();

    await connection.query('DELETE FROM invoices WHERE invoice_no = ?', [invoiceNo]);

    // Revert shipment status by searching for linked invoice_no
    await connection.query(
      'UPDATE shipments SET invoice_amount = NULL, invoice_currency = NULL, is_paid = FALSE, invoice_no = NULL WHERE invoice_no = ?',
      [invoiceNo]
    );

    await connection.commit();
    res.json({ success: true, message: '정산서가 성공적으로 삭제되었습니다.' });
  } catch (error) {
    await connection.rollback();
    console.error('deleteInvoice error:', error);
    res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
  } finally {
    await connection.release();
  }
};

// PUT /api/billing/invoices/publish
export const publishInvoices = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();
  try {
    const userSession = (req.session as any).user;
    if (!userSession || userSession.role !== 'admin') {
      return res.status(403).json({ success: false, message: '권한이 없습니다.' });
    }

    const { invoiceNos } = req.body;
    if (!invoiceNos || !Array.isArray(invoiceNos) || invoiceNos.length === 0) {
      return res.status(400).json({ success: false, message: '인보이스를 선택해주세요.' });
    }

    const placeholders = invoiceNos.map(() => '?').join(',');

    // Fetch details of invoices to notify
    const [invoicesToPublish]: any = await connection.query(
      `SELECT invoice_no, client_id, bl_number, vessel_name, final_amount_krw FROM invoices WHERE invoice_no IN (${placeholders})`,
      invoiceNos
    );

    await connection.query(`UPDATE invoices SET publish_status = 'SENT' WHERE invoice_no IN (${placeholders})`, invoiceNos);

    // Send Real-time Socket Notification & KakaoTalk
    const io = req.app.get('io');
    for (const invoice of invoicesToPublish) {
      if (io && invoice.client_id) {
        io.to(`client_${invoice.client_id}`).emit('pdf_generated_alert', {
          blNumber: invoice.bl_number,
          shipperId: invoice.client_id,
          vesselName: invoice.vessel_name,
          message: `정산서 [${invoice.invoice_no}] (청구금액: ₩${Number(invoice.final_amount_krw).toLocaleString()})가 전송되었습니다. 정산 & 인보이스 메뉴에서 확인해 주세요.`
        });
      }

      if (userSession?.kakaoToken) {
        try {
          const messageText = `[정산서(데빗노트) 전송 알림]\nB/L 번호: ${invoice.bl_number || "-"}\n새로운 정산서가 발행 및 전송되었습니다.\n\n정산 번호: ${invoice.invoice_no}\n최종 청구 금액: ₩${Number(invoice.final_amount_krw).toLocaleString()}\n\n상세 내역은 화주 메뉴의 [정산 & 인보이스] 메뉴에서 확인해 주시기 바랍니다.`;
          
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
        } catch (kakaoErr: any) {
          console.error('KakaoTalk notification sending error (publish):', kakaoErr.message);
        }
      }
    }

    res.json({ success: true, message: '선택한 정산서가 화주에게 전송되었습니다.' });
  } catch (error) {
    console.error('publishInvoices error:', error);
    res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
  } finally {
    connection.release();
  }
};

// POST /api/billing/invoices/merge
export const mergeAndPublishInvoices = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();
  try {
    const userSession = (req.session as any).user;
    if (!userSession || userSession.role !== 'admin') {
      return res.status(403).json({ success: false, message: '권한이 없습니다.' });
    }

    const { invoiceNos, newInvoiceNo, dueDate } = req.body;
    if (!invoiceNos || !Array.isArray(invoiceNos) || invoiceNos.length === 0 || !newInvoiceNo || !dueDate) {
      return res.status(400).json({ success: false, message: '필수 값이 누락되었습니다.' });
    }

    const placeholders = invoiceNos.map(() => '?').join(',');
    const [oldInvoices]: any = await connection.query(
      `SELECT * FROM invoices WHERE invoice_no IN (${placeholders})`,
      invoiceNos
    );

    if (oldInvoices.length !== invoiceNos.length) {
      connection.release();
      return res.status(404).json({ success: false, message: '일부 인보이스를 찾을 수 없습니다.' });
    }

    const clientId = oldInvoices[0].client_id;
    const vesselName = oldInvoices[0].vessel_name;
    const pol = oldInvoices[0].pol;
    const pod = oldInvoices[0].pod;
    const exchangeRate = oldInvoices[0].exchange_rate;

    if (oldInvoices.some((i: any) => i.publish_status !== 'DRAFT' || i.client_id !== clientId)) {
      connection.release();
      return res.status(400).json({ success: false, message: '동일 화주의 임시(DRAFT) 정산서만 병합할 수 있습니다.' });
    }

    await connection.beginTransaction();

    let total_ocean_usd = 0;
    let total_ocean_krw = 0; // Sum of each invoice's already-floored ocean KRW
    let total_local_krw = 0;
    let bl_fee_krw = 0;
    let customs_fee_krw = 0;

    for (const inv of oldInvoices) {
      total_ocean_usd += Number(inv.total_ocean_usd);
      // Use stored total_ocean_krw if available, otherwise floor-calculate per invoice
      total_ocean_krw += Number(inv.total_ocean_krw) || Math.floor(Number(inv.total_ocean_usd) * Number(inv.exchange_rate));
      total_local_krw += Number(inv.total_local_krw);
      bl_fee_krw += Number(inv.bl_fee_krw);
      customs_fee_krw += Number(inv.customs_fee_krw);
    }

    // final_amount = sum of each invoice's ocean_krw (already floored) + total_local
    const final_amount_krw = total_ocean_krw + total_local_krw;

    const [shipments]: any = await connection.query(
      `SELECT bl_number FROM shipments WHERE invoice_no IN (${placeholders})`,
      invoiceNos
    );
    const blNumbers = shipments.map((s: any) => s.bl_number).filter(Boolean);
    const combinedBlString = blNumbers.length > 1 ? `${blNumbers[0]} 외 ${blNumbers.length - 1}건` : blNumbers[0] || "";

    await connection.query(`
      INSERT INTO invoices (invoice_no, client_id, publish_status, bl_number, vessel_name, pol, pod, exchange_rate, total_ocean_usd, total_ocean_krw, total_local_krw, final_amount_krw, bl_fee_krw, customs_fee_krw, due_date)
      VALUES (?, ?, 'SENT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [newInvoiceNo, clientId, combinedBlString, vesselName, pol, pod, exchangeRate, total_ocean_usd, total_ocean_krw, total_local_krw, final_amount_krw, bl_fee_krw, customs_fee_krw, dueDate]);

    await connection.query(`UPDATE invoice_items SET invoice_no = ? WHERE invoice_no IN (${placeholders})`, [newInvoiceNo, ...invoiceNos]);
    await connection.query(`UPDATE shipments SET invoice_no = ? WHERE invoice_no IN (${placeholders})`, [newInvoiceNo, ...invoiceNos]);
    await connection.query(`DELETE FROM invoices WHERE invoice_no IN (${placeholders})`, invoiceNos);

    await connection.commit();

    // Send Real-time Socket Notification & KakaoTalk for merged invoice
    const io = req.app.get('io');
    if (io && clientId) {
      io.to(`client_${clientId}`).emit('pdf_generated_alert', {
        blNumber: combinedBlString,
        shipperId: clientId,
        vesselName: vesselName,
        message: `합계 정산서 [${newInvoiceNo}] (청구금액: ₩${Number(final_amount_krw).toLocaleString()})가 전송되었습니다. 정산 & 인보이스 메뉴에서 확인해 주세요.`
      });
    }

    if (userSession?.kakaoToken) {
      try {
        const messageText = `[합계 정산서(데빗노트) 전송 알림]\nB/L 번호: ${combinedBlString}\n여러 건의 정산서가 합산되어 발행 및 전송되었습니다.\n\n합계 정산 번호: ${newInvoiceNo}\n최종 청구 금액: ₩${Number(final_amount_krw).toLocaleString()}\n\n상세 내역은 화주 메뉴의 [정산 & 인보이스] 메뉴에서 확인해 주시기 바랍니다.`;
        
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
      } catch (kakaoErr: any) {
        console.error('KakaoTalk notification sending error (merge):', kakaoErr.message);
      }
    }

    res.json({ success: true, message: '성공적으로 병합 및 전송되었습니다.' });
  } catch (error) {
    await connection.rollback();
    console.error('mergeAndPublishInvoices error:', error);
    res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
  } finally {
    connection.release();
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
