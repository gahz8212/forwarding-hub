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

  try {
    // 1. DB에 부킹 기록 추가
    const [result]: any = await pool.query(
      'INSERT INTO bookings (user_id, schedule_id, status) VALUES (?, ?, ?)',
      [userSession.id, schedule.id, 'Pending']
    );
    const bookingId = result.insertId;

    // Socket.io 실시간 알림 전송 (관리자 대상인 포워더에게 전달)
    const io = req.app.get('io');
    if (io) {
      io.to('admin').emit('new_booking_alert', {
        id: bookingId, // DB 인서트된 부킹 ID 전달
        username: userSession.username,
        vessel_name: schedule.vessel_name,
        pol: schedule.pol,
        pod: schedule.pod,
        etd: schedule.etd,
        eta: schedule.eta
      });
    }

    res.json({ success: true, message: "부킹 요청이 접수되었습니다. 포워더가 검토 후 카톡으로 알림을 드릴 예정입니다." });
  } catch (error) {
    console.error("부킹 요청 에러:", error);
    res.status(500).json({ success: false, message: "부킹 요청 중 에러가 발생했습니다." });
  }
};

export const approveBooking = async (req: Request, res: Response) => {
  const { bookingDetails } = req.body;
  const userSession = (req.session as any).user;

  if (!userSession) {
    return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
  }

  if (!userSession.kakaoToken) {
    return res.status(403).json({ success: false, message: "카카오 로그인이 필요합니다. (포워더가 카카오로 로그인해야 카톡 알림 발송이 가능합니다)" });
  }

  try {
    // 1. DB의 부킹 상태를 'Confirmed'로 업데이트
    await pool.query(
      'UPDATE bookings SET status = ? WHERE id = ?',
      ['Confirmed', bookingDetails.id]
    );

    // 2. 부킹 승인과 동시에 전체 화물/선적 관리(shipments) 테이블에 데이터 자동 생성
    const cleanDate = (dateVal: any) => {
      if (!dateVal) return null;
      if (typeof dateVal === 'string') return dateVal.split('T')[0];
      if (dateVal instanceof Date) return dateVal.toISOString().split('T')[0];
      return dateVal;
    };

    const blNumber = `KMTC${Math.floor(10000000 + Math.random() * 90000000)}`;
    const invoiceAmount = (1000 + Math.random() * 2000).toFixed(2); // 임의 청구 금액 $1000 ~ $3000

    await pool.query(`
      INSERT INTO shipments (bl_number, booking_id, shipper, vessel_name, status, pol, pod, etd, eta, doc_closing_date, cargo_closing_date, invoice_amount, invoice_currency, is_paid)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', FALSE)
    `, [
      blNumber,
      bookingDetails.id,
      bookingDetails.shipper || '일반 화주',
      bookingDetails.vessel_name,
      'Pending Documents', // 변경: 입고 전 최초 단계인 서류 대기 상태로 설정
      bookingDetails.pol,
      bookingDetails.pod,
      cleanDate(bookingDetails.etd),
      cleanDate(bookingDetails.eta),
      bookingDetails.doc_closing_date ? cleanDate(bookingDetails.doc_closing_date) + ' 09:00:00' : null,
      bookingDetails.cargo_closing_date ? cleanDate(bookingDetails.cargo_closing_date) + ' 09:00:00' : null,
      invoiceAmount
    ]);

    // 3. 포워더가 예약을 승인하였으므로 화주에게 카카오톡 알림톡 전송
    await axios.post(
      'https://kapi.kakao.com/v2/api/talk/memo/default/send',
      `template_object={
        "object_type": "text",
        "text": "[부킹 승인 완료]\\n선박명: ${bookingDetails.vessel_name}\\n경로: ${bookingDetails.pol.split(',')[0]} ➔ ${bookingDetails.pod.split(',')[0]}\\n일정: ${cleanDate(bookingDetails.etd)} ~ ${cleanDate(bookingDetails.eta)}",
        "link": { "web_url": "http://localhost:5173" },
        "button_title": "내 화물 확인"
      }`,
      {
        headers: {
          'Authorization': `Bearer ${userSession.kakaoToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    res.json({ success: true, message: `부킹이 최종 승인되어 B/L 번호(${blNumber})로 신규 선적이 등록되었으며, 카카오톡 알림이 발송되었습니다.` });
  } catch (error: any) {
    console.error("카카오톡 발송 실패:", error.response?.data || error.message);
    const detail = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    res.status(500).json({ success: false, message: `부킹 승인은 완료되었으나 알림톡 발송에 실패했습니다. (상세 에러: ${detail})` });
  }
};

// 화주용 부킹 요청 목록 조회
export const getClientBookings = async (req: Request, res: Response) => {
  const userSession = (req.session as any).user;

  if (!userSession) {
    return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
  }

  try {
    const [rows]: any = await pool.query(`
      SELECT b.id, b.status, b.created_at, s.vessel_name, s.pol, s.pod, s.etd, s.eta, s.available_cbm, s.available_weight, s.doc_closing_date, s.cargo_closing_date, sh.bl_number
      FROM bookings b
      JOIN schedules s ON b.schedule_id = s.id
      LEFT JOIN shipments sh ON sh.booking_id = b.id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
    `, [userSession.id]);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("화주 부킹 목록 조회 에러:", error);
    res.status(500).json({ success: false, message: "부킹 내역을 가져오는데 실패했습니다." });
  }
};

// 어드민용 전체 부킹 요청 목록 조회
export const getAdminBookings = async (req: Request, res: Response) => {
  const userSession = (req.session as any).user;

  if (!userSession) {
    return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
  }

  if (userSession.role !== 'admin') {
    return res.status(403).json({ success: false, message: "관리자 권한이 필요합니다." });
  }

  try {
    const [rows]: any = await pool.query(`
      SELECT b.id, b.status, b.created_at, u.username as shipper, s.vessel_name, s.pol, s.pod, s.etd, s.eta, s.available_cbm, s.available_weight, s.doc_closing_date, s.cargo_closing_date, sh.bl_number
      FROM bookings b
      JOIN schedules s ON b.schedule_id = s.id
      JOIN users u ON b.user_id = u.id
      LEFT JOIN shipments sh ON sh.booking_id = b.id
      ORDER BY b.created_at DESC
    `);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("어드민 부킹 목록 조회 에러:", error);
    res.status(500).json({ success: false, message: "전체 부킹 내역을 가져오는데 실패했습니다." });
  }
};

export const getBookingMessages = async (req: Request, res: Response) => {
  const { bookingId } = req.params;
  const userSession = (req.session as any).user;

  if (!userSession) {
    return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
  }

  try {
    // 1. 보안 검증: 화주(client)의 경우 본인의 예약 건만 조회 가능
    if (userSession.role === 'client') {
      const [bookingRows]: any = await pool.query(
        'SELECT user_id FROM bookings WHERE id = ?',
        [bookingId]
      );
      if (bookingRows.length === 0) {
        return res.status(404).json({ success: false, message: "해당 예약 내역을 찾을 수 없습니다." });
      }
      if (bookingRows[0].user_id !== userSession.id) {
        return res.status(403).json({ success: false, message: "접근 권한이 없습니다." });
      }
    }

    // 2. 메시지 쿼리 (화주는 is_private = false 인 일반 메시지만, 포워더는 전체 조회)
    let query = `
      SELECT m.id, m.booking_id, m.message, m.is_private, m.created_at, u.username as sender_name, u.role as sender_role
      FROM booking_messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.booking_id = ?
    `;
    const params: any[] = [bookingId];

    if (userSession.role === 'client') {
      query += " AND m.is_private = FALSE";
    }

    query += " ORDER BY m.created_at ASC";

    const [rows]: any = await pool.query(query, params);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("대화 내용 조회 실패:", error);
    res.status(500).json({ success: false, message: "대화 내용을 가져오는 중 에러가 발생했습니다." });
  }
};

export const postBookingMessage = async (req: Request, res: Response) => {
  const { bookingId } = req.params;
  const { message, isPrivate } = req.body;
  const userSession = (req.session as any).user;

  if (!userSession) {
    return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
  }

  if (!message || message.trim() === "") {
    return res.status(400).json({ success: false, message: "메시지 내용을 입력해 주세요." });
  }

  try {
    let targetIsPrivate = isPrivate === true;

    // 보안 검증: 화주(client)의 경우 본인 예약 건에만 작성 가능하며, 사내 메모(is_private = true)는 불가능
    if (userSession.role === 'client') {
      const [bookingRows]: any = await pool.query(
        'SELECT user_id FROM bookings WHERE id = ?',
        [bookingId]
      );
      if (bookingRows.length === 0) {
        return res.status(404).json({ success: false, message: "해당 예약 내역을 찾을 수 없습니다." });
      }
      if (bookingRows[0].user_id !== userSession.id) {
        return res.status(403).json({ success: false, message: "작성 권한이 없습니다." });
      }
      targetIsPrivate = false; // 화주가 쓴 글은 무조건 공개 상태로 설정
    }

    // 1. DB에 메시지 저장
    const [result]: any = await pool.query(
      `INSERT INTO booking_messages (booking_id, sender_id, message, is_private) 
       VALUES (?, ?, ?, ?)`,
      [bookingId, userSession.id, message, targetIsPrivate]
    );

    const insertedId = result.insertId;

    // 2. 실시간 전송을 위한 새로 생성된 메시지 객체 생성
    const messageObject = {
      id: insertedId,
      booking_id: Number(bookingId),
      message,
      is_private: targetIsPrivate,
      created_at: new Date(),
      sender_name: userSession.username,
      sender_role: userSession.role
    };

    // 3. 소켓 방출
    const io = req.app.get('io');
    const roomName = `booking_chat_${bookingId}`;

    if (targetIsPrivate) {
      // 어드민 사내 비밀 메모 ➔ 어드민 채널로만 전송
      io.to('admin').emit('new_booking_message', messageObject);
    } else {
      // 일반 메시지 ➔ 화주 대화방 및 어드민 채널 전체로 전송
      io.to(roomName).to('admin').emit('new_booking_message', messageObject);
    }

    res.json({ success: true, data: messageObject });
  } catch (error) {
    console.error("대화 작성 실패:", error);
    res.status(500).json({ success: false, message: "메시지 저장 중 에러가 발생했습니다." });
  }
};
