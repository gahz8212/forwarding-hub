import pool from './src/config/db';
(async () => {
  try {
    const [invs]: any = await pool.query("SELECT invoice_no, client_id, publish_status FROM invoices");
    console.log("Invoices:", invs);
    const [clients]: any = await pool.query("SELECT client_id, client_name FROM clients");
    console.log("Clients:", clients);
  } catch (e) { console.error(e); }
  process.exit(0);
})();
