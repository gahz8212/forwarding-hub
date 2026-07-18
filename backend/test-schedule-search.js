const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env' });

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
  });
  try {
    const polInfo = { code: 'KRPUS', clean: 'BUSAN', name: 'BUSAN' };
    const podInfo = { code: 'USLGB', clean: 'LONG BEACH', name: 'LONG BEACH' };
    const pol = 'BUSAN';
    const pod = 'LONG BEACH';
    
    let query = 'SELECT * FROM schedules WHERE 1=1';
    const params = [];

    query += ' AND (pol = ? OR pol LIKE ? OR pol LIKE ? OR pol = ?)';
    params.push(polInfo.code, `%${polInfo.clean}%`, `%${polInfo.name}%`, String(pol));

    query += ' AND (pod = ? OR pod LIKE ? OR pod LIKE ? OR pod = ?)';
    params.push(podInfo.code, `%${podInfo.clean}%`, `%${podInfo.name}%`, String(pod));

    console.log(query);
    console.log(params);

    const [rows] = await pool.query(query, params);
    console.log("Success:", rows.length, "rows");
    if(rows.length > 0) console.log(rows[0]);
  } catch(e) {
    console.error("Error:", e.message);
  }
  process.exit(0);
}
main();
