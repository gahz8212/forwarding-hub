import pool from './src/config/db';

async function main() {
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
  } catch(e: any) {
    console.error("Error:", e.message);
  }
  process.exit(0);
}
main();
