const moment = require("moment");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const { otherDB, invtDB } = require("../../config/db/connection");
const { getWeightedPurchaseRate } = require("../utils");
const { error_log } = require("../utils");
const { htmlTemplate } = require("./EmailTemplate/fileDownload");
const helper = require("../../helper/helper");
const { decode } = require("html-entities");

const Validator = require("validatorjs");

/** Max days in date range to avoid huge Excel files */
const MAX_DATE_RANGE_DAYS = 92;

/**
 * Generate Excel report: Weighted Average Rate of Components Date-wise.
 * Uses the same weighted rate calculation as allComp.js (getWeightedPurchaseRate).
 *
 * @param {string|string[]} dateInput - Single date "DD-MM-YYYY" or date range ["DD-MM-YYYY", "DD-MM-YYYY"]
 * @param {string|number} uid - User ID
 * @param {Function} emit_notifications - Callback for completion notification
 * @param {string} fileName - Output Excel file name
 * @param {string|number} notificationId - Notification ID
 * @param {object} socket - Socket instance
 * @param {object} io - Socket.IO server
 * @param {string} [reqDate] - Request date label for DB update (e.g. "DD-MM-YYYY" or "DD-MM-YYYY_to_DD-MM-YYYY")
 * @returns {Promise<{code: number, msg?: string}>}
 */
exports.weightedRateReportM = async (dateInput, uid, emit_notifications, fileName, notificationId, socket, io, reqDate) => {
  console.log("[weightedRateReportM] dateInput:", dateInput, "uid:", uid);
  const isRange = Array.isArray(dateInput) && dateInput.length === 2;
  const singleDate = !isRange && typeof dateInput === "string";

  const validation = new Validator(
    { dateInput: dateInput },
    {
      dateInput: "required",
    }
  );

  if (validation.fails()) {
    console.log("[weightedRateReportM] validation failed");
    return { code: 500, msg: "Please provide a date or date range" };
  }

  let fromDateMoment, toDateMoment, datesToProcess = [];

  if (isRange) {
    const [fromStr, toStr] = dateInput;
    fromDateMoment = moment(fromStr, "DD-MM-YYYY");
    toDateMoment = moment(toStr, "DD-MM-YYYY");
    if (!fromDateMoment.isValid() || !toDateMoment.isValid()) {
      console.log("[weightedRateReportM] invalid date range format");
      return { code: 500, msg: "Invalid date range format. Use DD-MM-YYYY." };
    }
    if (toDateMoment.isBefore(fromDateMoment)) {
      return { code: 500, msg: "End date must be on or after start date." };
    }
    const daysDiff = toDateMoment.diff(fromDateMoment, "days") + 1;
    if (daysDiff > MAX_DATE_RANGE_DAYS) {
      return { code: 500, msg: `Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days.` };
    }
    for (let d = moment(fromDateMoment); d.isSameOrBefore(toDateMoment); d.add(1, "day")) {
      datesToProcess.push(d.format("YYYY-MM-DD"));
    }
  } else if (singleDate) {
    const m = moment(dateInput, "DD-MM-YYYY");
    if (!m.isValid()) {
      return { code: 500, msg: "Invalid date format. Use DD-MM-YYYY." };
    }
    datesToProcess = [m.format("YYYY-MM-DD")];
  } else {
    return { code: 500, msg: "Provide a single date (DD-MM-YYYY) or date range array [from, to]." };
  }

  try {
    const dir = "./files/excel";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filePath = path.join(dir, fileName);
    const workbook = XLSX.utils.book_new();
    const headers = ["Part No", "Description", "Weighted Rate", "Date Created / Calculation Date"];
    const worksheet = XLSX.utils.aoa_to_sheet([headers]);

    // Components list (aligning with R18-style filters):
    // - Use RM type ('R')
    // - Only enabled components
    // - Exclude RFP* / TG* category parts from c_new_part_no
    const comp_stmt = await invtDB.query(
      "SELECT component_key, c_part_no, c_new_part_no, c_name FROM components WHERE c_type = 'R' AND c_is_enabled = 'Y' AND (c_new_part_no IS NULL OR (c_new_part_no NOT LIKE 'RFP%' AND c_new_part_no NOT LIKE 'TG%')) ORDER BY c_part_no",
      { type: invtDB.QueryTypes.SELECT }
    );

    const totalComponents = comp_stmt.length;
    const totalDates = datesToProcess.length;
    const totalRows = totalComponents * totalDates;
    const PROGRESS_UPDATE_INTERVAL = Math.max(1, Math.floor(totalRows / 20));
    let processedCount = 0;

    const excelRows = [];

    for (const dateStr of datesToProcess) {
      const calculationDateEndOfDay = moment(dateStr).endOf("day").format("YYYY-MM-DD HH:mm:ss");

      const weightedRates = await getBatchWeightedRates(
        comp_stmt.map((c) => c.component_key),
        calculationDateEndOfDay
      );

      for (let i = 0; i < comp_stmt.length; i++) {
        const comp = comp_stmt[i];
        // For consistency with R18, treat Part No as c_part_no
        const partNo = comp.c_part_no || "";
        const description = decode(comp.c_name || "");
        const weightedRate = weightedRates[comp.component_key] ?? 0;
        const calculationDateDisplay = moment(dateStr).format("DD-MM-YYYY");

        excelRows.push([partNo, description, Number(weightedRate), calculationDateDisplay]);
        processedCount++;

        if (notificationId && processedCount % PROGRESS_UPDATE_INTERVAL === 0) {
          const pct = totalRows > 0 ? ((processedCount * 100) / totalRows).toFixed(1) : 0;
          io.to(uid).emit("getting-loading-percentage", {
            notificationId,
            total: pct,
          });
        } else if (!notificationId && processedCount % PROGRESS_UPDATE_INTERVAL === 0) {
          socket.emit("weighted_rate_report_progress", {
            total: `${processedCount}/${totalRows}`,
          });
        }
      }
    }

    if (excelRows.length > 0) {
      XLSX.utils.sheet_add_aoa(worksheet, excelRows, { origin: -1 });
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, "Weighted Rate Report");
    XLSX.writeFile(workbook, filePath);

    const safeFileName = fileName || `WEIGHTED_RATE_REPORT_${uid}_${Date.now()}.xlsx`;
    const updateReplacements = {
      uid,
      other: JSON.stringify({
        fileName: safeFileName,
        fileUrl: "./files/excel/" + safeFileName,
        totalRows: excelRows.length,
      }),
    };
    const updateWhere = reqDate
      ? "WHERE user_id = :uid AND req_code = 'WEIGHTEDRATEREPORT' AND req_date = :req_date"
      : "WHERE user_id = :uid AND req_code = 'WEIGHTEDRATEREPORT'";
    if (reqDate) updateReplacements.req_date = reqDate;

    await otherDB.query(
      "UPDATE user_files_req SET status = 'complete', other_data = :other " + updateWhere,
      {
        replacements: updateReplacements,
        type: otherDB.QueryTypes.UPDATE,
      }
    );

    emit_notifications(notificationId);

    const user = await invtDB.query("SELECT Email_ID, user_name FROM admin_login WHERE CustID = :CustID", {
      replacements: { CustID: uid },
      type: invtDB.QueryTypes.SELECT,
    });

    if (user && user[0]) {
      const attachment = [
        {
          filename: "Weighted_Rate_Report.xlsx",
          content: fs.readFileSync(filePath),
        },
      ];
      helper.sendMail(
        user[0].Email_ID,
        "",
        "Weighted Average Rate Report [File Ready] Ref:" + helper.randomNumber(99999, 999999),
        htmlTemplate(
          user[0].user_name,
          new Date(),
          "Weighted Rate Report",
          `${process.env.SOCKET_API_URL}/${fileName}`
        ),
        attachment
      );
    }

    return { code: 200, msg: "Report generated successfully" };
  } catch (err) {
    console.error("[weightedRateReportM] error:", err.message || err);
    error_log({ stack: err.stack });
    const failReplacements = { uid };
    if (reqDate) failReplacements.req_date = reqDate;
    const failWhere = reqDate
      ? "WHERE user_id = :uid AND req_code = 'WEIGHTEDRATEREPORT' AND req_date = :req_date"
      : "WHERE user_id = :uid AND req_code = 'WEIGHTEDRATEREPORT'";
    await otherDB.query("UPDATE user_files_req SET status = 'failed' " + failWhere, {
      replacements: failReplacements,
      type: otherDB.QueryTypes.UPDATE,
    }).catch(() => {});
    emit_notifications(notificationId);
    return { code: 500, msg: err.message || "Report generation failed" };
  }
};

/**
 * Batch get weighted purchase rate for multiple components at a given date.
 * Uses the same logic as allComp.js (getWeightedPurchaseRate from utils).
 */
async function getBatchWeightedRates(componentKeys, dateStr) {
  const rateMap = {};
  const ratePromises = componentKeys.map(async (componentKey) => {
    try {
      const rate = await getWeightedPurchaseRate(componentKey, dateStr);
      return { componentKey, rate };
    } catch (error) {
      return { componentKey, rate: 0 };
    }
  });
  const results = await Promise.all(ratePromises);
  results.forEach((r) => {
    rateMap[r.componentKey] = r.rate;
  });
  return rateMap;
}
