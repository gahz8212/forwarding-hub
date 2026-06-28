import pool from './db';

const POL_LIST = ['Busan, KR', 'Incheon, KR', 'Shanghai, CN'];
const POD_LIST = ['Los Angeles, US', 'New York, US', 'Rotterdam, NL', 'Hamburg, DE'];
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
    await connection.query('TRUNCATE TABLE shipments');
    await connection.query('TRUNCATE TABLE schedules');

    const today = new Date();
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(today.getMonth() - 2);

    // 1. Shipments (진행중/완료 화물): 1년 전 ~ 오늘까지의 데이터 100건
    const pastStartDate = new Date(today.getFullYear() - 1, 0, 1);
    const pastEndDate = today;

    for (let i = 1; i <= 100; i++) {
      const blNumber = `KMTC${Math.floor(10000000 + Math.random() * 90000000)}`;
      const vesselName = VESSELS[Math.floor(Math.random() * VESSELS.length)];
      const pol = POL_LIST[Math.floor(Math.random() * POL_LIST.length)];
      const pod = POD_LIST[Math.floor(Math.random() * POD_LIST.length)];
      
      const etdDate = getRandomDate(pastStartDate, pastEndDate);
      const etaDate = new Date(etdDate.getTime() + (10 + Math.random() * 20) * 24 * 60 * 60 * 1000);
      
      // 2개월 전 데이터는 무조건 'Delivered' (완료), 그 이후는 진행 중 상태 배정
      let status = 'Delivered';
      if (etaDate >= twoMonthsAgo) {
        const ONGOING_STATUSES = ['Gate In', 'Loaded on Vessel', 'In Transit'];
        status = ONGOING_STATUSES[Math.floor(Math.random() * ONGOING_STATUSES.length)];
      }
      
      const invoiceAmount = (500 + Math.random() * 4500).toFixed(2);
      // 이미 도착(Delivered)한 건은 결제 확률이 높음
      const isPaid = status === 'Delivered' ? (Math.random() > 0.1) : (Math.random() > 0.7);

      await connection.query(`
        INSERT INTO shipments (bl_number, vessel_name, status, pol, pod, etd, eta, invoice_amount, invoice_currency, is_paid)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?)
      `, [blNumber, vesselName, status, pol, pod, formatDate(etdDate), formatDate(etaDate), invoiceAmount, isPaid]);
    }
    console.log('✅ 진행중/완료 화물(Shipments) 100건 생성 완료');

    // 2. Schedules (미래 선박 스케줄): 오늘 ~ 올 연말까지의 데이터 150건
    const futureStartDate = today;
    const futureEndDate = new Date(today.getFullYear(), 11, 31);

    for (let i = 1; i <= 150; i++) {
      const vesselName = VESSELS[Math.floor(Math.random() * VESSELS.length)];
      const pol = POL_LIST[Math.floor(Math.random() * POL_LIST.length)];
      const pod = POD_LIST[Math.floor(Math.random() * POD_LIST.length)];
      const etdDate = getRandomDate(futureStartDate, futureEndDate);
      const etaDate = new Date(etdDate.getTime() + (10 + Math.random() * 20) * 24 * 60 * 60 * 1000);
      
      const availableCbm = (10 + Math.random() * 90).toFixed(2);
      const availableWeight = (5000 + Math.random() * 45000).toFixed(2);

      await connection.query(`
        INSERT INTO schedules (vessel_name, pol, pod, etd, eta, available_cbm, available_weight)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [vesselName, pol, pod, formatDate(etdDate), formatDate(etaDate), availableCbm, availableWeight]);
    }
    console.log('✅ 미래 선박 스케줄(Schedules) 150건 생성 완료');

    connection.release();
    console.log('🎉 모든 Mock 데이터 생성이 완료되었습니다!');
    process.exit(0);

  } catch (error) {
    console.error('Seed 에러:', error);
    process.exit(1);
  }
};

seedDB();
