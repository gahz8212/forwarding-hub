import { Request, Response } from 'express';
import pool from '../config/db';

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
