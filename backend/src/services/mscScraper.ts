import axios from 'axios';
import pool from '../config/db';

export interface CommonSchedule {
  vesselName: string;
  voyage: string;
  line: string;
  pol: string;
  pod: string;
  etd: Date;
  eta: Date;
  docClosingDate?: Date | null;
  cargoClosingDate?: Date | null;
  vesselImo?: string | null;
  metadata?: any | null;
}

/**
 * MSC Port Code to internal Port ID mapping
 */
export async function getMscPortId(portCode: string, token: string): Promise<number> {
  // 입력받은 포트 문자열을 정규화합니다.
  // 예: "LONG BEACH, USA (LGB)" -> "LONG BEACH"
  // 예: "BUSAN, KOREA" -> "BUSAN"
  const cleanCode = portCode.split(',')[0].split('(')[0].toUpperCase().trim();

  // Static common mappings
  const staticMap: Record<string, number> = {
    'KRPUS': 274, // BUSAN
    'BUSAN': 274,
    'USLGB': 82,  // LONG BEACH
    'LONG BEACH': 82,
    'CNSHA': 252, // SHANGHAI (Example ID, will fall back if wrong)
    'SHANGHAI': 252,
    'KRINC': 275, // INCHEON
    'INCHEON': 275,
    'USLAX': 120, // LOS ANGELES
    'LOS ANGELES': 120,
    'USSEA': 1585, // SEATTLE
    'SEATTLE': 1585,
    'NLRTM': 941, // ROTTERDAM
    'ROTTERDAM': 941,
  };

  if (staticMap[cleanCode]) {
    return staticMap[cleanCode];
  }

  // Dynamic fallback: Query MSC Port Search API
  try {
    const searchUrl = 'https://www.msc.com/api/feature/tools/SearchPorts';
    
    const headers: Record<string, string> = {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
      'X-Requested-With': 'XMLHttpRequest',
      'sec-ch-ua': '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin'
    };

    if (token.includes('=') && (token.includes('SessionId') || token.includes('msccargo') || token.includes('ak_bmsc'))) {
      headers['Cookie'] = token;
    } else {
      headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    }

    console.log(`[MSC Port Search Debug] Request URL: ${searchUrl}`);
    console.log(`[MSC Port Search Debug] Request Params:`, { query: cleanCode, language: 'ko-KR' });

    const response = await axios.get(searchUrl, {
      params: { query: cleanCode, language: 'ko-KR' },
      headers,
      timeout: 5000
    });

    console.log(`[MSC Port Search Debug] Response Data:`, response.data);

    let portsArray: any[] = [];
    if (response.data) {
      if (Array.isArray(response.data)) {
        portsArray = response.data;
      } else if (Array.isArray(response.data.Data)) {
        portsArray = response.data.Data;
      } else if (Array.isArray(response.data.data)) {
        portsArray = response.data.data;
      } else {
        // 객체 내부의 모든 키를 돌면서 배열 타입인 프로퍼티를 동적으로 추출합니다.
        for (const key of Object.keys(response.data)) {
          if (Array.isArray(response.data[key])) {
            portsArray = response.data[key];
            break;
          }
        }
      }
    }

    if (portsArray.length > 0) {
      const port = portsArray.find((p: any) => {
        const pCode = String(p.LocationCode || p.portCode || p.PortCode || p.code || p.Code || '').toUpperCase().trim();
        const pName = String(p.LocationName || p.name || p.Name || p.portName || p.PortName || '').toUpperCase().trim();
        return pCode === cleanCode || pName.includes(cleanCode);
      });

      if (port) {
        const portId = port.PortId || port.portId || port.id || port.Id;
        if (portId !== undefined && portId !== null) {
          console.log(`[MSC Port Search Debug] Resolved Port ID for ${cleanCode}: ${portId}`);
          return Number(portId);
        }
      }
    }
  } catch (error: any) {
    console.error(`[MSC Port Search] Failed to fetch ID for ${portCode}:`, error.message);
  }

  throw new Error(`MSC Port ID mapping not found for: ${portCode}. Please verify your ports or token.`);
}

/**
 * Fetches schedules from MSC and maps them to CommonSchedule[]
 */
export async function fetchMscSchedule(pol: string, pod: string, token: string): Promise<CommonSchedule[]> {
  const fromPortId = await getMscPortId(pol, token);
  const toPortId = await getMscPortId(pod, token);

  console.log(`[MSC API Request Debug] POL: ${pol} -> Port ID: ${fromPortId}`);
  console.log(`[MSC API Request Debug] POD: ${pod} -> Port ID: ${toPortId}`);

  const url = 'https://www.msc.com/api/feature/tools/SearchSailingRoutes';
  const todayStr = new Date().toISOString().split('T')[0];

  const payload = {
    FromDate: todayStr,
    dataSourceId: "{E9CCBD25-6FBA-4C5C-85F6-FC4F9E5A931F}",
    fromPortId: fromPortId,
    language: "ko-KR",
    toPortId: toPortId
  };

  console.log('[MSC API Request Debug] Payload:', payload);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Origin': 'https://www.msc.com',
    'Referer': 'https://www.msc.com/ko/search-a-schedule',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'sec-ch-ua': '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin'
  };

  if (token.includes('=') && (token.includes('SessionId') || token.includes('msccargo') || token.includes('ak_bmsc'))) {
    console.log('[MSC API Request Debug] Using COOKIE for authentication.');
    headers['Cookie'] = token;
  } else {
    console.log('[MSC API Request Debug] Using AUTHORIZATION BEARER for authentication.');
    headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }

  const response = await axios.post(url, payload, { headers, timeout: 15000 });
  const data = response.data;

  // 디버깅을 위해 응답 전체 형태를 출력합니다.
  console.log('[MSC API Response Check] Response Type:', typeof data);
  console.log('[MSC API Response Check] Response Keys:', typeof data === 'object' && data !== null ? Object.keys(data) : 'N/A');
  console.log('[MSC API Response Check] Raw Response Data:', data);

  // 만약 응답이 완전히 비어있다면 에러를 던집니다.
  if (typeof data === 'string' && data.trim() === '') {
    throw new Error('MSC 서버로부터 빈 응답(Empty Response)이 반환되었습니다. 세션 쿠키가 만료되었거나 Akamai 보안 솔루션(WAF)에 의해 차단되었을 수 있습니다. F12에서 쿠키를 최신으로 갱신하여 전체 복사해 주세요.');
  }

  // 만약 세션 쿠키 만료 등으로 HTML 로그인 페이지로 리다이렉트 되었다면 에러를 던집니다.
  if (typeof data === 'string' && (data.includes('<!DOCTYPE html>') || data.includes('<html'))) {
    throw new Error('MSC API가 JSON 대신 HTML 페이지를 반환했습니다. 세션 쿠키가 만료되었거나 차단되었습니다. F12에서 쿠키를 다시 복사하여 입력해 주세요.');
  }

  const results: CommonSchedule[] = [];
  const items = data.Data || data.data || [];

  if (Array.isArray(items)) {
    for (const item of items) {
      const routes = item.Routes || item.routes || [];
      if (Array.isArray(routes)) {
        for (const route of routes) {
          const vesselName = route.VesselName || item.VesselName || 'MSC VESSEL';
          const voyage = route.DepartureVoyageNo || item.DepartureVoyageNo || 'V001';
          const line = item.LoadingService || route.LoadingService || 'ORIENT SERVICE';
          
          const etdStr = route.EstimatedDepartureDate || route.EstimatedDepartureTime || item.EstimatedDepartureTime;
          const etaStr = route.EstimatedArrivalDate || route.EstimatedArrivalTime || item.EstimatedArrivalTime;

          const etd = etdStr ? new Date(etdStr) : new Date();
          const eta = etaStr ? new Date(etaStr) : new Date();

          // 영어 서수 접미사(st, nd, rd, th)가 섞인 날짜 포맷 정화 함수
          const parseMscDate = (dateStr: string | null | undefined): Date | null => {
            if (!dateStr) return null;
            const cleaned = dateStr.replace(/(\d+)(st|nd|rd|th)/gi, '$1');
            const parsed = new Date(cleaned);
            return isNaN(parsed.getTime()) ? null : parsed;
          };

          const docClosingDate = parseMscDate(route.CutOffs?.ShippingInstructionsCutOffDate);
          const cargoClosingDate = parseMscDate(route.CutOffs?.ContainerYardCutOffDate);

          // Vessel IMO Code 추출 (MSC의 경우 RouteScheduleLegDetails 내부의 Vessel 객체에서 획득)
          const leg = route.RouteScheduleLegDetails?.[0];
          const vesselImo = leg?.Vessel?.VesselImoCode || route.VesselImoCode || null;

          // MSC 사이트에서 제공하는 5가지 마감일(CutOffs) 데이터를 모두 패킹 (표준 ISO 포맷으로 변형하여 저장)
          const metadata = {
            siCutOff: docClosingDate ? docClosingDate.toISOString() : null,
            vgmCutOff: parseMscDate(route.CutOffs?.VerifiedGrossMassCutOffDate)?.toISOString() || null,
            cyCutOff: cargoClosingDate ? cargoClosingDate.toISOString() : null,
            dangerousCutOff: parseMscDate(route.CutOffs?.DangerousCargoCutOffDate)?.toISOString() || null,
            reeferCutOff: parseMscDate(route.CutOffs?.ReeferCutOffDate)?.toISOString() || null,
            originalCarrier: 'MSC'
          };

          results.push({
            vesselName,
            voyage,
            line,
            pol: item.PortOfLoadUnCode || pol,
            pod: item.PortOfDischargeUnCode || pod,
            etd,
            eta,
            docClosingDate: isNaN(docClosingDate?.getTime() || NaN) ? null : docClosingDate,
            cargoClosingDate: isNaN(cargoClosingDate?.getTime() || NaN) ? null : cargoClosingDate,
            vesselImo,
            metadata
          });
        }
      }
    }
  }

  return results;
}

/**
 * Saves schedules to the MySQL schedules table
 */
export async function saveSchedulesToDb(schedules: CommonSchedule[]) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    for (const s of schedules) {
      // Format dates for MySQL
      const etdMysql = s.etd.toISOString().split('T')[0];
      const etaMysql = s.eta.toISOString().split('T')[0];
      const docClosingMysql = s.docClosingDate ? s.docClosingDate.toISOString().slice(0, 19).replace('T', ' ') : null;
      const cargoClosingMysql = s.cargoClosingDate ? s.cargoClosingDate.toISOString().slice(0, 19).replace('T', ' ') : null;

      // Check if schedule already exists to avoid duplicates (matching vessel, voyage, pol, pod, etd)
      const [existing]: any = await connection.query(
        'SELECT id FROM schedules WHERE vessel_name = ? AND voyage = ? AND pol = ? AND pod = ? AND etd = ?',
        [s.vesselName, s.voyage, s.pol, s.pod, etdMysql]
      );

      if (existing.length > 0) {
        // Update existing schedule
        await connection.query(
          `UPDATE schedules 
           SET eta = ?, line = ?, doc_closing_date = ?, cargo_closing_date = ?, vessel_imo = ?, metadata = ? 
           WHERE id = ?`,
          [etaMysql, s.line, docClosingMysql, cargoClosingMysql, s.vesselImo || null, s.metadata ? JSON.stringify(s.metadata) : null, existing[0].id]
        );
      } else {
        // Insert new schedule
        // Set default CBM and Weight so it is bookable
        const defaultCbm = 150.00;
        const defaultWeight = 25000.00;

        await connection.query(
          `INSERT INTO schedules (vessel_name, voyage, line, pol, pod, etd, eta, doc_closing_date, cargo_closing_date, vessel_imo, metadata, available_cbm, available_weight)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [s.vesselName, s.voyage, s.line, s.pol, s.pod, etdMysql, etaMysql, docClosingMysql, cargoClosingMysql, s.vesselImo || null, s.metadata ? JSON.stringify(s.metadata) : null, defaultCbm, defaultWeight]
        );
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    console.error('[saveSchedulesToDb] Transaction rolled back due to error:', error);
    throw error;
  } finally {
    connection.release();
  }
}
