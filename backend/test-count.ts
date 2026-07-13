import pool from './src/config/db';
(async () => {
  try {
    const [invs]: any = await pool.query("SELECT * FROM invoices");
    console.log("Total Invoices:", invs.length);
    console.log("Invoices:", invs);
  } catch (e) { console.error(e); }
  process.exit(0);
})();
