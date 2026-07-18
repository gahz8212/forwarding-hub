const mysql = require('mysql2/promise');
require('dotenv').config({path: '../../.env'});
(async () => {
  const pool = mysql.createPool({
    host: '127.0.0.1',
    user: 'root',
    password: 'password', // Try default passwords or skip it, I don't know the password
    database: 'forwarding_db'
  });
  // Instead let's just grep the uploads folder logic.
})();
