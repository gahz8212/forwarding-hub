import pool from './db';

async function migrate() {
  try {
    console.log('[Migration] Starting database migration for schedules table...');

    // 1. Check if vessel_imo column already exists
    const [columns]: any = await pool.query('SHOW COLUMNS FROM schedules');
    const columnNames = columns.map((col: any) => col.Field);

    if (!columnNames.includes('vessel_imo')) {
      console.log('[Migration] Adding column vessel_imo...');
      await pool.query('ALTER TABLE schedules ADD COLUMN vessel_imo VARCHAR(20) DEFAULT NULL');
      console.log('[Migration] Column vessel_imo added successfully.');
    } else {
      console.log('[Migration] Column vessel_imo already exists.');
    }

    // 2. Check if metadata column already exists
    if (!columnNames.includes('metadata')) {
      console.log('[Migration] Adding column metadata...');
      await pool.query('ALTER TABLE schedules ADD COLUMN metadata JSON DEFAULT NULL');
      console.log('[Migration] Column metadata added successfully.');
    } else {
      console.log('[Migration] Column metadata already exists.');
    }

    console.log('[Migration] Migration completed successfully.');
    process.exit(0);
  } catch (error: any) {
    console.error('[Migration Error] Database migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
