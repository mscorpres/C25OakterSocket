const fs = require("fs");
const path = require("path");
const moment = require("moment");
const moment_timezone = require("moment-timezone");
const XLSX = require("xlsx");
const Validator = require("validatorjs");

const { invtDB } = require("../../config/db/connection");
const { getWeightedSKURate } = require("../utils");


/**
 * All-SKU IN/OUT movement Excel report by type and date range only.
 *
 * No SKU filter — saare transactions (saare SKU). Sirf type + date range.
 * SFG SKUs ignore (exclude): mfg_pro_apr_sku / fgout_pro_apr_sku LIKE 'SFG%' wale rows report me nahi aate.
 * - "IN"  → only IN/FGMIN/TRANSFER, date on mfg_pro_apr_fulldate
 * - "OUT" → only OUT, date on fgout_pro_apr_fulldate
 * - "BOTH" → both, same date range on respective dates
 *
 * @param {Object} params
 * @param {string} params.from_date - From date DD-MM-YYYY
 * @param {string} params.to_date - To date DD-MM-YYYY
 * @param {string} [params.transaction_type] - "IN" | "OUT" | "BOTH" (default BOTH)
 * @param {string} [params.fileName] - Excel file name
 */
exports.skuMovementReport = async function skuMovementReport(params) {
  const rules = {
    from_date: "required",
    to_date: "required",
  };

  const validation = new Validator(params, rules);
  if (validation.fails()) {
    return { code: 500, msg: "Please provide from_date and to_date" };
  }

  const { from_date, to_date } = params;
  const transactionType = (params.transaction_type || params.filter_type || "BOTH").toUpperCase();
  if (!["IN", "OUT", "BOTH"].includes(transactionType)) {
    return { code: 500, msg: "transaction_type must be IN, OUT or BOTH" };
  }
  const fileName =
    params.fileName ||
    `SKU_MOVEMENT_${transactionType}_${moment().format("YYYYMMDDHHmmss")}.xlsx`;

  try {
    const fromDate = moment(from_date, "DD-MM-YYYY");
    const toDate = moment(to_date, "DD-MM-YYYY");

    if (!fromDate.isValid() || !toDate.isValid()) {
      return { code: 500, msg: "Invalid date format. Use DD-MM-YYYY." };
    }

    const fromDateStr = fromDate.startOf("day").format("YYYY-MM-DD HH:mm:ss");
    const toDateStr = toDate.endOf("day").format("YYYY-MM-DD HH:mm:ss");

    // WHERE: only transaction type + date range — all SKUs, no location
    let whereClause = "WHERE 1=1";
    const replacements = {
      fromDate: fromDateStr,
      toDate: toDateStr,
    };

    // Transaction type only (IN / OUT / BOTH) — no location
    if (transactionType === "IN") {
      whereClause += " AND mfg_production_3.type IN ('IN','FGMIN','TRANSFER')";
    } else if (transactionType === "OUT") {
      whereClause += " AND mfg_production_3.type = 'OUT' AND mfg_production_3.fg_status = 'ACTIVE'";
    }
    // BOTH: no extra type filter, both IN and OUT rows

    // Date range: IN uses in_date, OUT uses out_date (dropdown-wise)
    if (transactionType === "IN") {
      whereClause +=
        " AND mfg_production_3.mfg_pro_apr_fulldate BETWEEN :fromDate AND :toDate";
    } else if (transactionType === "OUT") {
      whereClause +=
        " AND mfg_production_3.fgout_pro_apr_fulldate BETWEEN :fromDate AND :toDate";
    } else {
      whereClause +=
        " AND (" +
        " (mfg_production_3.type IN ('IN','FGMIN','TRANSFER') AND mfg_production_3.mfg_pro_apr_fulldate BETWEEN :fromDate AND :toDate) " +
        " OR (mfg_production_3.type = 'OUT' AND mfg_production_3.fgout_pro_apr_fulldate BETWEEN :fromDate AND :toDate)" +
        " )";
    }

    // Ignore SFG SKUs — exclude rows where SKU starts with SFG
    whereClause +=
      " AND (" +
      " (mfg_production_3.type IN ('IN','FGMIN','TRANSFER') AND (mfg_production_3.mfg_pro_apr_sku NOT LIKE 'SFG%' OR mfg_production_3.mfg_pro_apr_sku IS NULL)) " +
      " OR (mfg_production_3.type = 'OUT' AND (mfg_production_3.fgout_pro_apr_sku NOT LIKE 'SFG%' OR mfg_production_3.fgout_pro_apr_sku IS NULL))" +
      " )";

    const queryString = `
      SELECT 
        products.p_sku AS row_sku,
        products.product_key AS row_product_key,
        products.p_name AS row_p_name,
        mfg_production_3.fg_out_remark, 
        mfg_production_3.mfg_ref_transid_1, 
        mfg_production_3.mfg_ref_transid_2, 
        mfg_production_3.mfg_pro_apr_transaction, 
        mfg_production_3.mfg_pro_FGout_transaction, 
        mfg_production_3.type AS transaction_type, 
        mfg_production_3.mfg_pro_apr_fulldate AS in_date, 
        COALESCE(mfg_production_2.mfg_prod_planing_qty, mfg_production_3.mfg_approve_in_qty) AS in_qty,
        mfg_production_3.mfg_pro_location_in,
        mfg_production_3.fgout_pro_location_out,
        mfg_production_3.fg_out_type,
        COALESCE(mfg_production_2.in_fg_rate, mfg_production_3.in_fg_rate) AS in_fg_rate,
        mfg_production_3.in_fg_invoice_id,
        user_inby.user_name AS in_by_user,
        user_outby.user_name AS out_by_user,
        mfg_production_3.fgout_pro_apr_fulldate AS out_date, 
        mfg_production_3.fgout_approve_out_qty AS out_qty,
        loc_in.loc_name AS loc_in_name,
        loc_out.loc_name AS loc_out_name
      FROM mfg_production_3 
      LEFT JOIN products ON (
        (mfg_production_3.type IN ('IN','FGMIN','TRANSFER') AND products.p_sku = mfg_production_3.mfg_pro_apr_sku)
        OR (mfg_production_3.type = 'OUT' AND products.product_key = mfg_production_3.fgout_pro_apr_sku)
      )
      LEFT JOIN mfg_production_2 ON mfg_production_3.mfg_ref_transid_2 = mfg_production_2.mfg_transaction AND mfg_production_2.mfg_prod_type = 'C'
      LEFT JOIN admin_login AS user_inby ON user_inby.CustID = mfg_production_3.mfg_pro_apr_by 
      LEFT JOIN admin_login AS user_outby ON user_outby.CustID = mfg_production_3.fgout_pro_apr_by
      LEFT JOIN location_main AS loc_in ON loc_in.location_key = mfg_production_3.mfg_pro_location_in
      LEFT JOIN location_main AS loc_out ON loc_out.location_key = mfg_production_3.fgout_pro_location_out
      ${whereClause}
      ORDER BY mfg_production_3.ID DESC
    `;

    const stmt2 = await invtDB.query(queryString, {
      replacements,
      type: invtDB.QueryTypes.SELECT,
    });

    if (stmt2.length === 0) {
      return { code: 500, msg: "No transactions found for this date range" };
    }

    // Excel layout by report type: IN = (no Qty OUT/Loc OUT), OUT = (no Qty IN/Loc IN), BOTH = combined columns
    const rows = [];
    const isOutReport = transactionType === "OUT";
    const isInReport = transactionType === "IN";

    const headersOut = [
      "Date",
      "Reference Module",
      "SKU ID",
      "Product Name",
      "Quantity OUT",
      "Weighted Rate",
      "Location OUT",
      "Type",
      "Mode",
      "Remark",
    ];
    const headersIn = [
      "Date",
      "Reference Module",
      "SKU ID",
      "Product Name",
      "Quantity IN",
      "Rate",
      "Weighted Rate",
      "Location IN",
      "Type",
      "Mode",
      "Invoice No",
      "Remark",
    ];
    const headersBoth = [
      "Date",
      "Reference Module",
      "SKU ID",
      "Product Name",
      "Quantity IN",
      "Quantity OUT",
      "Rate",
      "Weighted Rate",
      "Location IN",
      "Location OUT",
      "Type",
      "Mode",
      "Invoice No",
      "Remark",
    ];
    const headers = isOutReport ? headersOut : isInReport ? headersIn : headersBoth;

    for (const item of stmt2) {
      const txType = item.transaction_type;
      const txDateRaw = txType === "OUT" ? item.out_date : item.in_date;
      const txDate = txDateRaw
        ? moment(txDateRaw).tz("Asia/Kolkata").format("DD-MM-YYYY HH:mm:ss")
        : moment().tz("Asia/Kolkata").format("DD-MM-YYYY HH:mm:ss");

      const rowProductKey = item.row_product_key || item.fgout_pro_apr_sku || item.mfg_pro_apr_sku;
      const txWeightedRate = rowProductKey
        ? await getWeightedSKURate(
            rowProductKey,
            moment(txDate, "DD-MM-YYYY HH:mm:ss").format("YYYY-MM-DD HH:mm:ss")
          )
        : 0;

      let transaction_type_label;
      let qty_in = 0;
      let qty_out = 0;
      let loc_in = item.loc_in_name || "--";
      let loc_out = item.loc_out_name || "--";
      let mode = "--";
      let reference = "";
      let rateVal = 0;

      if (txType === "IN") {
        transaction_type_label = "IN";
        qty_in = item.in_qty || 0;
        rateVal = item.in_fg_rate != null ? Number(item.in_fg_rate) : 0;
        const parts = [];
        if (item.mfg_ref_transid_1) parts.push("PPR TXN: " + item.mfg_ref_transid_1);
        if (item.mfg_ref_transid_2) parts.push("MFG TXN: " + item.mfg_ref_transid_2);
        if (item.mfg_pro_apr_transaction) parts.push("FG IN TXN: " + item.mfg_pro_apr_transaction);
        reference = parts.join(" | ") || "N/A";
        mode = "FGIN";
      } else if (txType === "FGMIN") {
        transaction_type_label = "IN";
        qty_in = item.in_qty || 0;
        rateVal = item.in_fg_rate != null ? Number(item.in_fg_rate) : 0;
        reference = item.mfg_pro_apr_transaction
          ? "FG MIN TXN: " + item.mfg_pro_apr_transaction
          : "N/A";
        mode = "FGMIN";
      } else if (txType === "TRANSFER") {
        transaction_type_label = "TRANSFER";
        qty_in = item.in_qty || 0;
        rateVal = item.in_fg_rate != null ? Number(item.in_fg_rate) : 0;
        reference = item.mfg_pro_apr_transaction
          ? "FG TRF TXN: " + item.mfg_pro_apr_transaction
          : "N/A";
        mode = "TRANSFER";
      } else if (txType === "OUT") {
        transaction_type_label = "OUT";
        qty_out = item.out_qty || 0;
        reference = item.mfg_pro_FGout_transaction
          ? "FG OUT TXN: " + item.mfg_pro_FGout_transaction
          : "N/A";
        if (item.fg_out_type === "SL001") mode = "SALES";
        else if (item.fg_out_type === "OT001") mode = "OTHER";
        else if (item.fg_out_type === "REPL") mode = "REPLACEMENT";
        else mode = item.fg_out_type || "--";
      } else {
        transaction_type_label = "N/A";
      }

      const rowSku = item.row_sku || item.mfg_pro_apr_sku || item.fgout_pro_apr_sku || "--";
      const productName = item.row_p_name || "--";
      const invoiceNo = item.in_fg_invoice_id != null && item.in_fg_invoice_id !== "" ? String(item.in_fg_invoice_id) : "--";
      const remark = item.fg_out_remark || "--";

      if (isOutReport) {
        rows.push([
          txDate,
          reference,
          rowSku,
          productName,
          qty_out,
          Number(txWeightedRate || 0),
          loc_out,
          transaction_type_label,
          mode,
          remark,
        ]);
      } else if (isInReport) {
        rows.push([
          txDate,
          reference,
          rowSku,
          productName,
          qty_in,
          rateVal,
          Number(txWeightedRate || 0),
          loc_in,
          transaction_type_label,
          mode,
          invoiceNo,
          remark,
        ]);
      } else {
        rows.push([
          txDate,
          reference,
          rowSku,
          productName,
          qty_in,
          qty_out,
          rateVal,
          Number(txWeightedRate || 0),
          loc_in,
          loc_out,
          transaction_type_label,
          mode,
          invoiceNo,
          remark,
        ]);
      }
    }

    // Create ./files/excel directory if needed
    const dir = "./files/excel";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filePath = path.join(dir, fileName);

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([headers]);
    if (rows.length > 0) {
      XLSX.utils.sheet_add_aoa(worksheet, rows, { origin: -1 });
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, "SKU Movement");
    XLSX.writeFile(workbook, filePath);

    return {
      code: 200,
      msg: "SKU movement report generated successfully",
      filePath,
    };
  } catch (err) {
    return {
      code: 500,
      msg: err.message || "Failed to generate SKU movement report",
    };
  }
};

