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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 기존 테이블 초기화용 DROP (개발 환경)
    await connection.query('DROP TABLE IF EXISTS shipments');
    await connection.query('DROP TABLE IF EXISTS schedules');

    // 2. 진행중/완료된 화물 트래킹 및 청구(Invoice) 테이블 생성
    await connection.query(`
      CREATE TABLE shipments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bl_number VARCHAR(100) NOT NULL UNIQUE,
        vessel_name VARCHAR(100),
        status VARCHAR(50),
        pol VARCHAR(100),
        pod VARCHAR(100),
        etd DATE,
        eta DATE,
        invoice_amount DECIMAL(10, 2) COMMENT '청구될 총액',
        invoice_currency VARCHAR(10) DEFAULT 'USD',
        is_paid BOOLEAN DEFAULT FALSE COMMENT '결제 여부',
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ shipments (트래킹 & 청구서) 테이블 생성 완료');

    // 3. 미래 선박 스케줄 (가용 CBM/무게 포함) 테이블 생성
    await connection.query(`
      CREATE TABLE schedules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        vessel_name VARCHAR(100),
        pol VARCHAR(100),
        pod VARCHAR(100),
        etd DATE,
        eta DATE,
        available_cbm DECIMAL(8, 2) COMMENT '선적 가능한 남은 부피',
        available_weight DECIMAL(10, 2) COMMENT '선적 가능한 남은 무게(kg)',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ schedules (미래 선박 스케줄) 테이블 생성 완료');

    // 임시 관리자 계정 체크
    const [rows]: any = await connection.query(`SELECT id FROM users WHERE username = 'admin'`);
    if (rows.length === 0) {
      await connection.query(`INSERT INTO users (username, password, role) VALUES ('admin', 'admin123', 'admin')`);
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
