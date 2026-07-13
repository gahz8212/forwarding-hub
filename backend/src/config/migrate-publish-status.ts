import pool from './db';

const migratePublishStatus = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Starting DB migration for Publish Status...');

    try {
      await connection.query(`
        ALTER TABLE invoices
        ADD COLUMN publish_status VARCHAR(20) DEFAULT 'DRAFT' COMMENT 'DRAFT: 임시(내부용), SENT: 화주 전송됨'
      `);
      console.log('✅ Added publish_status to invoices table');
    } catch (e: any) {
      console.log(`⚠️ invoices.publish_status might already exist: ${e.message}`);
    }

    // 기본적으로 기존 인보이스들은 모두 SENT(기발행) 처리
    await connection.query(`
      UPDATE invoices SET publish_status = 'SENT' WHERE publish_status = 'DRAFT'
    `);
    
    connection.release();
    console.log('🎉 Publish Status Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration Error:', error);
    process.exit(1);
  }
};

migratePublishStatus();
