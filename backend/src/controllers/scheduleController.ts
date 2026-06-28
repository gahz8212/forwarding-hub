import { Request, Response } from 'express';
import pool from '../config/db';

export const getUniquePods = async (req: Request, res: Response) => {
  try {
    const [rows]: any = await pool.query('SELECT DISTINCT pod FROM schedules ORDER BY pod ASC');
    const pods = rows.map((row: any) => row.pod);
    res.json({ success: true, data: pods });
  } catch (error) {
    console.error('POD 조회 에러:', error);
    res.status(500).json({ success: false, message: '도착항 목록을 가져오는 중 에러가 발생했습니다.' });
  }
};

export const searchSchedules = async (req: Request, res: Response) => {
  const { pod, cbm, weight } = req.query;

  try {
    let query = 'SELECT * FROM schedules WHERE 1=1';
    const params: any[] = [];

    // 목적지 필터
    if (pod) {
      query += ' AND pod LIKE ?';
      params.push(`%${pod}%`);
    }

    // 가용 CBM 체크
    if (cbm) {
      query += ' AND available_cbm >= ?';
      params.push(Number(cbm));
    }

    // 가용 무게 체크
    if (weight) {
      query += ' AND available_weight >= ?';
      params.push(Number(weight));
    }

    // 무작위로 정렬하여 최대 5개 반환
    query += ' ORDER BY RAND() LIMIT 5';

    const [rows]: any = await pool.query(query, params);

    res.json({
      success: true,
      message: '조건에 맞는 선박 스케줄을 검색했습니다.',
      data: rows
    });

  } catch (error) {
    console.error('스케줄 검색 에러:', error);
    res.status(500).json({ success: false, message: '스케줄 검색 중 에러가 발생했습니다.' });
  }
};
