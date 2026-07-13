import { Request, Response } from 'express';
import pool from '../config/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export const getDispatchVehicles = async (req: Request, res: Response): Promise<void> => {
  try {
    const connection = await pool.getConnection();
    
    // Join vehicles with shipments to get B/L and destination info
    const query = `
      SELECT 
        v.*,
        s.bl_number,
        s.pod,
        s.vessel_name
      FROM vehicles v
      JOIN shipments s ON v.shipment_id = s.id
      ORDER BY v.id DESC
    `;
    
    const [rows] = await connection.query<RowDataPacket[]>(query);
    connection.release();
    
    res.json(rows);
  } catch (error) {
    console.error('Error fetching dispatch vehicles:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const assignDispatch = async (req: Request, res: Response): Promise<void> => {
  const { 
    vins, 
    dispatch_method, 
    carrier_company, 
    truck_plate_number, 
    truck_driver_phone, 
    dispatch_date, 
    inland_cost_krw, 
    surcharge_cost_krw 
  } = req.body;

  if (!vins || !Array.isArray(vins) || vins.length === 0) {
    res.status(400).json({ error: 'VIN 리스트가 필요합니다.' });
    return;
  }

  try {
    const connection = await pool.getConnection();
    
    const query = `
      UPDATE vehicles 
      SET 
        dispatch_method = ?,
        dispatch_status = 'DISPATCHED',
        carrier_company = ?,
        truck_plate_number = ?,
        truck_driver_phone = ?,
        dispatch_date = ?,
        inland_cost_krw = ?,
        surcharge_cost_krw = ?
      WHERE vin IN (?)
    `;
    
    const [result] = await connection.query<ResultSetHeader>(query, [
      dispatch_method,
      carrier_company || null,
      truck_plate_number || null,
      truck_driver_phone || null,
      dispatch_date || null,
      inland_cost_krw || 0,
      surcharge_cost_krw || 0,
      vins
    ]);
    
    connection.release();
    
    res.json({ message: '배차 정보가 일괄 등록되었습니다.', affectedRows: result.affectedRows });
  } catch (error) {
    console.error('Error assigning dispatch:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const updateVehicleDispatch = async (req: Request, res: Response): Promise<void> => {
  const { vin } = req.params;
  const { 
    dispatch_method,
    dispatch_status,
    carrier_company, 
    truck_plate_number, 
    truck_driver_phone, 
    dispatch_date, 
    inland_cost_krw, 
    surcharge_cost_krw 
  } = req.body;

  try {
    const connection = await pool.getConnection();
    
    const query = `
      UPDATE vehicles 
      SET 
        dispatch_method = COALESCE(?, dispatch_method),
        dispatch_status = COALESCE(?, dispatch_status),
        carrier_company = COALESCE(?, carrier_company),
        truck_plate_number = COALESCE(?, truck_plate_number),
        truck_driver_phone = COALESCE(?, truck_driver_phone),
        dispatch_date = COALESCE(?, dispatch_date),
        inland_cost_krw = COALESCE(?, inland_cost_krw),
        surcharge_cost_krw = COALESCE(?, surcharge_cost_krw)
      WHERE vin = ?
    `;
    
    const [result] = await connection.query<ResultSetHeader>(query, [
      dispatch_method,
      dispatch_status,
      carrier_company,
      truck_plate_number,
      truck_driver_phone,
      dispatch_date,
      inland_cost_krw,
      surcharge_cost_krw,
      vin
    ]);
    
    connection.release();
    
    if (result.affectedRows === 0) {
       res.status(404).json({ error: '차량을 찾을 수 없습니다.' });
       return;
    }

    res.json({ message: '차량 배차 정보가 성공적으로 업데이트되었습니다.' });
  } catch (error) {
    console.error('Error updating vehicle dispatch:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
