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
    await connection.query('DROP TABLE IF EXISTS vehicles');
    await connection.query('DROP TABLE IF EXISTS shipments');
    await connection.query('DROP TABLE IF EXISTS schedules');
    await connection.query('DROP TABLE IF EXISTS temp_file_grids');

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
        invoice_file_key VARCHAR(36) NULL,
        packing_list_file_key VARCHAR(36) NULL,
        invoice_approved TINYINT DEFAULT 0,
        packing_approved TINYINT DEFAULT 0,
        truck_date DATE NULL,
        truck_plate_number VARCHAR(50) NULL,
        truck_driver_phone VARCHAR(20) NULL,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ shipments (트래킹 & 청구서) 테이블 생성 완료');

    // 2-1. 개별 차량(Ro-Ro) 정보 및 상태 트래킹 테이블 생성
    await connection.query(`
      CREATE TABLE vehicles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        shipment_id INT NOT NULL,
        vin VARCHAR(50) NOT NULL COMMENT '차대번호',
        plate_number VARCHAR(50) NULL COMMENT '자동차등록번호',
        vehicle_type VARCHAR(50) NULL COMMENT '차종',
        mileage VARCHAR(50) NULL COMMENT '주행거리(km)',
        initial_registration_date DATE NULL COMMENT '최초등록일',
        make VARCHAR(50) COMMENT '제조사',
        model VARCHAR(50) COMMENT '모델명',
        year INT COMMENT '연식',
        length INT NULL COMMENT '전장(mm)',
        width INT NULL COMMENT '전폭(mm)',
        height INT NULL COMMENT '전고(mm)',
        weight DECIMAL(8, 2) COMMENT '차량 중량',
        cbm DECIMAL(8, 2) COMMENT '부피(CBM)',
        drivability ENUM('Running', 'Towing', 'Forklift') DEFAULT NULL COMMENT '구동/선적 상태',
        status VARCHAR(50) DEFAULT 'Pending' COMMENT '야드 반입, 선적 등 현재 상태',
        condition_photo_url TEXT NULL COMMENT '상태/데미지 리포트 사진 경로 (JSON 배열)',
        deregistration_no VARCHAR(100) NULL COMMENT '수출말소등록번호',
        customs_cleared BOOLEAN DEFAULT FALSE COMMENT '수출통관 완료 여부',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ vehicles (로로선 개별 차량) 테이블 생성 완료');

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
        vessel_imo VARCHAR(50) NULL COMMENT 'IMO 번호',
        metadata JSON NULL COMMENT '상세 마감 정보 등 JSON 데이터',
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
        incoterms VARCHAR(50) NULL,
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

    // 6. 임시 파일 그리드 데이터 테이블 생성
    await connection.query(`
      CREATE TABLE IF NOT EXISTS temp_file_grids (
        id VARCHAR(36) PRIMARY KEY COMMENT 'UUID v4 key',
        file_name VARCHAR(255) NOT NULL COMMENT 'Original file name',
        file_type VARCHAR(50) NOT NULL COMMENT 'File type or extension',
        grid_data JSON NOT NULL COMMENT 'Parsed grid data in JSON format',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Created timestamp',
        INDEX idx_created_at (created_at)
      ) COMMENT='Temporary table for storing parsed Excel/PDF grid data'
    `);
    console.log('✅ temp_file_grids (임시 파일 그리드) 테이블 생성 완료');

    // 임시 관리자 계정 체크
    const [rows]: any = await connection.query(`SELECT id FROM users WHERE username = 'admin'`);
    if (rows.length === 0) {
      await connection.query(`INSERT INTO users (username, password, role, mobile) VALUES ('admin', 'admin123', 'admin', '010-0000-0000')`);
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
