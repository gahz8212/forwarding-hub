const mysql = require('mysql2/promise');
require('dotenv').config({ path: 'backend/.env' });

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
  });
  try {
    const [rows] = await pool.query(`
      SELECT b.id, b.status, b.created_at, u.username as shipper, s.vessel_name, s.pol, s.pod, s.etd, s.eta, s.available_cbm, s.available_weight, s.doc_closing_date, s.cargo_closing_date, sh.bl_number
      FROM bookings b
      JOIN schedules s ON b.schedule_id = s.id
      JOIN users u ON b.user_id = u.id
      LEFT JOIN shipments sh ON sh.booking_id = b.id
      ORDER BY b.created_at DESC
    `);
    console.log("Success:", rows);
  } catch(e) {
    console.error("Error:", e.message);
  }
  process.exit(0);
}
main();
