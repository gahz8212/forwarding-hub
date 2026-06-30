import pool from './db';

const POL_LIST = ['BUSAN, KOREA', 'INCHEON, KOREA', 'SHANGHAI, CHINA'];
const POD_LIST = ['LONG BEACH, USA (LGB)', 'LOS ANGELES, USA (LAX)', 'NEW YORK, USA (NYC)', 'ROTTERDAM, NETHERLANDS'];
const VESSELS = ['KMTC SHANGHAI', 'SUNNY HOPE', 'HMM ALGECIRAS', 'MSC GULSUN', 'EVER GIVEN'];

const getRandomDate = (start: Date, end: Date) => {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

const formatDate = (date: Date) => {
  return date.toISOString().split('T')[0];
};

const seedDB = async () => {
  try {
    const connection = await pool.getConnection();

    console.log('데이터 시드 시작...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.query('TRUNCATE TABLE booking_messages');
    await connection.query('TRUNCATE TABLE bookings');
    await connection.query('TRUNCATE TABLE shipments');
    await connection.query('TRUNCATE TABLE schedules');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    const today = new Date();
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(today.getMonth() - 2);

    // 1. Shipments (진행중/완료 화물): 1년 전 ~ 오늘까지의 데이터 100건
    const pastStartDate = new Date(today.getFullYear() - 1, 0, 1);
    const pastEndDate = today;
    const TRUCK_PLATES = ['경기99바1234', '서울88아5678', '부산77다9876'];
    const DRIVER_PHONES = ['010-9999-1234', '010-8888-5678', '010-7777-9876'];

    for (let i = 1; i <= 100; i++) {
      const blNumber = `KMTC${Math.floor(10000000 + Math.random() * 90000000)}`;
      const vesselName = VESSELS[Math.floor(Math.random() * VESSELS.length)];
      const pol = POL_LIST[Math.floor(Math.random() * POL_LIST.length)];
      const pod = POD_LIST[Math.floor(Math.random() * POD_LIST.length)];
      const shipperName = Math.random() > 0.5 ? "shipper1" : "test_shipper";
      
      const etdDate = getRandomDate(pastStartDate, pastEndDate);
      const etaDate = new Date(etdDate.getTime() + (10 + Math.random() * 20) * 24 * 60 * 60 * 1000);
      
      // 서류 및 카고 마감일자 계산
      const docClosing = new Date(etdDate.getTime() - 3 * 24 * 60 * 60 * 1000);
      docClosing.setHours(9, 0, 0, 0);
      const cargoClosing = new Date(etdDate.getTime() - 1.5 * 24 * 60 * 60 * 1000);
      cargoClosing.setHours(9, 0, 0, 0);

      // 상태 배정
      let status = 'Delivered';
      if (etaDate >= twoMonthsAgo) {
        const ALL_STATUSES = [
          'Pending Documents', 
          'Documents Uploaded', 
          'Documents Verified', 
          'Trucking', 
          'Gate In', 
          'Loaded on Vessel', 
          'In Transit'
        ];
        status = ALL_STATUSES[Math.floor(Math.random() * ALL_STATUSES.length)];
      }

      // 상태별 조건 필드 세팅
      let invoicePath = null;
      let packingPath = null;
      let truckDate = null;
      let truckPlate = null;
      let truckPhone = null;

      // 서류 업로드 완료 이상 단계
      if (['Documents Uploaded', 'Documents Verified', 'Trucking', 'Gate In', 'Loaded on Vessel', 'In Transit', 'Delivered'].includes(status)) {
        invoicePath = `/uploads/invoices/${blNumber}_invoice.pdf`;
        packingPath = `/uploads/packing_lists/${blNumber}_packing.pdf`;
      }

      // 서류 검증 승인 완료 이상 단계 (트럭 배정 날짜 설정됨)
      if (['Documents Verified', 'Trucking', 'Gate In', 'Loaded on Vessel', 'In Transit', 'Delivered'].includes(status)) {
        const tDate = new Date(etdDate.getTime() - 2 * 24 * 60 * 60 * 1000);
        truckDate = formatDate(tDate);
      }

      // 트럭 운송 개시 이상 단계 (기사/차량 배정됨)
      if (['Trucking', 'Gate In', 'Loaded on Vessel', 'In Transit', 'Delivered'].includes(status)) {
        const idx = Math.floor(Math.random() * TRUCK_PLATES.length);
        truckPlate = TRUCK_PLATES[idx];
        truckPhone = DRIVER_PHONES[idx];
      }
      
      const invoiceAmount = (500 + Math.random() * 4500).toFixed(2);
      // 이미 도착(Delivered)한 건은 결제 확률이 높음
      const isPaid = status === 'Delivered' ? (Math.random() > 0.1) : (Math.random() > 0.7);

      await connection.query(`
        INSERT INTO shipments (
          bl_number, shipper, vessel_name, status, pol, pod, etd, eta, 
          doc_closing_date, cargo_closing_date, invoice_amount, invoice_currency, is_paid,
          invoice_file_path, packing_list_file_path, truck_date, truck_plate_number, truck_driver_phone
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?)
      `, [
        blNumber, shipperName, vesselName, status, pol, pod, formatDate(etdDate), formatDate(etaDate),
        formatDate(docClosing) + ' 09:00:00', formatDate(cargoClosing) + ' 09:00:00', invoiceAmount, isPaid,
        invoicePath, packingPath, truckDate, truckPlate, truckPhone
      ]);
    }
    console.log('✅ 진행중/완료 화물(Shipments) 100건 생성 완료');

    // 2. Schedules (미래 선박 스케줄): 제공된 실무 스케줄 6건을 먼저 수동 등록
    const realSchedules = [
      { vessel: 'SM NINGBO', voy: '2504E', doc: '2026-06-02 09:00:00', cgo: '2026-06-04 09:00:00', etd: '2026-06-07', eta: '2026-06-18', pol: 'BUSAN, KOREA', pod: 'LONG BEACH, USA (LGB)', line: 'SM (CPX)' },
      { vessel: 'HMM RUBY', voy: '0007E', doc: '2026-06-02 09:00:00', cgo: '2026-06-04 09:00:00', etd: '2026-06-08', eta: '2026-06-22', pol: 'BUSAN, KOREA', pod: 'LOS ANGELES, USA (LAX)', line: 'HMM' },
      { vessel: 'SM SHANGHAI', voy: '2504E', doc: '2026-06-09 09:00:00', cgo: '2026-06-11 09:00:00', etd: '2026-06-14', eta: '2026-06-25', pol: 'BUSAN, KOREA', pod: 'LONG BEACH, USA (LGB)', line: 'SM (CPX)' },
      { vessel: 'HMM TURQUOISE', voy: '0004E', doc: '2026-06-09 17:00:00', cgo: '2026-06-12 09:00:00', etd: '2026-06-15', eta: '2026-06-29', pol: 'BUSAN, KOREA', pod: 'LOS ANGELES, USA (LAX)', line: 'HMM' },
      { vessel: 'HMM TOPAZ', voy: '0006E', doc: '2026-06-13 09:00:00', cgo: '2026-06-17 09:00:00', etd: '2026-06-20', eta: '2026-07-06', pol: 'BUSAN, KOREA', pod: 'LOS ANGELES, USA (LAX)', line: 'HMM' },
      { vessel: 'SM YANTIAN', voy: '2504E', doc: '2026-06-19 09:00:00', cgo: '2026-06-19 09:00:00', etd: '2026-06-24', eta: '2026-07-07', pol: 'BUSAN, KOREA', pod: 'LONG BEACH, USA (LGB)', line: 'SM (CPX)' },
    ];

    for (const rs of realSchedules) {
      await connection.query(`
        INSERT INTO schedules (vessel_name, voyage, line, pol, pod, etd, eta, doc_closing_date, cargo_closing_date, available_cbm, available_weight)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 80.00, 40000.00)
      `, [rs.vessel, rs.voy, rs.line, rs.pol, rs.pod, rs.etd, rs.eta, rs.doc, rs.cgo]);
    }
    console.log('✅ 실무 선박 스케줄 6건 생성 완료');

    // 남은 144건은 무작위 시뮬레이션 생성
    const futureStartDate = today;
    const futureEndDate = new Date(today.getFullYear(), 11, 31);
    const CARRIERS = ['HMM', 'SM (CPX)', 'KMTC', 'ONE', 'SINOKOR'];

    for (let i = 1; i <= 144; i++) {
      const vesselName = VESSELS[Math.floor(Math.random() * VESSELS.length)];
      const pol = POL_LIST[Math.floor(Math.random() * POL_LIST.length)];
      const pod = POD_LIST[Math.floor(Math.random() * POD_LIST.length)];
      const etdDate = getRandomDate(futureStartDate, futureEndDate);
      const etaDate = new Date(etdDate.getTime() + (10 + Math.random() * 20) * 24 * 60 * 60 * 1000);
      
      const voyage = `${Math.floor(1000 + Math.random() * 9000)}E`;
      const line = CARRIERS[Math.floor(Math.random() * CARRIERS.length)];

      // 서류 마감: ETD 3일 전 09:00
      const docClosing = new Date(etdDate.getTime() - 3 * 24 * 60 * 60 * 1000);
      docClosing.setHours(9, 0, 0, 0);

      // 카고 마감: ETD 1.5일 전 09:00
      const cargoClosing = new Date(etdDate.getTime() - 1.5 * 24 * 60 * 60 * 1000);
      cargoClosing.setHours(9, 0, 0, 0);

      const availableCbm = (10 + Math.random() * 90).toFixed(2);
      const availableWeight = (5000 + Math.random() * 45000).toFixed(2);

      await connection.query(`
        INSERT INTO schedules (vessel_name, voyage, line, pol, pod, etd, eta, doc_closing_date, cargo_closing_date, available_cbm, available_weight)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        vesselName, 
        voyage, 
        line, 
        pol, 
        pod, 
        formatDate(etdDate), 
        formatDate(etaDate), 
        formatDate(docClosing) + ' 09:00:00',
        formatDate(cargoClosing) + ' 09:00:00',
        availableCbm, 
        availableWeight
      ]);
    }
    console.log('✅ 미래 선박 스케줄(Schedules) 144건 무작위 생성 완료');

    connection.release();
    console.log('🎉 모든 Mock 데이터 생성이 완료되었습니다!');
    process.exit(0);

  } catch (error) {
    console.error('Seed 에러:', error);
    process.exit(1);
  }
};

seedDB();
