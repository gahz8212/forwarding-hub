import pool from './db';

const migrateInvoiceInland = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Starting DB migration for Invoice Inland Cost...');

    try {
      await connection.query(`
        ALTER TABLE invoice_items
        ADD COLUMN applied_inland_krw DECIMAL(15, 0) DEFAULT 0 COMMENT '내륙 탁송비 및 할증료'
      `);
      console.log('✅ Added applied_inland_krw to invoice_items table');
    } catch (e: any) {
      console.log(`⚠️ Could not add column (might already exist): ${e.message}`);
    }

    // Also update init-db.ts in the codebase so future seeds include this column
    connection.release();
    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration Error:', error);
    process.exit(1);
  }
};

migrateInvoiceInland();
