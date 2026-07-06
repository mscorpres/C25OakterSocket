const xlsx = require("xlsx");
const fs = require("fs");
const { tallyDB, invtDB, otherDB } = require("../../../config/db/connection");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const { sendMail } = require("../../helper");
const { htmlTemplate } = require("./EmailTemplate/fileDownload");
const { errorTemplate } = require("./EmailTemplate/errorTemplate");
const Validator = require("validatorjs");
const helper = require("../../helper");

const CHUNK_SIZE = 10_000;

const VBT_TYPE_MAP = {
  VBT01: "Purchase",
  VBT04: "Purchase",
  VBT05: "Purchase",
  VBT02: "Purchase-Services",
  VBT06: "Purchase-Services",
  VBT03: "Purchase-Import(Goods)",
  VBT07: "RCM-Invoice",
};


const DEFAULT_CONSIGNEE = {
  name: "Riot Labz Private Limited (Alwar)",
  addressLine1: "B-36, Matasya Industrial Area,",
  addressLine2: "Alwar-301030 ( Rajsthan)",
  pin: "301030",
  state: "Rajsthan",
  country: "India",
  gst: "08AAHCR1005Q1Z6",
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
      if (err) reject(err);
      else resolve(decoded);
    });
  });
}

function buildMainQuery(wise, req) {
  const base = `
    SELECT tally_vbt.*,
      COALESCE(components.c_part_no, products.p_sku)       AS itemName,
      COALESCE(components.c_specification, products.p_name) AS itemDesc,
      currency.currency_symbol,
      gl.code          AS glCode,
      cgstLadger.code  AS cgstCode,
      sgstLadger.code  AS sgstCode,
      igstLadger.code  AS igstCode,
      tdsLadger.code   AS tdsCode
    FROM tally_vbt
    LEFT JOIN ${global.oakter_db_invt}.components      AS components ON components.component_key  = tally_vbt.part_code
    LEFT JOIN ${global.oakter_db_invt}.products        AS products   ON products.product_key       = tally_vbt.part_code
    LEFT JOIN tally_ledger                              AS gl          ON gl.ledger_key             = tally_vbt.gl_code
    LEFT JOIN tally_ledger                              AS cgstLadger  ON cgstLadger.ledger_key     = tally_vbt.vbt_cgst_gl
    LEFT JOIN tally_ledger                              AS sgstLadger  ON sgstLadger.ledger_key     = tally_vbt.vbt_sgst_gl
    LEFT JOIN tally_ledger                              AS igstLadger  ON igstLadger.ledger_key     = tally_vbt.vbt_igst_gl
    LEFT JOIN tally_ledger                              AS tdsLadger   ON tdsLadger.ledger_key      = tally_vbt.tds_gl
    LEFT JOIN ${global.oakter_db_invt}.ims_currency    AS currency    ON currency.currency_id       = tally_vbt.currency_type
  `;

  const notDeleted = `tally_vbt.vbt_status != 'DE'`;
  const order = `ORDER BY tally_vbt.effective_date DESC`;
  const typeFilter =
    req.vbt_type !== "ALL" ? `AND tally_vbt.vbt_type = :vbt_type` : "";

  switch (wise) {
    case "effectivewise":
      return `${base} WHERE (DATE_FORMAT(tally_vbt.effective_date,'%Y-%m-%d') BETWEEN :date1 AND :date2) AND ${notDeleted} ${typeFilter} ${order}`;
    case "datewise":
      return `${base} WHERE (DATE_FORMAT(tally_vbt.insert_date,'%Y-%m-%d') BETWEEN :date1 AND :date2) AND ${notDeleted} ${typeFilter} ${order}`;
    case "vendorwise":
      return `${base} WHERE tally_vbt.ven_code = :venid AND ${notDeleted} ${typeFilter} ${order}`;
    case "minwise":
      return `${base} WHERE tally_vbt.min_id = :minno AND ${notDeleted} ${typeFilter} ${order}`;
    case "vbtwise":
      return `${base} WHERE tally_vbt.vbt_key = :vbtno AND ${notDeleted} ${typeFilter} ${order}`;
    default:
      return null;
  }
}

async function batchLoadMinData(rows) {
  const pairs = rows
    .filter(
      (r) => r.min_id && r.min_id !== "--" && r.min_id !== "" && r.part_code
    )
    .map((r) => `(${invtDB.escape(r.min_id)}, ${invtDB.escape(r.part_code)})`);

  if (!pairs.length) return new Map();

  const sql = `
    SELECT minTable.in_transaction_id   AS min_id,
           minTable.components_id        AS part_code,
           minTable.insert_date          AS minDate,
           minTable.in_vendor_branch,
           minTable.in_vendor_name       AS venCode,
           minTable.rm_loc_cost_center   AS costCentreCode
    FROM ${global.oakter_db_invt}.rm_location AS minTable
    WHERE minTable.trans_type = 'INWARD' AND (minTable.in_transaction_id, minTable.components_id) IN (${pairs.join(",")})
  `;
  const results = await invtDB.query(sql, { type: invtDB.QueryTypes.SELECT });
  const map = new Map();
  for (const r of results) {
    map.set(`${r.min_id}::${r.part_code}`, r);
  }
  return map;
}

async function batchLoadFgMinData(rows, minMap) {
  const pairs = [];
  const seen = new Set();
  for (const r of rows) {
    const k = `${r.min_id}::${r.part_code}`;
    if (minMap.has(k)) continue;
    if (!r.min_id || r.min_id === "--" || r.min_id === "") continue;
    if (!(r.txn_type === "FG" || String(r.min_id).toUpperCase().includes("FGIN")))
      continue;
    if (seen.has(k)) continue;
    seen.add(k);
    pairs.push(`(${invtDB.escape(r.min_id)}, ${invtDB.escape(r.part_code)})`);
  }
  if (!pairs.length) return new Map();

  const sql = `
    SELECT mfg.mfg_pro_apr_fulldate AS minDate,
           mfg.mfg_ref_transid_1    AS mfgPoRef,
           mfg.mfg_cost_center      AS costCentreCode,
           mfg.mfg_pro_apr_transaction AS min_id,
           p.product_key             AS part_code
    FROM ${global.oakter_db_invt}.mfg_production_3 AS mfg
    INNER JOIN ${global.oakter_db_invt}.products AS p ON mfg.mfg_pro_apr_sku = p.p_sku
    WHERE (mfg.mfg_pro_apr_transaction, p.product_key) IN (${pairs.join(",")})
      AND mfg.type IN ('IN','FGMIN')
  `;
  const results = await invtDB.query(sql, { type: invtDB.QueryTypes.SELECT });
  const map = new Map();
  for (const row of results) {
    map.set(`${row.min_id}::${row.part_code}`, row);
  }
  return map;
}

async function batchLoadVendorDetails(venIds) {
  if (!venIds.size) return new Map();

  const ids = [...venIds].map((id) => invtDB.escape(id)).join(",");
  const primarySql = `
    SELECT venAddress.ven_id,
           venAddress.ven_address_id,
           venAddress.ven_address,
           venAddress.ven_city,
           venAddress.ven_pincode,
           venAddress.ven_add_gst AS venGst,
           CASE WHEN venAddress.ven_state = 100 THEN 'Other'
              ELSE venState.state_name
         END AS venState
    FROM ven_address_detail AS venAddress
    LEFT JOIN state_code AS venState ON venState.state_code = venAddress.ven_state
    WHERE venAddress.ven_id IN (${ids})
  `;
  const allAddresses = await invtDB.query(primarySql, {
    type: invtDB.QueryTypes.SELECT,
  });

  const venMap = new Map();
  for (const r of allAddresses) {
    if (!venMap.has(r.ven_id))
      venMap.set(r.ven_id, { default: null, branches: new Map() });
    const entry = venMap.get(r.ven_id);
    if (!entry.default) entry.default = r;
    entry.branches.set(String(r.ven_address_id), r);
  }
  return venMap;
}

async function batchLoadCostCenters(keys) {
  if (!keys.size) return new Map();
  const ids = [...keys].map((k) => invtDB.escape(k)).join(",");
  const sql = `
    SELECT cost_center_key, cost_center_short_name
    FROM cost_center
    WHERE cost_center_key IN (${ids})
  `;
  const rows = await invtDB.query(sql, { type: invtDB.QueryTypes.SELECT });
  return new Map(
    rows.map((r) => [String(r.cost_center_key), r.cost_center_short_name])
  );
}

async function batchLoadPODetails(poNumbers) {
  if (!poNumbers.size) return new Map();
  const ids = [...poNumbers].map((n) => invtDB.escape(n)).join(",");
  const sql = `
    SELECT po_transaction, po_insert_date AS poDate, po_ship_id AS poShipId, po_cost_center
    FROM po_purchase_req
    WHERE po_transaction IN (${ids})
  `;
  const rows = await invtDB.query(sql, { type: invtDB.QueryTypes.SELECT });
  return new Map(rows.map((r) => [r.po_transaction, r]));
}

async function batchLoadJWDetails(jwIds) {
  if (!jwIds.size) return new Map();
  const ids = [...jwIds].map((n) => invtDB.escape(n)).join(",");
  const sql = `
    SELECT jw_jw_transaction, jw_po_ship_id AS jwShipId, jw_po_full_date AS jwDate, jw_cost_center
    FROM jw_purchase_req
    WHERE jw_jw_transaction IN (${ids})
  `;
  const rows = await invtDB.query(sql, { type: invtDB.QueryTypes.SELECT });
  return new Map(rows.map((r) => [r.jw_jw_transaction, r]));
}

async function batchLoadShipments(codes) {
  if (!codes.size) return new Map();
  const ids = [...codes].map((c) => invtDB.escape(c)).join(",");
  const sql = `
    SELECT * FROM ${global.oakter_db_invt}.shipment_address
    WHERE shipment_code IN (${ids})
  `;
  const rows = await tallyDB.query(sql, { type: tallyDB.QueryTypes.SELECT });
  return new Map(rows.map((r) => [r.shipment_code, r]));
}

function transformRow(row, minMap, venMap, ccMap, poMap, jwMap, shipMap) {
  const minKey = `${row.min_id}::${row.part_code}`;
  const minData = minMap.get(minKey);

  let venAddress,
    venAddress1,
    venPinCode,
    venState,
    venGSTIN,
    minDate;
  if (minData) {
    minDate = moment(minData.minDate).format("DD-MM-YYYY");
    const venEntry = venMap.get(String(minData.venCode));
    if (venEntry) {
      const branchId = minData.in_vendor_branch;
      const addr =
        branchId && branchId !== "--" && branchId !== ""
          ? venEntry.branches.get(String(branchId)) || venEntry.default
          : venEntry.default;
      if (addr) {
        venAddress = addr.ven_address?.replaceAll?.("<br>", " ");
        venAddress1 = addr.ven_city;
        venPinCode = addr.ven_pincode;
        venState = addr.venState;
        venGSTIN = addr.venGst;
      }
    }
  }
  if (!venAddress && row.ven_code && row.ven_code !== "--") {
    const venEntry = venMap.get(String(row.ven_code));
    if (venEntry) {
      const addr = venEntry.default;
      if (addr) {
        venAddress = addr.ven_address?.replaceAll?.("<br>", " ");
        venAddress1 = addr.ven_city;
        venPinCode = addr.ven_pincode;
        venState = addr.venState;
        venGSTIN = addr.venGst;
      }
    }
  }

  let costCenterKey;
  if (minData?.costCentreCode && minData.costCentreCode !== "--") {
    costCenterKey = String(minData.costCentreCode);
  }

  let orderNo, orderDate, reference;
  const poLookupKey =
    row.po_number && row.po_number !== "--" && row.po_number !== ""
      ? row.po_number
      : minData?.mfgPoRef &&
          minData.mfgPoRef !== "--" &&
          String(minData.mfgPoRef).trim() !== ""
        ? String(minData.mfgPoRef)
        : null;
  const po = poLookupKey ? poMap.get(poLookupKey) : null;
  const jw = jwMap.get(row.jw_id);

  if (po) {
    if (!costCenterKey && po.po_cost_center && po.po_cost_center !== "--")
      costCenterKey = String(po.po_cost_center);
    orderNo = poLookupKey;
    orderDate = po.poDate;
    const parts = orderNo.split("-");
    reference = row.vbt_invoice_no + " PO" + parts[1]?.replace("/", "");
  }

  if (jw) {
    if (!costCenterKey && jw.jw_cost_center && jw.jw_cost_center !== "--")
      costCenterKey = String(jw.jw_cost_center);
    orderNo = row.jw_id;
    orderDate = moment(jw.jwDate).format("DD-MM-YYYY");
    const parts = orderNo.split("-");
    reference = row.vbt_invoice_no + " JO" + parts[1]?.replace("/", "");
  }

  const costCenterName = costCenterKey
    ? ccMap.get(costCenterKey) || ""
    : "";

  const shipCode = po?.poShipId || jw?.jwShipId;
  const ship = shipCode && shipCode !== "--" ? shipMap.get(shipCode) : null;
  const consigneeName = ship ? ship.shipment_company : DEFAULT_CONSIGNEE.name;
  const shippingAddress = ship
    ? ship.shipment_address
    : DEFAULT_CONSIGNEE.addressLine1;
  const shippingAddress1 = ship
    ? ship.shipment_address1
    : DEFAULT_CONSIGNEE.addressLine2;
  const shippingPin = ship ? ship.shipment_pincode : DEFAULT_CONSIGNEE.pin;
  const shippingState = ship ? ship.shipment_state : DEFAULT_CONSIGNEE.state;
  const shippingCountry = ship ? "India" : DEFAULT_CONSIGNEE.country;
  const shippingGst = ship ? ship.shipment_gstin : DEFAULT_CONSIGNEE.gst;

  const voucherType = VBT_TYPE_MAP[row.vbt_type] || "";

  let nature, referenceAmount;
  if (row.currency_type === "364907247") {
    nature =
      row.vbt_gst_type === "I"
        ? "Interstate purchase taxable"
        : "Purchase Taxable";
    referenceAmount =
      +Number(row.vbt_taxable_value).toFixed(2) +
      +Number(row.vbt_cgst).toFixed(2) +
      +Number(row.vbt_sgst).toFixed(2) +
      +Number(row.vbt_igst).toFixed(2) -
      +Number(row.vbt_tds_amount).toFixed(2);
  } else {
    nature = "Imports Taxable";
    referenceAmount =
      +Number(row.vbt_taxable_value).toFixed(2) +
      +Number(row.vbt_cgst).toFixed(2) +
      +Number(row.vbt_sgst).toFixed(2) +
      +Number(row.vbt_igst).toFixed(2);
  }

  let roundValue;
  if (row.round_off_amt && row.round_off_amt !== 0) {
    roundValue =
      row.round_off_sign === "-"
        ? row.round_off_sign + row.round_off_amt
        : row.round_off_amt;
  }

  return {
    "Vch Type": voucherType,
    "VBT No": row.vbt_key,
    Date: moment(row.insert_date).format("DD-MM-YYYY"),
    "Party Name": row.ven_code,
    "Receipt No": row.min_id ? row.min_id : "",
    "Receipt Date": minDate || "",
    "Order No": orderNo || "",
    "Order Date": orderDate || "",
    "Supplier Name": row.ven_code,
    Address: venAddress || "",
    "Address 1": venAddress1 || "",
    Pincode: venPinCode || "",
    State: venState || "",
    Country: "",
    GSTIN: venGSTIN || "",
    "Consignee Name": consigneeName
      ? String(consigneeName).replaceAll("<br>", " ")
      : DEFAULT_CONSIGNEE.name,
    "Shipping add": shippingAddress
      ? String(shippingAddress).replaceAll("<br>", " ")
      : DEFAULT_CONSIGNEE.addressLine1,
    "Shipping add 1": shippingAddress1
      ? String(shippingAddress1).replaceAll("<br>", " ")
      : DEFAULT_CONSIGNEE.addressLine2,
    "Pincode.": shippingPin || DEFAULT_CONSIGNEE.pin,
    "State.": shippingState || DEFAULT_CONSIGNEE.state,
    "Country.": shippingCountry || DEFAULT_CONSIGNEE.country,
    "GSTIN.": shippingGst || DEFAULT_CONSIGNEE.gst,
    "Supplier Invoice No": row.vbt_invoice_no,
    "Invoice Date": row.vbt_invoice_date,
    "Item Name": row.itemName,
    Description1: row.itemDesc,
    Description2: "",
    Description3: "",
    Description4: "",
    Description5: "",
    Godown: "RM001_Alwar",
    "Invoice Qty": row.vbt_bill_qty,
    "Min Qty": row.vbt_inqty,
    Rate: row.vbt_inrate,
    "currency symbol": row.currency_symbol,
    "Rate of Exchange": row.exchange_rate,
    Amt: +row.vbt_taxable_value,
    "GL Head": row.glCode,
    Nature: nature || "",
    "Taxable Amt": +row.vbt_taxable_value,
    "Cost centre": costCenterName,
    "Cost centre Amt": +row.vbt_taxable_value,
    "GST Rate": row.vbt_gst_rate,
    "CGST GL": row.cgstCode,
    "CGST Amt": row.vbt_cgst != 0 ? +row.vbt_cgst : "",
    "SGST GL": row.sgstCode,
    "SGST Amt": row.vbt_sgst != 0 ? +row.vbt_sgst : "",
    "IGST GL": row.igstCode,
    "IGST Amt": row.vbt_igst != 0 ? +row.vbt_igst : "",
    "TDS Sec GL": row.tdsCode,
    "TDS Amt":
      row.vbt_tds_amount != 0 ? "-" + Number(row.vbt_tds_amount) : "",
    "Round Off": roundValue ? +roundValue : "",
    Reference: reference || row.vbt_invoice_no,
    "Reference amount": Number(referenceAmount.toFixed(2)),
    "Total Value": Number(Number(row.vbt_ven_ammount).toFixed(2)),
    Narration: row.vbt_comment,
    "Effective Date": moment(row.effective_date).isValid()
      ? moment(row.effective_date).format("DD-MM-YYYY")
      : "",
  };
}

async function processChunk(rows) {
  const venIds = new Set();
  const poNumbers = new Set();
  const jwIds = new Set();
  const ccKeys = new Set();

  for (const r of rows) {
    if (r.po_number && r.po_number !== "--" && r.po_number !== "")
      poNumbers.add(r.po_number);
    if (r.jw_id && r.jw_id !== "--" && r.jw_id !== "") jwIds.add(r.jw_id);
    if (r.ven_code && r.ven_code !== "--") venIds.add(String(r.ven_code));
  }

  const minMap = await batchLoadMinData(rows);
  const fgMinMap = await batchLoadFgMinData(rows, minMap);

  for (const r of rows) {
    const k = `${r.min_id}::${r.part_code}`;
    if (!minMap.has(k) && fgMinMap.has(k)) {
      const fg = fgMinMap.get(k);
      minMap.set(k, {
        minDate: fg.minDate,
        venCode: r.ven_code,
        in_vendor_branch: "--",
        costCentreCode:
          fg.costCentreCode && fg.costCentreCode !== "--"
            ? String(fg.costCentreCode)
            : null,
        mfgPoRef: fg.mfgPoRef,
      });
    }
  }

  for (const minData of minMap.values()) {
    if (minData.venCode) venIds.add(String(minData.venCode));
    if (minData.costCentreCode && minData.costCentreCode !== "--")
      ccKeys.add(String(minData.costCentreCode));
  }

  for (const r of rows) {
    const k = `${r.min_id}::${r.part_code}`;
    const m = minMap.get(k);
    if (
      (!r.po_number || r.po_number === "--" || r.po_number === "") &&
      m?.mfgPoRef &&
      m.mfgPoRef !== "--" &&
      String(m.mfgPoRef).trim() !== ""
    ) {
      poNumbers.add(String(m.mfgPoRef));
    }
  }

  const [venMap, poMap, jwMap] = await Promise.all([
    batchLoadVendorDetails(venIds),
    batchLoadPODetails(poNumbers),
    batchLoadJWDetails(jwIds),
  ]);

  for (const po of poMap.values()) {
    if (po.po_cost_center && po.po_cost_center !== "--")
      ccKeys.add(String(po.po_cost_center));
  }
  for (const jw of jwMap.values()) {
    if (jw.jw_cost_center && jw.jw_cost_center !== "--")
      ccKeys.add(String(jw.jw_cost_center));
  }

  const shipCodes = new Set();
  for (const po of poMap.values()) {
    if (po.poShipId && po.poShipId !== "--") shipCodes.add(po.poShipId);
  }
  for (const jw of jwMap.values()) {
    if (jw.jwShipId && jw.jwShipId !== "--") shipCodes.add(jw.jwShipId);
  }

  const [ccMap, shipMap] = await Promise.all([
    batchLoadCostCenters(ccKeys),
    batchLoadShipments(shipCodes),
  ]);

  return rows.map((row) =>
    transformRow(row, minMap, venMap, ccMap, poMap, jwMap, shipMap)
  );
}

exports.vbtReport = async (io, socket) => {
  try {
    socket.on("vbtReport", async (params) => {
      try {
        const req = params.otherdata;
        const check = await verifyToken(`${socket.handshake.auth.token}`);
        const userID = check.crn_id;

        const validation = new Validator(req, {
          wise: "required",
          data: "required",
          vbt_type: "required",
        });
        if (validation.fails()) {
          return socket.emit("error", {
            success: false,
            message: Object.values(validation.errors.all())[0].join(),
          });
        }

        const fileName = "vbtReport" + helper.getUniqueNumber() + ".xlsx";
        const fileCode = fileName.replace(".xlsx", "");
        const insertTimestamp = moment().format("YYYY-MM-DD HH:mm:ss");

        await otherDB.query(
          "INSERT INTO user_files_req (module_name, request_txt_label, req_code, user_id, req_date, msg_type, status, other_data, insert_date) VALUES ('FINANCE','Purchase Register Report', :filename, :uid, :req_data, 'file', 'pending', :other, :insert_date)",
          {
            replacements: {
              uid: userID,
              req_data: JSON.stringify(req),
              other: JSON.stringify({}),
              insert_date: insertTimestamp,
              filename: fileCode,
            },
            type: otherDB.QueryTypes.INSERT,
          }
        );

        const userDetails = await invtDB.query(
          `SELECT admin_login.Email_ID, admin_login.user_name, company.company_name, company.company_cin_no, company.company_address, company.companey_city, company.company_pin_code, company.company_gst_no FROM admin_login LEFT JOIN ${global.oakter_db_other}.ims_company AS company ON admin_login.company_id = company.company_id WHERE admin_login.CustID = :CustID`,
          { replacements: { CustID: userID }, type: invtDB.QueryTypes.SELECT }
        );

        if (!userDetails.length) {
          return socket.emit("error", {
            success: false,
            message: "User details not found for this customer.",
          });
        }

        const { wise, data } = req;
        let replacements = { vbt_type: req.vbt_type };

        if (["effectivewise", "datewise"].includes(wise)) {
          const dates = data.match(/([0-9]{2})-([0-9]{2})-([0-9]{4})/g);
          replacements.date1 = moment(dates[0], "DD-MM-YYYY").format(
            "YYYY-MM-DD"
          );
          replacements.date2 = moment(dates[1], "DD-MM-YYYY").format(
            "YYYY-MM-DD"
          );
        } else if (wise === "vendorwise") {
          replacements.venid = data;
        } else if (wise === "minwise") {
          replacements.minno = data;
        } else if (wise === "vbtwise") {
          replacements.vbtno = data;
        } else {
          return socket.emit("error", {
            success: false,
            message: "Please select valid filter method",
          });
        }

        const sqlQuery = buildMainQuery(wise, req);
        if (!sqlQuery) {
          return socket.emit("error", {
            success: false,
            message: "Please select valid filter method",
          });
        }

        const main_stmt = await tallyDB.query(sqlQuery, {
          replacements,
          type: tallyDB.QueryTypes.SELECT,
        });

        if (!main_stmt.length) {
          await sendMail(
            userDetails[0].Email_ID,
            "",
            "Purchase Register Report",
            errorTemplate(
              userDetails[0].user_name,
              new Date(),
              "Purchase Register",
              "we didn't found any data according to your search."
            )
          );
          try {
            await otherDB.query(
              "UPDATE user_files_req SET status = 'complete', other_data = :otherData, update_date = :updatedAt WHERE user_id = :uid AND req_code = :filename AND insert_date = :insertTimestamp",
              {
                replacements: {
                  uid: userID,
                  otherData: JSON.stringify({ error: "no data found" }),
                  filename: fileCode,
                  updatedAt: moment().format("YYYY-MM-DD HH:mm:ss"),
                  insertTimestamp,
                },
                type: otherDB.QueryTypes.UPDATE,
              }
            );
          } catch (updateErr) {
            console.error("UPDATE failed (no-data branch):", updateErr.stack);
          }
          return socket.emit("error", { success: false, message: "No data found" });
        }

        const purchaseRegisterDir = "./files/purchaseRegister";
        if (!fs.existsSync(purchaseRegisterDir)) {
          fs.mkdirSync(purchaseRegisterDir, { recursive: true });
        }
        const filePath = `${purchaseRegisterDir}/${fileName}`;
        const workbook = xlsx.utils.book_new();

        const dateDisplay =
          replacements.date1
            ? `${moment(replacements.date1).format("DD-MMM-YYYY")} to ${moment(
                replacements.date2
              ).format("DD-MMM-YYYY")}`
            : "";

        const ReportHeader = xlsx.utils.json_to_sheet(
          [
            {
              A: `${userDetails[0].company_name}\n${userDetails[0].company_address}\n${userDetails[0].companey_city} - ${userDetails[0].company_pin_code}\nCIN : ${userDetails[0].company_cin_no}\n'Report Name : GSTR-1'\nReport Date : ${dateDisplay}\n'GSTIN : ' + ${userDetails[0].company_gst_no}`,
            },
          ],
          { skipHeader: true }
        );
        ReportHeader["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 9, c: 5 } }];

        xlsx.utils.sheet_add_json(
          ReportHeader,
          [
            {
              A12: "Vch Type",
              B12: "VBT No",
              C12: "Date",
              D12: "Party Name",
              E12: "Receipt No",
              F12: "Receipt Date",
              G12: "Order No",
              H12: "Order Date",
              I12: "Supplier Name",
              J12: "Address",
              K12: "Address 1",
              L12: "Pincode",
              M12: "State",
              N12: "Country",
              O12: "GSTIN",
              P12: "Consignee Name",
              Q12: "Shipping add",
              R12: "Shipping add 1",
              S12: "Pincode",
              T12: "State",
              U12: "Country",
              V12: "GSTIN",
              W12: "Supplier Invoice No",
              X12: "Invoice Date",
              Y12: "Item Name",
              Z12: "Description1",
              AA12: "Description2",
              AB12: "Description3",
              AC12: "Description4",
              AD12: "Description5",
              AE12: "Godown",
              AF12: "Invoice Qty",
              AG12: "Min Qty",
              AH12: "Rate",
              AI12: "currency symbol",
              AJ12: "Rate of Exchange",
              AK12: "Amt",
              AL12: "GL Head",
              AM12: "Nature",
              AN12: "Taxable Amt",
              AO12: "Cost centre",
              AP12: "Cost centre Amt",
              AQ12: "GST Rate",
              AR12: "CGST GL",
              AS12: "CGST Amt",
              AT12: "SGST GL",
              AU12: "SGST Amt",
              AV12: "IGST GL",
              AW12: "IGST Amt",
              AX12: "TDS Sec GL",
              AY12: "TDS Amt",
              AZ12: "Round Off",
              BA12: "Reference",
              BB12: "Reference amount",
              BC12: "Total Value",
              BD12: "Narration",
              BE12: "Effective Date",
            },
          ],
          { skipHeader: true, origin: "A12" }
        );

        let rowOffset = 12;
        for (let i = 0; i < main_stmt.length; i += CHUNK_SIZE) {
          const chunk = main_stmt.slice(i, i + CHUNK_SIZE);
          const transformed = await processChunk(chunk);
          xlsx.utils.sheet_add_json(ReportHeader, transformed, {
            skipHeader: true,
            origin: { r: rowOffset, c: 0 },
          });
          rowOffset += transformed.length;

          const processed = Math.min(i + CHUNK_SIZE, main_stmt.length);
          const percentage = Math.round((processed / main_stmt.length) * 100);
          socket.emit("vbtReportProgress", {
            processed,
            total: main_stmt.length,
            percentage,
          });
        }

        xlsx.utils.book_append_sheet(workbook, ReportHeader, "Purchase Register");
        xlsx.writeFile(workbook, filePath);

        try {
          await otherDB.query(
            "UPDATE user_files_req SET status = 'complete', other_data = :otherData, update_date = :updatedAt WHERE user_id = :uid AND req_code = :filename AND insert_date = :insertTimestamp",
            {
              replacements: {
                uid: userID,
                otherData: JSON.stringify({ fileName, fileUrl: filePath }),
                filename: fileCode,
                updatedAt: moment().format("YYYY-MM-DD HH:mm:ss"),
                insertTimestamp,
              },
              type: otherDB.QueryTypes.UPDATE,
            }
          );
        } catch (updateErr) {
          console.error("UPDATE failed (success branch):", updateErr.stack);
        }

        socket.emit("vbtReportResponse", {
          success: true,
          message: "Report generated and sent successfully.",
        });

        try {
          const attachment = [
            {
              filename: fileName,
              content: fs.createReadStream(filePath),
            },
          ];
          sendMail(
            userDetails[0].Email_ID,
            "",
            "Purchase Register Report",
            htmlTemplate(userDetails[0].user_name, new Date(), "Purchase Register"),
            attachment
          ).catch((mailErr) => {
            console.error("Email send failed (non-blocking):", mailErr.stack);
          });
        } catch (mailErr) {
          console.error("Email attachment setup failed:", mailErr.stack);
        }
      } catch (error) {
        socket.emit("error", {
          success: false,
          message: "an internal error found",
          error: error.stack,
        });
      }
    });
  } catch (error) {
    socket.emit("error", {
      success: false,
      message: "internal error occurred",
      error: error.stack,
    });
  }
};
