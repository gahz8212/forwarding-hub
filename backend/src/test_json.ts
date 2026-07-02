import pool from './config/db';

async function test() {
  try {
    const [rows]: any = await pool.query('SELECT grid_data FROM temp_file_grids LIMIT 1');
    if (rows.length > 0) {
      const data = rows[0].grid_data;
      console.log('Type of grid_data:', typeof data);
      console.log('Is array?', Array.isArray(data));
      console.log('Value snippet:', JSON.stringify(data).slice(0, 200));
    } else {
      console.log('No rows found in temp_file_grids.');
    }
    process.exit(0);
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

test();
