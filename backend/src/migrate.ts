import pool from './config/database';
async function run() {
  await pool.query('ALTER TABLE vehicles MODIFY condition_photo_url TEXT');
  console.log('Column modified to TEXT');
  process.exit(0);
}
run();
