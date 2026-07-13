import pool from './src/config/db';
(async () => {
  try {
    const [invs]: any = await pool.query("SELECT invoice_no, publish_status, client_id, bl_number, created_at FROM invoices");
    console.log("Current Invoices in DB:", invs);
  } catch (e) { console.error(e); }
  process.exit(0);
})();
