import { Request, Response } from 'express';
import axios from 'axios';
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

export const requestBooking = async (req: Request, res: Response) => {
  const { schedule } = req.body;
  const userSession = (req.session as any).user;

  if (!userSession) {
    return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
  }

  if (!userSession.kakaoToken) {
    return res.status(403).json({ success: false, message: "카카오 로그인이 필요합니다. (카카오로 로그인해야 테스트 발송이 가능합니다)" });
  }

  try {
    await axios.post(
      'https://kapi.kakao.com/v2/api/talk/memo/default/send',
      `template_object={
        "object_type": "text",
        "text": "[부킹 요청 완료]\\n선박명: ${schedule.vessel_name}\\n경로: ${schedule.pol} ➔ ${schedule.pod}\\n일정: ${schedule.etd.split('T')[0]} ~ ${schedule.eta.split('T')[0]}",
        "link": { "web_url": "http://localhost:5173" },
        "button_title": "대시보드 확인"
      }`,
      {
        headers: {
          'Authorization': `Bearer ${userSession.kakaoToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    res.json({ success: true, message: "부킹 완료 및 카카오톡 알림이 발송되었습니다." });
  } catch (error) {
    console.error("카카오톡 발송 실패:", error);
    res.status(500).json({ success: false, message: "부킹은 완료되었으나 알림톡 발송에 실패했습니다." });
  }
};
