import pool from './db';

const migrateConsolidatedInvoice = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Starting DB migration for Consolidated Invoices...');

    try {
      // 1. shipments 테이블에 invoice_no 컬럼 추가 (어떤 정산서에 묶였는지 추적)
      await connection.query(`
        ALTER TABLE shipments
        ADD COLUMN invoice_no VARCHAR(50) DEFAULT NULL COMMENT '월합계 정산용 인보이스 번호'
      `);
      console.log('✅ Added invoice_no to shipments table');
    } catch (e: any) {
      console.log(`⚠️ shipments.invoice_no might already exist: ${e.message}`);
    }

    try {
      // 2. invoices 테이블의 bl_number 길이를 늘림 (A외 2건, 또는 다중 BL 저장용)
      await connection.query(`
        ALTER TABLE invoices
        MODIFY bl_number VARCHAR(255) DEFAULT NULL
      `);
      console.log('✅ Expanded invoices.bl_number length to 255');
    } catch (e: any) {
      console.log(`⚠️ Could not modify invoices.bl_number: ${e.message}`);
    }

    connection.release();
    console.log('🎉 Consolidated Invoice Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration Error:', error);
    process.exit(1);
  }
};

migrateConsolidatedInvoice();
