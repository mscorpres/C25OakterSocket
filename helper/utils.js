const jwt = require("jsonwebtoken");
const fs = require("fs");

const { otherDB, invtDB } = require("./../config/db/connection");

const error_log = function ({ stack }) {
  try {
    fs.appendFile("./logs/error.log", `${stack}\n`, function (err) {
      if (err) {
        console.log(err);
      }
    });
  } catch (err) {
    // console.log(err);
  }
};

function verifyToken(token) {
  return new Promise((resolve, reject) => {
    if (!token) {
      return reject(new Error("No token provided"));
    }

    let cleanToken = token.startsWith("Bearer ")
      ? token.slice(7)
      : token;

    jwt.verify(cleanToken, process.env.TOKEN_SECRET, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded);
      }
    });
  });
}

const emit_notifications = async function (io, socket, notificationId) {
  try {
    token_res = await verifyToken(`${socket.handshake.auth.token}`);
    let user_id = token_res.crn_id;
    let stmt = await otherDB.query("SELECT * FROM user_files_req WHERE user_id = :uid ORDER BY ID DESC", {
      replacements: { uid: user_id },
      type: otherDB.QueryTypes.SELECT,
    });
    if (stmt.length > 0) {
      if (notificationId) {
        let item = { ...stmt[0], notificationId: notificationId };
        stmt.unshift();
        stmt = [item, ...stmt];
        io.to(user_id).emit("socket_receive_notification", stmt);
      } else {
        socket.emit("notification", stmt);
      }
    }
  } catch (err) {
    error_log({ stack: err.stack });
  }
};

const emit_error_msg = async function (io, socket, msg) {
  try {
    const { crn_id } = await verifyToken(`${socket.handshake.auth.token}`);
    io.to(crn_id).emit("error_msg", msg);
  } catch (err) {
    error_log({ stack: err.stack });
  }
};

const download_start_detail = async function (io, socket, title, status, req) {
  try {
    const { crn_id } = await verifyToken(`${socket.handshake.auth.token}`);
    io.to(crn_id).emit("download_start_detail", {
      title: title,
      details: req.groupKey,
      notificationId: req.notificationId,
      status: status,
      detailStatus: true,
      type: "file",
    });
  } catch (error) {
    error_log({ stack: error.stack });
  }
};

const getWeightedPurchaseRate = async function (componentKey, date) {
  // Ensure date is in proper format (YYYY-MM-DD HH:mm:ss)
  // If only date is provided, append end of day time
  let formattedDate = date;
  if (date && date.length === 10 && !date.includes(' ')) {
    // Date only format (YYYY-MM-DD), append end of day time
    formattedDate = date + ' 23:59:59';
  }
  
  // Define the query to calculate the Weighted Purchase Rate
  // Use <= for end date to include all transactions up to and including the given date/time
  const query =
    "SELECT COALESCE(SUM((in_po_rate * exchange_rate * qty) + custom_duty + freight_charge), 0) AS sum_amount, COALESCE(SUM(qty), 0) AS sum_qty FROM rm_location WHERE components_id = :componentKey AND DATE_FORMAT(insert_date, '%Y-%m-%d %H:%i:%s') >= :startDate AND DATE_FORMAT(insert_date, '%Y-%m-%d %H:%i:%s') <= :date AND trans_type IN('INWARD') AND (in_module != 'IN-FGRETURN')";

  // Execute the query with the provided parameters
  const result = await invtDB.query(query, {
    replacements: { componentKey, date: formattedDate, startDate: `2025-04-01 00:00:00` },
    type: invtDB.QueryTypes.SELECT,
  });

  let getAverageRate = await invtDB.query("SELECT * FROM tbl_average_rate WHERE component_key = :componentKey", {
    replacements: { componentKey },
    type: invtDB.QueryTypes.SELECT,
  });

  // console.table(getAverageRate);

  if (getAverageRate.length <= 0) {
    getAverageRate = [{ average_rate: 0, closing_qty: 0 }];
  }

  // Destructure the results
  const { sum_amount, sum_qty } = result[0];

  // console.table(result);

  // Calculate the Weighted Purchase Rate
  const weightedPurchaseRate = (sum_amount + Number(getAverageRate[0].average_rate * getAverageRate[0].closing_qty)) / (sum_qty + Number(getAverageRate[0].closing_qty));

  // console.table([
  //   {
  //     weightedPurchaseRate : Number.isNaN(weightedPurchaseRate) ? 0 : weightedPurchaseRate.toFixed(2),
  //     sum_qty,
  //     sum_amount,
  //     avr_val: getAverageRate[0].average_rate * getAverageRate[0].closing_qty,
  //     closing_qty: getAverageRate[0].closing_qty,
  //     avr_rate: getAverageRate[0].average_rate,
  //     closing: getAverageRate[0].closing_qty,
  //     date,
  //   },
  // ]);

  // Return the calculated rate
  return Number.isNaN(weightedPurchaseRate) ? 0 : weightedPurchaseRate.toFixed(2);
};


const getWeightedPurchaseRateWithTime = async function (componentKey, date) {
  // Define the query to calculate the Weighted Purchase Rate
  // const query = "SELECT COALESCE(SUM(in_po_rate * exchange_rate * qty), 0) AS sum_amount, COALESCE(SUM(qty), 0) AS sum_qty FROM rm_location WHERE components_id = :componentKey AND DATE_FORMAT(insert_date, '%Y-%m-%d %H:%i:%s') <= :date AND trans_type IN('INWARD') AND vendor_type IN('v01')";
  const query =
    "SELECT COALESCE(SUM((in_po_rate * exchange_rate * qty) + custom_duty + freight_charge), 0) AS sum_amount, COALESCE(SUM(qty), 0) AS sum_qty FROM rm_location WHERE components_id = :componentKey AND DATE_FORMAT(insert_date, '%Y-%m-%d %H:%i:%s') BETWEEN :startDate AND :date AND trans_type IN('INWARD') AND (in_module != 'IN-FGRETURN')";

  // Execute the query with the provided parameters
  const result = await invtDB.query(query, {
    replacements: { componentKey, date, startDate: `2025-04-01 00:00:00` },
    type: invtDB.QueryTypes.SELECT,
  });

  let getAverageRate = await invtDB.query("SELECT * FROM tbl_average_rate WHERE component_key = :componentKey", {
    replacements: { componentKey },
    type: invtDB.QueryTypes.SELECT,
  });

  console.table(getAverageRate);

  if (getAverageRate.length <= 0) {
    getAverageRate = [{ average_rate: 0, closing_qty: 0 }];
  }

  // Destructure the results
  const { sum_amount, sum_qty } = result[0];

  // console.table(result);

  // Calculate the Weighted Purchase Rate
  const weightedPurchaseRate = (sum_amount + Number(getAverageRate[0].average_rate * getAverageRate[0].closing_qty)) / (sum_qty + Number(getAverageRate[0].closing_qty));

  // console.table([
  //   {
  //     weightedPurchaseRate : Number.isNaN(weightedPurchaseRate) ? 0 : weightedPurchaseRate.toFixed(2),
  //     sum_qty,
  //     sum_amount,
  //     avr_val: getAverageRate[0].average_rate * getAverageRate[0].closing_qty,
  //     closing_qty: getAverageRate[0].closing_qty,
  //     avr_rate: getAverageRate[0].average_rate,
  //     closing: getAverageRate[0].closing_qty,
  //     date,
  //   },
  // ]);

  // Return the calculated rate
  return Number.isNaN(weightedPurchaseRate) ? 0 : weightedPurchaseRate.toFixed(2);
};


const getWeightedSKURate = async function (productKey, date) {
  try {
    const startDate = '2026-02-01 00:00:00';
    
    // Query: SUM(in_fg_rate × mfg_prod_planing_qty) and SUM(mfg_prod_planing_qty) from mfg_production_2 (type 'C' only)
    const query =
      "SELECT COALESCE(SUM((CASE WHEN mfg_production_3.type = 'IN' THEN mfg_production_2.in_fg_rate WHEN mfg_production_3.type = 'FGMIN' THEN mfg_production_3.in_fg_rate END) * (CASE WHEN mfg_production_3.type = 'IN' THEN mfg_production_2.mfg_prod_planing_qty WHEN mfg_production_3.type = 'FGMIN' THEN mfg_production_3.mfg_approve_in_qty END)), 0) AS sum_amount, COALESCE(SUM(CASE WHEN mfg_production_3.type = 'IN' THEN mfg_production_2.mfg_prod_planing_qty WHEN mfg_production_3.type = 'FGMIN' THEN mfg_production_3.mfg_approve_in_qty END), 0) AS sum_qty FROM mfg_production_3 LEFT JOIN products ON mfg_production_3.mfg_pro_apr_sku = products.p_sku LEFT JOIN mfg_production_2 ON mfg_production_3.mfg_ref_transid_2 = mfg_production_2.mfg_transaction AND mfg_production_2.mfg_prod_type = 'C' WHERE products.product_key = :productKey AND DATE_FORMAT(mfg_production_3.mfg_pro_apr_fulldate, '%Y-%m-%d %H:%i:%s') >= :startDate AND DATE_FORMAT(mfg_production_3.mfg_pro_apr_fulldate, '%Y-%m-%d %H:%i:%s') <= :date AND mfg_production_3.type IN('IN', 'FGMIN') AND ((mfg_production_3.type = 'IN' AND mfg_production_2.in_fg_rate IS NOT NULL AND mfg_production_2.in_fg_rate != '' AND mfg_production_2.in_fg_rate != '0' AND CAST(mfg_production_2.in_fg_rate AS DECIMAL(15,4)) > 0) OR (mfg_production_3.type = 'FGMIN' AND mfg_production_3.in_fg_rate IS NOT NULL AND mfg_production_3.in_fg_rate != '' AND mfg_production_3.in_fg_rate != '0' AND CAST(mfg_production_3.in_fg_rate AS DECIMAL(15,4)) > 0))";
    const result = await invtDB.query(query, {
      replacements: { productKey, date, startDate },
      type: invtDB.QueryTypes.SELECT,
    });

    let getAverageRate = await invtDB.query("SELECT * FROM tbl_sku_average_rate WHERE sku_key = :productKey", {
      replacements: { productKey },
      type: invtDB.QueryTypes.SELECT,
    });

    if (getAverageRate.length <= 0) {
      getAverageRate = [{ average_rate: 0, closing_qty: 0, total_value: 0 }];
    }

    const { sum_amount, sum_qty } = result[0];
    const totalValue = Number(getAverageRate[0].total_value || 0);
    const openingQty = Number(getAverageRate[0].closing_qty || 0);

    // Formula: (SUM(rate × qty) + total_value) / (SUM(qty) + closing_qty)
    const numerator = Number(sum_amount) + totalValue;
    const denominator = Number(sum_qty) + openingQty;
    const weightedSKURate = denominator > 0 ? numerator / denominator : 0;

    return Number.isNaN(weightedSKURate) ? 0 : weightedSKURate;
  } catch (error) {
    console.error("Error fetching Weighted SKU Rate:", error);
    return 0;
  }
};

module.exports = {
  verifyToken,
  emit_notifications,
  error_log,
  emit_error_msg,
  download_start_detail,
  getWeightedPurchaseRate,
  getWeightedPurchaseRateWithTime,
  getWeightedSKURate
};
