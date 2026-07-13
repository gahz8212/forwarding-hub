import pool from './src/config/db';
(async () => {
  try {
    const conn = await pool.getConnection();
    await conn.query(`
      INSERT INTO invoices (invoice_no, client_id, publish_status, bl_number, vessel_name, pol, pod, exchange_rate, total_ocean_usd, total_local_krw, final_amount_krw, bl_fee_krw, customs_fee_krw, due_date)
      VALUES ('INV-TEST-001', 'DONG_A_TRADE', 'DRAFT', 'BL-TEST', 'VESSEL', 'KR', 'JP', 1300, 100, 100000, 230000, 40000, 33000, '2026-07-31')
    `);
    console.log("Inserted mock invoice.");
    conn.release();
  } catch(e) { console.error(e); }
  process.exit(0);
})();
