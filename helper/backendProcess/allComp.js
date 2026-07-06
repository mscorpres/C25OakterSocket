const multer = require("multer");
const path = require("path");
const moment = require("moment");
const XLSX = require("xlsx");
const fs = require("fs");
require("dotenv").config();

const { otherDB, invtDB } = require("./../../config/db/connection");
const helper = require("../../helper/helper");
const { htmlTemplate } = require("./EmailTemplate/fileDownload");
const { encode, decode } = require("html-entities");

const Validator = require("validatorjs");
const { error_log } = require("../../helper/utils");

exports.allCompM = async (date, uid, emit_notifications, fileName, notificationId, socket, io, branch) => {
  const validation = new Validator(
    { date: date },
    {
      date: "required",
    },
  );

  if (validation.fails()) {
    return { code: 500, msg: "Please Select Date" };
  }

  try {
    try {
      fs.accessSync("./files/excel/" + fileName);
    } catch (error) {
      fs.writeFileSync("./files/excel/" + fileName, "", "utf8");
    }

    const workbook = XLSX.readFile("./files/excel/" + fileName, { type: "file", append: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    let totalRows = rows.length;

    let comp_stmt;
    const BATCH_SIZE = 500; // Process 500 components at a time
    const PROGRESS_UPDATE_INTERVAL = 100; // Update progress every 100 components

    if (totalRows <= 0) {
      XLSX.utils.sheet_add_aoa(sheet, [["DATE RANGE", "PART_CODE", "CAT_PART_CODE", "COMPONENT NAME", "OPENING", "INWARD", "OUTWARD", "CLOSING", "LASTIN", "LASTOUT", "AVG_RATE"]], { origin: 0 });
      comp_stmt = await invtDB.query("SELECT `component_key`, `c_part_no`, `c_new_part_no` ,`c_name`, `c_min_stock` FROM `components` WHERE `c_type` = 'R' ORDER BY `component_key`", {
        type: invtDB.QueryTypes.SELECT,
      });
    } else {
      comp_stmt = await invtDB.query(
        `SELECT component_key, c_part_no, c_new_part_no, c_name, c_min_stock FROM components WHERE c_type = 'R' ORDER BY component_key LIMIT ${totalRows} , ${BATCH_SIZE}`,
        {
          type: invtDB.QueryTypes.SELECT,
        },
      );
    }

    let fromdate = moment(date[0], "DD-MM-YYYY").format("YYYY-MM-DD");
    let todate = moment(date[1], "DD-MM-YYYY").format("YYYY-MM-DD");
    let location_key = "";

    // A21 store LOCATION
    if (branch == "BROAKTRC25") {
      location_key = "202381510340465";
    }
    // B29 store LOCATION
    if (branch == "BRMSC029") {
      location_key = "2023815103533746";
    }

    // BRANCH STOCK LOCATION - Get once, not in loop
    let stmt_get_a21 = await invtDB.query("SELECT locations FROM `location_allotted` WHERE `loc_all_key` = :location_key", {
      replacements: { location_key: location_key },
      type: invtDB.QueryTypes.SELECT,
    });

    let all_branch__location = [];
    if (stmt_get_a21.length > 0) {
      for (let loc_i = 0; loc_i < stmt_get_a21.length; loc_i++) {
        all_branch__location = stmt_get_a21[loc_i].locations.split(",");
      }
    } else {
      console.log("Branch Location is not found");
    }

    let total_comp = await invtDB.query("SELECT COUNT(*) AS `records` FROM `components` WHERE `c_type` = 'R'", { type: invtDB.QueryTypes.SELECT });
    const records = total_comp[0].records;

    if (comp_stmt.length > 0) {
      // Extract component keys for batch queries
      const componentKeys = comp_stmt.map((comp) => comp.component_key);

      // OPTIMIZED: Get all stock data in one query instead of individual queries
      const stockData = await getBatchStockData(componentKeys, fromdate, todate, all_branch__location, invtDB);

      // OPTIMIZED: Get all last in/out dates in batch queries
      const lastInData = await getBatchLastInData(componentKeys, invtDB);
      const lastOutData = await getBatchLastOutData(componentKeys, invtDB);

      // OPTIMIZED: Get all average rates in batch
      const avgRateData = await getBatchAvgRates(componentKeys, moment(date[1], "DD-MM-YYYY").format("YYYY-MM-DD HH:mm:ss"));

      // Process components in batches and collect all rows for batch Excel write
      const excelRows = [];

      for (let i = 0; i < comp_stmt.length; i++) {
        const compKey = comp_stmt[i].component_key;

        // Get data from our batch results
        const stock = stockData[compKey] || { inward: 0, outward: 0, inbefor: 0, outbefore: 0 };
        const INWARD = helper.number(stock.inward);
        const OUTWARD = helper.number(stock.outward);
        const OPENING = helper.number(stock.inbefor - stock.outbefore);

        const LASTIN = lastInData[compKey] || "";
        const LASTOUT = lastOutData[compKey] || "";
        const CLOSING = helper.number(Number(OPENING) + Number(INWARD) - Number(OUTWARD));
        const AVG_RATE = avgRateData[compKey] || 0;

        const dateRange = `${date[0]} to ${date[1]}`;
        const tempArr = [dateRange, comp_stmt[i].c_part_no, comp_stmt[i].c_new_part_no, decode(comp_stmt[i].c_name), OPENING, INWARD, OUTWARD, CLOSING, LASTIN, LASTOUT, AVG_RATE];
        excelRows.push(tempArr);

        totalRows++;

        // Update progress less frequently
        if (i % PROGRESS_UPDATE_INTERVAL === 0 || i === comp_stmt.length - 1) {
          if (notificationId) {
            let completedPercentage = (totalRows * 100) / records;
            io.to(uid).emit("getting-loading-percentage", {
              notificationId: notificationId,
              total: completedPercentage.toFixed(1),
            });
          } else {
            socket.emit("all_comp", {
              total: `${totalRows}/${records}`,
            });
          }
        }
      }

      // OPTIMIZED: Write all rows to Excel at once instead of one by one
      if (excelRows.length > 0) {
        XLSX.utils.sheet_add_aoa(sheet, excelRows, { origin: -1 });
        XLSX.writeFile(workbook, "./files/excel/" + fileName);
      }

      // Update database once after processing batch
      let stmt = await otherDB.query("UPDATE `user_files_req` SET `other_data` = :other WHERE `user_id`= :uid AND `req_code` = 'ALLCOMP'", {
        replacements: {
          uid: uid,
          other: JSON.stringify({
            fileName: fileName,
            fileUrl: "./files/excel/" + fileName,
            totalRows: totalRows,
          }),
        },
        type: otherDB.QueryTypes.UPDATE,
      });

      // Check if we're done with all components
      if (totalRows >= records) {
        let stmt = await otherDB.query("UPDATE `user_files_req` SET `status` = 'complete', `other_data` = :other WHERE `user_id`= :uid AND `req_code` = 'ALLCOMP'", {
          replacements: {
            uid: uid,
            other: JSON.stringify({
              fileName: fileName,
              fileUrl: "./files/excel/" + fileName,
              totalRows: totalRows,
            }),
          },
          type: otherDB.QueryTypes.UPDATE,
        });
        emit_notifications(notificationId);

        // SEND USER MAIL
        let user = await invtDB.query("SELECT `Email_ID`,`user_name` from `admin_login` WHERE `CustID`= :CustID", {
          replacements: {
            CustID: uid,
          },
          type: invtDB.QueryTypes.SELECT,
        });
        let userEmail = user[0].Email_ID;
        let attachment = [
          {
            filename: "ALL COMP REPORT.csv",
            content: fs.readFileSync("./files/excel/" + fileName),
          },
        ];
        helper.sendMail(
          userEmail,
          "",
          "All Component [File Ready for download] Ref:" + helper.randomNumber(99999, 999999),
          htmlTemplate(user[0].user_name, new Date(), "All Component", `${process.env.SOCKET_API_URL}/${fileName}`),
          attachment,
        );
      }
    }
  } catch (err) {
    error_log({ stack: err.stack });
    let stmt = await otherDB.query("UPDATE `user_files_req` SET `status` = 'failed' WHERE `reactNotificationId`= :uid AND `req_code` = 'ALLCOMP'", {
      replacements: {
        uid: notificationId,
      },
      type: otherDB.QueryTypes.UPDATE,
    });
    emit_notifications(notificationId);
  }
};

// OPTIMIZED: Batch function to get stock data for all components at once
async function getBatchStockData(componentKeys, fromdate, todate, all_branch__location, invtDB) {
  if (componentKeys.length === 0) return {};

  const placeholders = componentKeys.map((_, index) => `:comp${index}`).join(",");
  const replacements = {};
  componentKeys.forEach((key, index) => {
    replacements[`comp${index}`] = key;
  });
  replacements.date1 = fromdate;
  replacements.date2 = todate;
  replacements.location = all_branch__location;

  const query = `
    SELECT 
      components_id,
      COALESCE(SUM(CASE 
        WHEN trans_type IN ('INWARD', 'ISSUE', 'JOBWORK', 'REJECTION', 'TRANSFER') 
        AND loc_in IN (:location) 
        AND DATE_FORMAT(insert_date,'%Y-%m-%d') BETWEEN :date1 AND :date2 
        THEN qty + other_qty ELSE 0 END), 0) AS inward,
      COALESCE(SUM(CASE 
        WHEN trans_type IN ('CONSUMPTION', 'ISSUE', 'JOBWORK', 'REJECTION', 'TRANSFER') 
        AND loc_out IN (:location) 
        AND DATE_FORMAT(insert_date,'%Y-%m-%d') BETWEEN :date1 AND :date2 
        THEN qty + other_qty ELSE 0 END), 0) AS outward,
      COALESCE(SUM(CASE 
        WHEN trans_type IN ('INWARD', 'ISSUE', 'JOBWORK', 'REJECTION', 'TRANSFER') 
        AND loc_in IN (:location) 
        AND DATE_FORMAT(insert_date,'%Y-%m-%d') < :date1 
        THEN qty + other_qty ELSE 0 END), 0) AS inbefor,
      COALESCE(SUM(CASE 
        WHEN trans_type IN ('CONSUMPTION', 'ISSUE', 'JOBWORK', 'REJECTION', 'TRANSFER') 
        AND loc_out IN (:location) 
        AND DATE_FORMAT(insert_date,'%Y-%m-%d') < :date1 
        THEN qty + other_qty ELSE 0 END), 0) AS outbefore
    FROM rm_location 
    WHERE components_id IN (${placeholders})
    GROUP BY components_id
  `;

  const results = await invtDB.query(query, {
    replacements,
    type: invtDB.QueryTypes.SELECT,
  });

  // Convert to object with component_key as key
  const stockMap = {};
  results.forEach((result) => {
    stockMap[result.components_id] = result;
  });

  return stockMap;
}

// OPTIMIZED: Batch function to get last in dates
async function getBatchLastInData(componentKeys, invtDB) {
  if (componentKeys.length === 0) return {};

  const placeholders = componentKeys.map((_, index) => `:comp${index}`).join(",");
  const replacements = {};
  componentKeys.forEach((key, index) => {
    replacements[`comp${index}`] = key;
  });

  const query = `
    SELECT 
      components_id,
      MAX(insert_date) as last_in_date
    FROM rm_location 
    WHERE components_id IN (${placeholders})
    AND trans_type = 'INWARD' 
    AND vendor_type = 'v01'
    GROUP BY components_id
  `;

  const results = await invtDB.query(query, {
    replacements,
    type: invtDB.QueryTypes.SELECT,
  });

  const lastInMap = {};
  results.forEach((result) => {
    lastInMap[result.components_id] = moment(result.last_in_date, "YYYY-MM-DD").format("DD-MM-YYYY");
  });

  return lastInMap;
}

// OPTIMIZED: Batch function to get last out dates
async function getBatchLastOutData(componentKeys, invtDB) {
  if (componentKeys.length === 0) return {};

  const placeholders = componentKeys.map((_, index) => `:comp${index}`).join(",");
  const replacements = {};
  componentKeys.forEach((key, index) => {
    replacements[`comp${index}`] = key;
  });

  const query = `
    SELECT 
      components_id,
      MAX(insert_date) as last_out_date
    FROM rm_location 
    WHERE components_id IN (${placeholders})
    AND trans_type IN ('ISSUE', 'TRANSFER')
    GROUP BY components_id
  `;

  const results = await invtDB.query(query, {
    replacements,
    type: invtDB.QueryTypes.SELECT,
  });

  const lastOutMap = {};
  results.forEach((result) => {
    lastOutMap[result.components_id] = moment(result.last_out_date, "YYYY-MM-DD").format("DD-MM-YYYY");
  });

  return lastOutMap;
}

// OPTIMIZED: Batch function to get average rates
async function getBatchAvgRates(componentKeys, toDate) {
  const avgRateMap = {};

  // Use Promise.all to get all rates in parallel instead of sequential
  const ratePromises = componentKeys.map(async (componentKey) => {
    try {
      const rate = await require("../utils").getWeightedPurchaseRate(componentKey, toDate);
      return { componentKey, rate };
    } catch (error) {
      return { componentKey, rate: 0 };
    }
  });

  const rateResults = await Promise.all(ratePromises);
  rateResults.forEach((result) => {
    avgRateMap[result.componentKey] = result.rate;
  });

  return avgRateMap;
}
