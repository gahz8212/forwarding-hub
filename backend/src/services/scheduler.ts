import cron from "node-cron";
import pool from "../config/db";

// 날짜 포맷팅 함수 (YYYY-MM-DD)
const formatDate = (date: Date) => {
  return date.toISOString().split("T")[0];
};

export const initScheduler = () => {
  console.log("⏰ 백엔드 백그라운드 크론 스케줄러가 활성화되었습니다.");

  // 매일 오전 9시에 실행 (0 9 * * *)
  cron.schedule("0 9 * * *", async () => {
    console.log("🔍 [BATCH] 일일 마감 및 알림 대상 선적 조회 시작...");
    await checkAndSendAlerts();
    console.log("🔍 [BATCH] 24시간이 경과한 임시 파일 그리드 데이터 정리 시작...");
    await cleanupTempGridData();
  });
};

export const cleanupTempGridData = async () => {
  try {
    const [result]: any = await pool.query(
      "DELETE FROM temp_file_grids WHERE created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)"
    );
    console.log(`[BATCH] 임시 그리드 데이터 정리 완료: ${result.affectedRows}건 삭제됨`);
  } catch (error) {
    console.error("[BATCH ERROR] 임시 그리드 데이터 정리 중 에러 발생:", error);
  }
};

export const checkAndSendAlerts = async () => {
  try {
    const connection = await pool.getConnection();

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatDate(tomorrow);

    // 1. 서류 마감 하루 전 알림 대상 조회 (Pending Documents 이고 doc_closing_date 가 내일인 경우)
    const [docAlerts]: any = await connection.query(`
      SELECT s.id, s.bl_number, s.shipper, s.vessel_name, s.doc_closing_date 
      FROM shipments s
      WHERE s.status = 'Pending Documents' 
        AND DATE(s.doc_closing_date) = ?
    `, [tomorrowStr]);

    if (docAlerts.length > 0) {
      console.log(`[BATCH] 서류 마감 임박 알림 대상: ${docAlerts.length}건`);
      for (const alert of docAlerts) {
        console.log(`
📱 [카카오 알림톡 발송 시뮬레이션]
- 수신인 (화주): ${alert.shipper} 님
- 내용: [서류 마감 하루 전 안내]
  B/L 번호: ${alert.bl_number} / 선박명: ${alert.vessel_name}
  내일(${tomorrowStr})은 선적 서류(인보이스, 패킹리스트) 마감일입니다.
  마감 시간 전에 사이트에 접속하여 업로드를 완료해 주시기 바랍니다.
- 발송 상태: 완료 (SUCCESS)
        `);
      }
    }

    // 2. 트럭 운송 시작 하루 전 알림 대상 조회 (Documents Verified 이고 truck_date 가 내일인 경우)
    const [truckAlerts]: any = await connection.query(`
      SELECT s.id, s.bl_number, s.shipper, s.vessel_name, s.truck_date, s.truck_plate_number, s.truck_driver_phone
      FROM shipments s
      WHERE s.status = 'Documents Verified' 
        AND DATE(s.truck_date) = ?
    `, [tomorrowStr]);

    if (truckAlerts.length > 0) {
      console.log(`[BATCH] 트럭 운송 시작 알림 대상: ${truckAlerts.length}건`);
      for (const alert of truckAlerts) {
        console.log(`
📱 [카카오 알림톡 발송 시뮬레이션]
- 수신인 (화주): ${alert.shipper} 님
- 내용: [내일 트럭 운송 개시 안내]
  B/L 번호: ${alert.bl_number} / 선박명: ${alert.vessel_name}
  내일(${tomorrowStr}) 고객님의 화물을 싣고 항구로 향할 트럭 운송이 시작됩니다.
  * 차량 번호: ${alert.truck_plate_number || "배정 중"}
  * 기사 연락처: ${alert.truck_driver_phone || "배정 중"}
  기사님 방문 시 화물 준비에 유의해 주시기 바랍니다.
- 발송 상태: 완료 (SUCCESS)
        `);
      }
    }

    connection.release();
  } catch (error) {
    console.error("[BATCH ERROR] 알림 발송 배치 처리 중 에러 발생:", error);
  }
};
