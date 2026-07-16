import pool from "../config/db";
import { fetchMscSchedule, saveSchedulesToDb } from "./mscScraper";

/**
 * 일일 MSC 스케줄 스크래핑 및 화물 트래킹 상태 자동 갱신 엔진
 */
export const runDailyMscTracking = async () => {
  console.log("🌊 [Tracking Engine] 일일 자동 MSC 스케줄 및 트래킹 업데이트 시작...");
  const connection = await pool.getConnection();

  try {
    // 1. 활성화된(배송 완료 전인) 선적 정보들로부터 고유한 [출발항(POL), 도착항(POD)] 경로 목록 추출
    const [routes]: any = await connection.query(`
      SELECT DISTINCT pol, pod 
      FROM shipments 
      WHERE status NOT IN ('Delivered', '배송 완료', '배송완료') 
        AND pol IS NOT NULL 
        AND pod IS NOT NULL
    `);

    console.log(`[Tracking Engine] 활성 경로 수: ${routes.length}건`);

    // 2. 각 경로별로 MSC 최신 스케줄을 긁어와 DB 캐시(schedules 테이블) 갱신
    const token = process.env.MSC_COOKIE || process.env.MSC_BEARER_TOKEN;
    if (!token) {
      console.warn("[Tracking Engine Warning] 환경 변수(MSC_COOKIE 또는 MSC_BEARER_TOKEN)가 유실되어 실시간 MSC 스케줄 스크래핑을 건너뜁니다. 기존 DB 스케줄 기반으로 트래킹 논리를 적용합니다.");
    } else {
      for (const route of routes) {
        try {
          console.log(`[Tracking Engine] MSC 스케줄 스크래핑 실행: ${route.pol} ➔ ${route.pod}`);
          const freshSchedules = await fetchMscSchedule(route.pol, route.pod, token);
          if (freshSchedules.length > 0) {
            await saveSchedulesToDb(freshSchedules);
            console.log(`[Tracking Engine] MSC 스케줄 갱신 성공: ${route.pol} ➔ ${route.pod} (${freshSchedules.length}건)`);
          }
        } catch (err: any) {
          console.error(`[Tracking Engine Error] 경로 수집 실패 (${route.pol} ➔ ${route.pod}):`, err.message);
        }
      }
    }

    // 3. 활성화된 모든 선적 정보 조회
    const [shipments]: any = await connection.query(`
      SELECT * 
      FROM shipments 
      WHERE status NOT IN ('Delivered', '배송 완료', '배송완료')
    `);

    console.log(`[Tracking Engine] 상태 갱신 대상 선적 건수: ${shipments.length}건`);

    const now = new Date();

    for (const s of shipments) {
      try {
        let updatedEtd = s.etd ? new Date(s.etd) : null;
        let updatedEta = s.eta ? new Date(s.eta) : null;
        let docClosing = s.doc_closing_date ? new Date(s.doc_closing_date) : null;
        let cargoClosing = s.cargo_closing_date ? new Date(s.cargo_closing_date) : null;

        // DB 스케줄 테이블에서 선박명 및 노선이 매칭되는 최신 일정 찾아 동기화 (선박 지연 등 추적)
        const [matchingSchedule]: any = await connection.query(`
          SELECT etd, eta, doc_closing_date, cargo_closing_date 
          FROM schedules 
          WHERE pol = ? AND pod = ? AND vessel_name = ? 
          ORDER BY created_at DESC LIMIT 1
        `, [s.pol, s.pod, s.vessel_name]);

        if (matchingSchedule.length > 0) {
          const sch = matchingSchedule[0];
          updatedEtd = sch.etd ? new Date(sch.etd) : updatedEtd;
          updatedEta = sch.eta ? new Date(sch.eta) : updatedEta;
          docClosing = sch.doc_closing_date ? new Date(sch.doc_closing_date) : docClosing;
          cargoClosing = sch.cargo_closing_date ? new Date(sch.cargo_closing_date) : cargoClosing;

          // 선적 테이블의 날짜 스펙 실시간 동기화
          await connection.query(`
            UPDATE shipments 
            SET etd = ?, eta = ?, doc_closing_date = ?, cargo_closing_date = ? 
            WHERE id = ?
          `, [updatedEtd, updatedEta, docClosing, cargoClosing, s.id]);
        }

        // 4. 날짜 기준 스마트 상태 자동 전환 논리 적용
        let newStatus = s.status;

        if (updatedEtd && updatedEta) {
          // 출항일(ETD)이 지났고 도착일(ETA) 전인 경우 ➔ 'Departed' (출항)로 상태 자동 변경
          if (now >= updatedEtd && now < updatedEta && s.status !== "Departed" && s.status !== "출항") {
            newStatus = "Departed";
          }
          // 도착일(ETA)이 지났거나 당일인 경우 ➔ 'Delivered' (배송완료)로 자동 변경
          else if (now >= updatedEta && s.status !== "Delivered" && s.status !== "배송 완료" && s.status !== "배송완료") {
            newStatus = "Delivered";
          }
          // 출항 하루 전~당일 사이이고, 서류검증이 끝난 상태라면 ➔ 'Loaded' (선적완료)로 변경
          else if (now >= new Date(updatedEtd.getTime() - 24 * 60 * 60 * 1000) && now < updatedEtd && s.status === "Documents Verified") {
            newStatus = "Loaded";
          }
        }

        // 상태값 변화가 감지되면 DB 업데이트 및 소켓 전송
        if (newStatus !== s.status) {
          await connection.query(`
            UPDATE shipments 
            SET status = ? 
            WHERE id = ?
          `, [newStatus, s.id]);

          console.log(`[Tracking Engine] 선적 갱신 성공 - B/L: ${s.bl_number} | 이전 상태: ${s.status} ➔ 새 상태: ${newStatus}`);

          // 실시간 소켓 알림 발행
          const io = (global as any).io; 
          if (io) {
            const socketPayload = {
              blNumber: s.bl_number,
              status: newStatus,
              last_updated: new Date()
            };
            io.to(s.bl_number).emit("shipment_status_changed", socketPayload);
            io.to("admin").emit("shipment_status_changed", socketPayload);
          }
        }
      } catch (shipmentErr: any) {
        console.error(`[Tracking Engine Error] B/L ${s.bl_number} 상태 판별 중 에러:`, shipmentErr.message);
      }
    }

    console.log("🌊 [Tracking Engine] 일일 자동 MSC 스케줄 및 트래킹 업데이트 완료!");
  } catch (error: any) {
    console.error("[Tracking Engine Fatal Error] 트래킹 엔진 구동 중 치명적 실패:", error.message);
  } finally {
    connection.release();
  }
};
