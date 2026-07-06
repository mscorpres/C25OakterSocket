require("dotenv").config();

const { Sequelize } = require("sequelize");

let options = {
  multipleStatements: true,
  connectTimeout: 30000,
};
let poolOption = {
  max: 10,
  min: 0,
  idle: 10000,
  acquire: 30000,
};

console.log(process.env.STAGE);

let other, invt, tally;
// Helper to wrap connections with retry
async function testConnection(sequelize, name) {
  try {
    await sequelize.authenticate();
    console.log(`${name} DB connected successfully.`);
  } catch (err) {
    console.error(`${name} DB connection failed:`, err.message);
    // Retry after 5s if failed
    setTimeout(() => testConnection(sequelize, name), 5000);
  }
}

if (process.env.STAGE == "production") {
  other = new Sequelize(`${process.env.DB_OTHER_DBNAME}`, `${process.env.DB_INVT_USER}`, `${process.env.DB_INVT_PASS}`, {
    host: `${process.env.DB_INVT_HOST}`,
    dialect: "mysql",
    dialectOptions: options,
    pool: poolOption, timezone: "+05:30"
  });

  invt = new Sequelize(`${process.env.DB_INVT_DBNAME}`, `${process.env.DB_INVT_USER}`, `${process.env.DB_INVT_PASS}`, {
    host: `${process.env.DB_INVT_HOST}`,
    dialect: "mysql",
    dialectOptions: options,
    pool: poolOption, timezone: "+05:30"
  });

  tally = new Sequelize(`${process.env.DB_FIN_DBNAME}`, `${process.env.DB_INVT_USER}`, `${process.env.DB_INVT_PASS}`, {
    host: `${process.env.DB_INVT_HOST}`,
    dialect: "mysql",
    dialectOptions: options,
    pool: poolOption, timezone: "+05:30"
  });
} else {
  other = new Sequelize("oakter_ims_other", "test_imsUser", "9$@ZeUB0@070", {
    host: "207.180.216.86", //
    dialect: "mysql",
    dialectOptions: options,
    pool: poolOption, timezone: "+05:30"
  });

  invt = new Sequelize("oakter_ims_invt", "test_imsUser", "9$@ZeUB0@070", {
    host: "207.180.216.86",
    dialect: "mysql",
    dialectOptions: options,
    pool: poolOption, timezone: "+05:30"
  });

  tally = new Sequelize("oakter_ims_finance", "test_imsUser", "9$@ZeUB0@070", {
    host: "207.180.216.86",
    dialect: "mysql",
    dialectOptions: options,
    pool: poolOption, timezone: "+05:30"
  });
}


// console.log(process.env.STAGE);
  // 🔄 Retry check only for remote DBs
testConnection(invt, "invt");
testConnection(other, "other");
testConnection(tally, "tally");


module.exports = { tallyDB: tally, otherDB: other, invtDB: invt };
