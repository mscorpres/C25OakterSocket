const path = require("path");
const moment = require("moment");
const XLSX = require("xlsx");
const jwt = require("jsonwebtoken");
const Validator = require("validatorjs");
const fs = require("fs");

const helper = require("../../../helper/helper");
const { otherDB, invtDB } = require("../../../config/db/connection");
const { htmlTemplate } = require("../../backendProcess/EmailTemplate/fileDownload");
const { verifyToken, error_log, emit_notifications, emit_error_msg } = require("../../../helper/utils");

// Optimized batch weighted purchase rate calculation
const getBatchWeightedPurchaseRates = async function (componentKeys, date) {
  try {
    const startDate = '2025-04-01 00:00:00';
    
    // Get all purchase data in single query
    const purchaseQuery = `
      SELECT 
        components_id,
        COALESCE(SUM((in_po_rate * exchange_rate * qty) + custom_duty + freight_charge), 0) AS sum_amount,
        COALESCE(SUM(qty), 0) AS sum_qty 
      FROM rm_location 
      WHERE components_id IN (:componentKeys)
        AND DATE_FORMAT(insert_date, '%Y-%m-%d %H:%i:%s') BETWEEN :startDate AND :date 
        AND trans_type IN('INWARD') 
        AND (in_module != 'IN-FGRETURN')
      GROUP BY components_id
    `;

    // Get all average rates in single query
    const averageRateQuery = `
      SELECT component_key, average_rate, closing_qty 
      FROM tbl_average_rate 
      WHERE component_key IN (:componentKeys)
    `;

    // Execute both queries in parallel
    const [purchaseResults, averageRateResults] = await Promise.all([
      invtDB.query(purchaseQuery, {
        replacements: { componentKeys, date, startDate },
        type: invtDB.QueryTypes.SELECT,
      }),
      invtDB.query(averageRateQuery, {
        replacements: { componentKeys },
        type: invtDB.QueryTypes.SELECT,
      })
    ]);

    // Create lookup maps for fast access
    const purchaseMap = new Map();
    purchaseResults.forEach(result => {
      purchaseMap.set(result.components_id, {
        sum_amount: result.sum_amount,
        sum_qty: result.sum_qty
      });
    });

    const averageRateMap = new Map();
    averageRateResults.forEach(result => {
      averageRateMap.set(result.component_key, {
        average_rate: result.average_rate,
        closing_qty: result.closing_qty
      });
    });

    // Calculate weighted purchase rates for all components
    const weightedRates = new Map();
    componentKeys.forEach(componentKey => {
      const purchaseData = purchaseMap.get(componentKey) || { sum_amount: 0, sum_qty: 0 };
      const averageData = averageRateMap.get(componentKey) || { average_rate: 0, closing_qty: 0 };

      const avgValue = Number(averageData.average_rate) * Number(averageData.closing_qty);
      const totalValue = purchaseData.sum_amount + avgValue;
      const totalQty = purchaseData.sum_qty + Number(averageData.closing_qty);

      const weightedPurchaseRate = totalQty > 0 ? totalValue / totalQty : 0;
      weightedRates.set(componentKey, Number.isNaN(weightedPurchaseRate) ? 0 : Number(weightedPurchaseRate.toFixed(2)));
    });

    return weightedRates;
  } catch (error) {
    console.error("Error in batch weighted purchase rate calculation:", error);
    return new Map();
  }
};

exports.monthly_audit = async function (io, socket) {
  try {
    socket.on("monthly_audit", async (data) => {
      // Validate input
      const valid = new Validator({ date: data.otherdata.date }, { date: "required" });
      if (valid.fails()) {
        emit_error_msg(io, socket, "Please select date");
        return;
      }

      const token_res = await verifyToken(socket.handshake.auth.token);
      const user_id = token_res.crn_id;
      const formattedDate = moment(data.otherdata.date, "DD-MM-YYYY").format("YYYY-MM-DD");
      const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");

      // Check for existing request and generate filename
      let fileName = `WEEKLY_AUDIT-${user_id}${Math.floor(Math.random() * 9999)}.csv`;
      const check_data = await otherDB.query(
        "SELECT * FROM user_files_req WHERE user_id = :uid AND req_code = 'MONTHLY_AUDIT' AND req_date = :date AND status = 'pending'",
        {
          replacements: { uid: user_id, date: data.otherdata.date },
          type: otherDB.QueryTypes.SELECT,
        }
      );
      
      if (check_data.length > 0) {
        fileName = JSON.parse(check_data[0].other_data).fileName;
      }

      // Create new request
      await otherDB.query(
        "INSERT INTO user_files_req (request_txt_label, req_code, user_id, req_date, msg_type, status, other_data, insert_date, reactNotificationId) VALUES ('MONTHLY AUDIT', 'MONTHLY_AUDIT', :uid, :req_date, 'file', 'pending', :other, :insert_date, :notificationId)",
        {
          replacements: {
            uid: user_id,
            req_date: data.otherdata.date,
            other: JSON.stringify({ fileName }),
            insert_date: currentDateTime,
            notificationId: data.notificationId ?? 0,
          },
          type: otherDB.QueryTypes.INSERT,
        }
      );

      io.to(user_id).emit("download_start_detail", {
        title: "VR01",
        details: data.otherdata.date,
        notificationId: data.notificationId ?? 0,
        status: "pending",
        detailStatus: true,
        type: "file",
      });

      // Fetch all required data in parallel
      const [locationData, partCodesData, componentData] = await Promise.all([
        // Fetch location arrays in a single query
        invtDB.query(
          "SELECT loc_all_key, locations FROM location_allotted WHERE loc_all_key IN (:location_keys)",
          {
            replacements: { location_keys: ["2023112719352224", "20231127193722306", "20231127193739513", "20231127193756891"] },
            type: invtDB.QueryTypes.SELECT,
          }
        ),
        // Fetch part codes
        otherDB.query("SELECT part_code FROM monthly_audit", {
          type: otherDB.QueryTypes.SELECT,
        }),
        // This will be filled after we get part codes
        Promise.resolve([])
      ]);

      // Process locations
      const locations = {
        rm_locations: [],
        sf_locations: [],
        vendor_locations: [],
        jw_locations: [],
      };
      
      locationData.forEach((loc) => {
        const locationArray = loc.locations.split(",");
        switch (loc.loc_all_key) {
          case "2023112719352224":
            locations.rm_locations = locationArray;
            break;
          case "20231127193722306":
            locations.sf_locations = locationArray;
            break;
          case "20231127193739513":
            locations.vendor_locations = locationArray;
            break;
          case "20231127193756891":
            locations.jw_locations = locationArray;
            break;
        }
      });

      const part_codes = partCodesData.map((item) => item.part_code);

      // Fetch component data with latest insert_date for each component
      const componentQuery = `
        SELECT 
          c.component_key, 
          c.c_part_no, 
          c.c_name, 
          c.c_new_part_no,
          COALESCE(latest_rm.latest_date, '1970-01-01 00:00:00') as insert_date,
          COALESCE(latest_rm.total_qty, 0) as qty,
          COALESCE(latest_rm.total_other_qty, 0) as other_qty
        FROM components c
        LEFT JOIN (
          SELECT 
            components_id,
            MAX(insert_date) as latest_date,
            SUM(qty) as total_qty,
            SUM(other_qty) as total_other_qty
          FROM rm_location 
          WHERE components_id IN (
            SELECT component_key FROM components WHERE c_part_no IN (:part_codes)
          )
          GROUP BY components_id
        ) latest_rm ON c.component_key = latest_rm.components_id
        WHERE c.c_part_no IN (:part_codes)
      `;

      const stmt_comp = await invtDB.query(componentQuery, {
        replacements: { part_codes },
        type: invtDB.QueryTypes.SELECT,
      });

      if (stmt_comp.length === 0) {
        emit_error_msg(io, socket, "No components found for the given part codes");
        return;
      }

      const component_ids = stmt_comp.map((c) => c.component_key);

      // Fetch all balance data in parallel with weighted purchase rates
      const [balances, weightedRatesMap] = await Promise.all([
        invtDB.query(
          `SELECT 
            components_id,
            SUM(CASE WHEN loc_in IN (:rm_locations) AND trans_type IN ('INWARD', 'ISSUE', 'JOBWORK', 'REJECTION', 'TRANSFER') AND DATE_FORMAT(insert_date, '%Y-%m-%d') BETWEEN :date1 AND :date2 THEN qty + other_qty ELSE 0 END) AS rm_inward,
            SUM(CASE WHEN loc_out IN (:rm_locations) AND trans_type IN ('CONSUMPTION', 'ISSUE', 'JOBWORK', 'REJECTION', 'TRANSFER') AND DATE_FORMAT(insert_date, '%Y-%m-%d') BETWEEN :date1 AND :date2 THEN qty + other_qty ELSE 0 END) AS rm_outward,
            SUM(CASE WHEN loc_in IN (:rm_locations) AND trans_type IN ('INWARD', 'ISSUE', 'JOBWORK', 'REJECTION', 'TRANSFER') AND DATE_FORMAT(insert_date, '%Y-%m-%d') < :date1 THEN qty + other_qty ELSE 0 END) AS rm_inbefor,
            SUM(CASE WHEN loc_out IN (:rm_locations) AND trans_type IN ('CONSUMPTION', 'ISSUE', 'JOBWORK', 'REJECTION', 'TRANSFER') AND DATE_FORMAT(insert_date, '%Y-%m-%d') < :date1 THEN qty + other_qty ELSE 0 END) AS rm_outbefore,
            SUM(CASE WHEN loc_in IN (:sf_locations) AND trans_type IN ('INWARD', 'ISSUE', 'JOBWORK', 'REJECTION', 'TRANSFER') AND DATE_FORMAT(insert_date, '%Y-%m-%d') BETWEEN :date1 AND :date2 THEN qty + other_qty ELSE 0 END) AS sf_inward,
            SUM(CASE WHEN loc_out IN (:sf_locations) AND trans_type IN ('CONSUMPTION', 'ISSUE', 'JOBWORK', 'REJECTION', 'TRANSFER') AND DATE_FORMAT(insert_date, '%Y-%m-%d') BETWEEN :date1 AND :date2 THEN qty + other_qty ELSE 0 END) AS sf_outward,
            SUM(CASE WHEN loc_in IN (:sf_locations) AND trans_type IN ('INWARD', 'ISSUE', 'JOBWORK', 'REJECTION', 'TRANSFER') AND DATE_FORMAT(insert_date, '%Y-%m-%d') < :date1 THEN qty + other_qty ELSE 0 END) AS sf_inbefor,
            SUM(CASE WHEN loc_out IN (:sf_locations) AND trans_type IN ('CONSUMPTION', 'ISSUE', 'JOBWORK', 'REJECTION', 'TRANSFER') AND DATE_FORMAT(insert_date, '%Y-%m-%d') < :date1 THEN qty + other_qty ELSE 0 END) AS sf_outbefore,
            SUM(CASE WHEN loc_in IN (:vendor_locations) AND trans_type IN ('INWARD', 'ISSUE', 'JOBWORK', 'REJECTION', 'TRANSFER') AND DATE_FORMAT(insert_date, '%Y-%m-%d') BETWEEN :date1 AND :date2 THEN qty + other_qty ELSE 0 END) AS vendor_inward,
            SUM(CASE WHEN loc_out IN (:vendor_locations) AND trans_type IN ('CONSUMPTION', 'ISSUE', 'JOBWORK', 'REJECTION', 'TRANSFER') AND DATE_FORMAT(insert_date, '%Y-%m-%d') BETWEEN :date1 AND :date2 THEN qty + other_qty ELSE 0 END) AS vendor_outward,
            SUM(CASE WHEN loc_in IN (:vendor_locations) AND trans_type IN ('INWARD', 'ISSUE', 'JOBWORK', 'REJECTION', 'TRANSFER') AND DATE_FORMAT(insert_date, '%Y-%m-%d') < :date1 THEN qty + other_qty ELSE 0 END) AS vendor_inbefor,
            SUM(CASE WHEN loc_out IN (:vendor_locations) AND trans_type IN ('CONSUMPTION', 'ISSUE', 'JOBWORK', 'REJECTION', 'TRANSFER') AND DATE_FORMAT(insert_date, '%Y-%m-%d') < :date1 THEN qty + other_qty ELSE 0 END) AS vendor_outbefore,
            SUM(CASE WHEN loc_in IN (:jw_locations) AND trans_type IN ('INWARD', 'ISSUE', 'JOBWORK', 'REJECTION', 'TRANSFER') AND DATE_FORMAT(insert_date, '%Y-%m-%d') BETWEEN :date1 AND :date2 THEN qty + other_qty ELSE 0 END) AS jw_inward,
            SUM(CASE WHEN loc_out IN (:jw_locations) AND trans_type IN ('CONSUMPTION', 'ISSUE', 'JOBWORK', 'REJECTION', 'TRANSFER') AND DATE_FORMAT(insert_date, '%Y-%m-%d') BETWEEN :date1 AND :date2 THEN qty + other_qty ELSE 0 END) AS jw_outward,
            SUM(CASE WHEN loc_in IN (:jw_locations) AND trans_type IN ('INWARD', 'ISSUE', 'JOBWORK', 'REJECTION', 'TRANSFER') AND DATE_FORMAT(insert_date, '%Y-%m-%d') < :date1 THEN qty + other_qty ELSE 0 END) AS jw_inbefor,
            SUM(CASE WHEN loc_out IN (:jw_locations) AND trans_type IN ('CONSUMPTION', 'ISSUE', 'JOBWORK', 'REJECTION', 'TRANSFER') AND DATE_FORMAT(insert_date, '%Y-%m-%d') < :date1 THEN qty + other_qty ELSE 0 END) AS jw_outbefore
          FROM rm_location
          WHERE components_id IN (:component_ids)
            AND trans_type IN ('INWARD', 'ISSUE', 'JOBWORK', 'REJECTION', 'TRANSFER', 'CONSUMPTION')
            AND DATE_FORMAT(insert_date, '%Y-%m-%d') <= :date2
          GROUP BY components_id`,
          {
            replacements: {
              rm_locations: locations.rm_locations,
              sf_locations: locations.sf_locations,
              vendor_locations: locations.vendor_locations,
              jw_locations: locations.jw_locations,
              component_ids,
              date1: formattedDate,
              date2: formattedDate,
            },
            type: invtDB.QueryTypes.SELECT,
          }
        ),
        // Calculate weighted purchase rates for all components at once
        getBatchWeightedPurchaseRates(
          component_ids,
          moment().format("YYYY-MM-DD HH:mm:ss")
        )
      ]);

      // Create balance lookup map
      const balanceMap = new Map();
      balances.forEach(balance => {
        balanceMap.set(balance.components_id, balance);
      });

      // Process report data efficiently
      const report_data = [];
      const invt_r28_data = [];

      // Process all components
      stmt_comp.forEach(comp => {
        const balance = balanceMap.get(comp.component_key) || {
          rm_inbefor: 0, rm_outbefore: 0, rm_inward: 0, rm_outward: 0,
          sf_inbefor: 0, sf_outbefore: 0, sf_inward: 0, sf_outward: 0,
          vendor_inbefor: 0, vendor_outbefore: 0, vendor_inward: 0, vendor_outward: 0,
          jw_inbefor: 0, jw_outbefore: 0, jw_inward: 0, jw_outward: 0,
        };

        const rm_closing = Number(balance.rm_inbefor - balance.rm_outbefore) + Number(balance.rm_inward - balance.rm_outward);
        const sf_closing = Number(balance.sf_inbefor - balance.sf_outbefore) + Number(balance.sf_inward - balance.sf_outward);
        const vendor_closing = Number(balance.vendor_inbefor - balance.vendor_outbefore) + Number(balance.vendor_inward - balance.vendor_outward);
        const jw_closing = Number(balance.jw_inbefor - balance.jw_outbefore) + Number(balance.jw_inward - balance.jw_outward);

        const weightedPurchaseRate = weightedRatesMap.get(comp.component_key) || 0;
        const totalCost = helper.number((Number(comp.qty || 0) + Number(comp.other_qty || 0)) * weightedPurchaseRate);

        // Insert into invt_r28_data for bulk insert
        invt_r28_data.push([
          comp.c_part_no,
          comp.c_new_part_no,
          comp.c_name,
          helper.number(rm_closing),
          helper.number(sf_closing),
          helper.number(vendor_closing),
          helper.number(jw_closing),
          currentDateTime,
          user_id,
          data.otherdata.date,
          weightedPurchaseRate,
          totalCost,
        ]);

        // Push to report_data
        report_data.push({
          PART_NO: comp.c_part_no,
          SECONDARY_PART_NO: comp.c_new_part_no,
          PART_NAME: comp.c_name,
          RM_CLOSING: helper.number(rm_closing),
          SF_CLOSING: helper.number(sf_closing),
          WEIGHTED_PURCHASE_RATE: weightedPurchaseRate,
          WEIGHTED_TOTAL_COST: totalCost,
        });
      });

      // Bulk insert into invt_r28 (chunked for large datasets)
      if (invt_r28_data.length > 0) {
        const chunkSize = 1000;
        const chunks = [];
        for (let i = 0; i < invt_r28_data.length; i += chunkSize) {
          chunks.push(invt_r28_data.slice(i, i + chunkSize));
        }

        // Insert chunks in parallel (but limit concurrency to avoid overwhelming DB)
        const insertPromises = chunks.map(chunk => 
          otherDB.query(
            "INSERT INTO invt_r28 (parts_code, c_new_part_no, part_name, rm, sf, vendor, jw, insert_date, insert_by, req_date, weightedPurchaseRate, weightedTotalCost) VALUES ?",
            {
              replacements: [chunk],
              type: otherDB.QueryTypes.INSERT,
            }
          )
        );

        await Promise.all(insertPromises);
      }

      // Generate Excel file
      const worksheet = XLSX.utils.json_to_sheet(report_data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Weekly Audit");
      const filePath = "./files/excel/";
      XLSX.writeFile(workbook, filePath + fileName);

      // Update request status and send email in parallel
      const [, user] = await Promise.all([
        otherDB.query(
          "UPDATE user_files_req SET status = 'complete', other_data = :other WHERE user_id = :uid AND req_code = 'MONTHLY_AUDIT' AND req_date = :req_date",
          {
            replacements: {
              uid: user_id,
              req_date: data.otherdata.date,
              other: JSON.stringify({
                fileName,
                fileUrl: filePath + fileName,
                fileBuffer: Buffer.from(filePath + fileName, "base64"),
              }),
            },
            type: otherDB.QueryTypes.UPDATE,
          }
        ),
        invtDB.query(
          "SELECT Email_ID, user_name FROM admin_login WHERE CustID = :CustID",
          {
            replacements: { CustID: user_id },
            type: invtDB.QueryTypes.SELECT,
          }
        )
      ]);

      // Send email
      if (user.length > 0) {
        const userEmail = user[0].Email_ID;
        const attachment = [{ filename: "Weekly Audit.csv", content: fs.readFileSync(filePath + fileName) }];
        helper.sendMail(
          userEmail,
          "",
          `Weekly Audit ${data.otherdata.date} [File Ready for download] Ref:${helper.randomNumber(99999, 999999)}`,
          htmlTemplate(user[0].user_name, new Date(), "Weekly Audit", `${process.env.SOCKET_API_URL}/${filePath}${fileName}`),
          attachment
        );
      }

      io.to(user_id).emit("download_complete_detail", {
        title: "VR01",
        details: data.otherdata.date,
        notificationId: data.notificationId ?? 0,
        status: "complete",
        detailStatus: true,
        type: "file",
        fileName: fileName,
        fileUrl: `${process.env.SOCKET_API_URL}/${filePath}${fileName}`,
      });

    });
  } catch (err) {
    console.error("Error in monthly_audit:", err);
    error_log({ stack: err.stack });
    emit_error_msg(io, socket, "Something went wrong to generate report. Please try again later");
  }
};