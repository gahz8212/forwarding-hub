import pool from './db';

async function migrate() {
  try {
    console.log('[Migration] Checking and creating temp_file_grids table...');

    // 1. Create temp_file_grids table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS temp_file_grids (
        id VARCHAR(36) PRIMARY KEY COMMENT 'UUID v4 key',
        file_name VARCHAR(255) NOT NULL COMMENT 'Original file name',
        file_type VARCHAR(50) NOT NULL COMMENT 'File type or extension',
        grid_data JSON NOT NULL COMMENT 'Parsed grid data in JSON format',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Created timestamp',
        INDEX idx_created_at (created_at)
      ) COMMENT='Temporary table for storing parsed Excel/PDF grid data'
    `);

    console.log('[Migration] temp_file_grids table checked/created successfully.');
    process.exit(0);
  } catch (error: any) {
    console.error('[Migration Error] Failed to create temp_file_grids table:', error.message);
    process.exit(1);
  }
}

migrate();
