import pool from './db';

const initDB = async () => {
  try {
    const connection = await pool.getConnection();

    console.log('데이터베이스 스키마 재구성 시작...');

    // 1. Users 테이블 생성
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'client') DEFAULT 'client',
        mobile VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 기존 테이블 초기화용 DROP (개발 환경 - 외래키 제약 때문에 자식 테이블을 가장 먼저 드롭해야 합니다)
    await connection.query('DROP TABLE IF EXISTS booking_messages');
    await connection.query('DROP TABLE IF EXISTS bookings');
    await connection.query('DROP TABLE IF EXISTS shipments');
    await connection.query('DROP TABLE IF EXISTS schedules');

    // 2. 진행중/완료된 화물 트래킹 및 청구(Invoice) 테이블 생성
    await connection.query(`
      CREATE TABLE shipments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bl_number VARCHAR(100) NOT NULL UNIQUE,
        booking_id INT NULL,
        shipper VARCHAR(100) DEFAULT '일반 화주',
        vessel_name VARCHAR(100),
        status VARCHAR(50) DEFAULT 'Pending Documents',
        pol VARCHAR(100),
        pod VARCHAR(100),
        etd DATE,
        eta DATE,
        doc_closing_date DATETIME NULL,
        cargo_closing_date DATETIME NULL,
        invoice_amount DECIMAL(10, 2) COMMENT '청구될 총액',
        invoice_currency VARCHAR(10) DEFAULT 'USD',
        is_paid BOOLEAN DEFAULT FALSE COMMENT '결제 여부',
        invoice_file_path VARCHAR(255) NULL,
        packing_list_file_path VARCHAR(255) NULL,
        truck_date DATE NULL,
        truck_plate_number VARCHAR(50) NULL,
        truck_driver_phone VARCHAR(20) NULL,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ shipments (트래킹 & 청구서) 테이블 생성 완료');

    // 3. 미래 선박 스케줄 (가용 CBM/무게 포함) 테이블 생성
    await connection.query(`
      CREATE TABLE schedules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        vessel_name VARCHAR(100),
        voyage VARCHAR(50) DEFAULT '',
        line VARCHAR(100) DEFAULT '',
        pol VARCHAR(100),
        pod VARCHAR(100),
        etd DATE,
        eta DATE,
        doc_closing_date DATETIME NULL,
        cargo_closing_date DATETIME NULL,
        available_cbm DECIMAL(8, 2) COMMENT '선적 가능한 남은 부피',
        available_weight DECIMAL(10, 2) COMMENT '선적 가능한 남은 무게(kg)',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ schedules (미래 선박 스케줄) 테이블 생성 완료');

    // 4. 화주 예약 요청(Booking) 테이블 생성
    await connection.query(`
      CREATE TABLE bookings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        schedule_id INT,
        status VARCHAR(50) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE SET NULL
      )
    `);
    console.log('✅ bookings (예약 요청) 테이블 생성 완료');

    // 5. 부킹별 개별 대화/메모 테이블 생성
    await connection.query(`
      CREATE TABLE booking_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        booking_id INT NOT NULL,
        sender_id INT,
        message TEXT NOT NULL,
        is_private BOOLEAN DEFAULT FALSE COMMENT 'TRUE 이면 포워더 사내 메모 (화주에게는 노출 안됨)',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('✅ booking_messages (부킹별 업무 대화) 테이블 생성 완료');

    // 임시 관리자 계정 체크
    const [rows]: any = await connection.query(`SELECT id FROM users WHERE username = 'admin'`);
    if (rows.length === 0) {
      await connection.query(`INSERT INTO users (username, password, role) VALUES ('admin', 'admin123', 'admin')`);
    }

    // 임시 선박 스케줄 데이터 시딩 (목적지 목록 활성화용)
    const [scheduleRows]: any = await connection.query(`SELECT id FROM schedules LIMIT 1`);
    if (scheduleRows.length === 0) {
      await connection.query(`
        INSERT INTO schedules (vessel_name, pol, pod, etd, eta, available_cbm, available_weight)
        VALUES 
        ('KMTC NAGOYA', 'BUSAN, KOREA', 'TOKYO, JAPAN', '2026-07-05', '2026-07-08', 100.00, 50000.00),
        ('KMTC SEOUL', 'BUSAN, KOREA', 'SHANGHAI, CHINA', '2026-07-12', '2026-07-15', 150.00, 80000.00),
        ('KMTC BUSAN', 'BUSAN, KOREA', 'SINGAPORE, SINGAPORE', '2026-07-10', '2026-07-18', 200.00, 100000.00)
      `);
      console.log('✅ 임시 선박 스케줄 데이터 시딩 완료');
    }

    connection.release();
    console.log('🎉 데이터베이스 테이블 초기화 완료!');
    process.exit(0);
  } catch (error) {
    console.error('DB 초기화 에러:', error);
    process.exit(1);
  }
};

initDB();
