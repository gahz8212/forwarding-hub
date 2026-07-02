import pool from './db';

async function migrate() {
  try {
    console.log('[Migration] Checking and updating shipments table for file keys...');

    // SHOW COLUMNS FROM shipments
    const [columns]: any = await pool.query('SHOW COLUMNS FROM shipments');
    const columnNames = columns.map((col: any) => col.Field);

    if (!columnNames.includes('invoice_file_key')) {
      console.log('[Migration] Adding column invoice_file_key...');
      await pool.query('ALTER TABLE shipments ADD COLUMN invoice_file_key VARCHAR(36) DEFAULT NULL');
      console.log('[Migration] Column invoice_file_key added.');
    } else {
      console.log('[Migration] Column invoice_file_key already exists.');
    }

    if (!columnNames.includes('packing_list_file_key')) {
      console.log('[Migration] Adding column packing_list_file_key...');
      await pool.query('ALTER TABLE shipments ADD COLUMN packing_list_file_key VARCHAR(36) DEFAULT NULL');
      console.log('[Migration] Column packing_list_file_key added.');
    } else {
      console.log('[Migration] Column packing_list_file_key already exists.');
    }

    console.log('[Migration] Migration completed successfully.');
    process.exit(0);
  } catch (error: any) {
    console.error('[Migration Error] Database migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
