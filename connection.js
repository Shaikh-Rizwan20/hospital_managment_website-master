const util = require("util");
const mysql = require("mysql2"); // Note: NOT 'mysql2/promise'

const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "hospital_management",
  connectionLimit: 10,
});

// Promisify the pool query method
const exe = util.promisify(pool.query).bind(pool);

module.exports = exe;