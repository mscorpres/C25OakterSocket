const path = require("path");
const moment = require("moment");
const XLSX = require("xlsx");
const { otherDB, invtDB } = require("../../config/db/connection");
const jwt = require("jsonwebtoken");
const Validator = require("validatorjs");

const auth = require("../../middleware/auth");
const permission = require("../../middleware/permission");
const helper = require("../../helper/helper");
const { error_log, emit_error_msg } = require("../utils");

exports.report8 = async (date, uid, emit_notifications, notificationId, socket, io, req_code, wise = "datewise", data = null, advanced = false, helper) => {
  try {
    // Validation
    const validationRules = {
      wise: "required|in:datewise,skuwise",
      date: "required",
    };

    if (wise === "skuwise" || advanced) {
      validationRules.data = "required";
    }

    const validation = new Validator({ wise, date, data }, validationRules);

    if (validation.fails()) {
      socket.emit("error", { message: validation.errors.all() });
      return false;
    }

    // Date validation and processing
    const dateValidation = validateAndProcessDates(date);
    if (dateValidation.error) {
      socket.emit("error", { message: dateValidation.error });
      return false;
    }

    const { fromdate, todate, replacements } = dateValidation;

    // Build and execute optimized main query
    const productionData = await executeOptimizedMainQuery(wise, data, advanced, replacements);
    
    if (!productionData || productionData.length === 0) {
      socket.emit("error", { message: "No Data Found" });
      return false;
    }

    // Emit download start notification
    io.to(uid).emit("download_start_detail", {
      title: "R8 Report",
      details: date,
      notificationId: notificationId,
      status: "pending",
      detailStatus: true,
      total: false,
      type: "file",
    });

    // Process data efficiently with batched operations
    const excelData = await processDataOptimized(productionData, helper);

    // Generate and save Excel file
    const filePath = await generateExcelFile(excelData, helper);

    // Update database with file information
    await updateUserFileRequest(uid, req_code, date, filePath, helper);

    emit_notifications(notificationId);
    return true;

  } catch (err) {
    error_log({ stack: err.stack });
    socket.emit("error", {
      message: "Internal Error!!! If this condition persists, contact your system administrator",
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
    return false;
  }
};

// Helper Functions

function validateAndProcessDates(date) {
  const reqDate = date.match(/([0-9]{2})-([0-9]{2})-([0-9]{4})/g);
  if (!reqDate || reqDate.length !== 2) {
    return { error: "Invalid date format. Expected DD-MM-YYYY to DD-MM-YYYY" };
  }

  const fromDate = moment(reqDate[0], "DD-MM-YYYY");
  const toDate = moment(reqDate[1], "DD-MM-YYYY");

  if (!fromDate.isValid() || !toDate.isValid()) {
    return { error: "Invalid date values" };
  }

  if (fromDate.isAfter(toDate)) {
    return { error: "Start date must be before end date" };
  }

  if (toDate.diff(fromDate, "days") > 90) {
    return { 
      error: "Date range cannot exceed 90 days. Effective from Nov 11, 2021" 
    };
  }

  return {
    fromdate: fromDate.format("YYYY-MM-DD"),
    todate: toDate.format("YYYY-MM-DD"),
    replacements: { 
      date1: fromDate.format("YYYY-MM-DD"), 
      date2: toDate.format("YYYY-MM-DD") 
    }
  };
}

async function executeOptimizedMainQuery(wise, data, advanced, replacements) {
  // Single optimized query with all necessary joins
  let baseQuery = `
    SELECT DISTINCT 
      mp2.mfg_transaction,
      mp2.mfg_full_date,
      mp2.mfg_prod_planing_qty,
      mp2.mfg_sku,
      mp2.mfg_con_location,
      mp2.mfg_comment,
      mp2.mfg_ref_id,
      mp3.fg_out_remark,
      p.p_name,
      p.p_sku,
      p.products_type,
      u.units_name,
      al.user_name
    FROM mfg_production_2 mp2
    LEFT JOIN mfg_production_3 mp3 ON mp3.mfg_ref_transid_2 = mp2.mfg_transaction
    LEFT JOIN products p ON mp2.mfg_sku = p.p_sku
    LEFT JOIN units u ON p.p_uom = u.units_id
    LEFT JOIN admin_login al ON al.CustID = mp2.mfg_approved_by
    WHERE mp2.mfg_prod_type = 'C'
      AND DATE(mp2.mfg_full_date) BETWEEN :date1 AND :date2`;

  if ((wise === "skuwise" && !advanced) || (advanced && wise === "skuwise")) {
    baseQuery += ` AND mp2.mfg_sku = :sku`;
    replacements.sku = data;
  }

  baseQuery += ` ORDER BY mp2.mfg_transaction DESC`;

  return await invtDB.query(baseQuery, {
    replacements,
    type: invtDB.QueryTypes.SELECT,
  });
}

async function processDataOptimized(productionData, helper) {
  // Pre-fetch all required data in batches
  const batchData = await fetchAllRequiredDataBatched(productionData);
  
  const excelData = [
    ["MFG NO", "DATE", "SKU", "PRODUCT", "FG TYPE", "PART CODE", "NEW PART NO", 
     "COMPONENT", "PRD MFG", "UOM", "PART CONSUMED", "BOM QTY", "CONSUME LOC", 
     "FG LOC", "MFG BY", "COMMENT", "WEIGHTED PURCHASE RATE", "WEIGHTED TOTAL COST"],
  ];

  // Process each production record
  for (const production of productionData) {
    const locationName = batchData.locations[production.mfg_con_location] || "N/A";
    const productType = getProductType(production.products_type);
    const formattedDate = moment(production.mfg_full_date).format("DD-MM-YYYY HH:mm:ss");

    // Add main production row
    excelData.push([
      production.mfg_transaction,
      formattedDate,
      production.p_sku,
      production.p_name,
      productType,
      "--", "--", "--",
      production.mfg_prod_planing_qty,
      production.units_name,
      "--", "--",
      locationName,
      production.user_name,
      "--", "--", "--"
    ]);

    // Add component rows
    const components = batchData.components[production.mfg_transaction] || [];
    const bomSubject = batchData.bomSubjects[production.mfg_transaction];

    for (const component of components) {
      const componentType = getComponentType(component.components_type);
      const consQty = Number(component.qty || 0) + Number(component.other_qty || 0);
      const bomQty = batchData.bomQuantities[`${component.component_key}_${bomSubject}`] || 0;
      
      // Get pre-calculated weighted rate
      const weightedRate = batchData.weightedRates[`${component.component_key}_${component.insert_date}`] || 0;
      const totalCost = consQty * weightedRate;

      excelData.push([
        "--", "--", "--", "--",
        componentType,
        component.c_part_no,
        component.c_new_part_no,
        component.c_name,
        "--",
        component.units_name,
        consQty,
        Number(bomQty) <= 0 ? "--" : helper.number(bomQty),
        component.loc_name,
        "--", "--",
        component.any_remark,
        weightedRate,
        helper.number(totalCost)
      ]);
    }
  }

  return excelData;
}

async function fetchAllRequiredDataBatched(productionData) {
  const mfgTransactions = productionData.map(p => p.mfg_transaction);
  const uniqueLocations = [...new Set(productionData.map(p => p.mfg_con_location).filter(Boolean))];

  // Batch fetch all data in parallel
  const [locations, bomSubjects, components, bomQuantities, weightedRates] = await Promise.all([
    fetchLocationsBatch(uniqueLocations),
    fetchBomSubjectsBatch(mfgTransactions),
    fetchComponentsBatch(mfgTransactions),
    fetchBomQuantitiesBatch(mfgTransactions),
    fetchWeightedRatesBatch(mfgTransactions)
  ]);

  return {
    locations,
    bomSubjects,
    components,
    bomQuantities,
    weightedRates
  };
}

async function fetchLocationsBatch(locations) {
  if (locations.length === 0) return {};

  const placeholders = locations.map((_, i) => `:loc${i}`).join(',');
  const replacements = {};
  locations.forEach((loc, i) => {
    replacements[`loc${i}`] = loc;
  });

  const results = await invtDB.query(
    `SELECT location_key, loc_name FROM location_main WHERE location_key IN (${placeholders})`,
    { replacements, type: invtDB.QueryTypes.SELECT }
  );

  const locationMap = {};
  results.forEach(loc => {
    locationMap[loc.location_key] = loc.loc_name;
  });

  return locationMap;
}

async function fetchBomSubjectsBatch(mfgTransactions) {
  if (mfgTransactions.length === 0) return {};

  const placeholders = mfgTransactions.map((_, i) => `:mfg${i}`).join(',');
  const replacements = {};
  mfgTransactions.forEach((mfg, i) => {
    replacements[`mfg${i}`] = mfg;
  });

  const results = await invtDB.query(`
    SELECT mp2.mfg_transaction, mp1.prod_bom_subject 
    FROM mfg_production_2 mp2
    LEFT JOIN mfg_production_1 mp1 ON mp1.prod_transaction = mp2.mfg_ref_id 
    WHERE mp2.mfg_transaction IN (${placeholders})
    GROUP BY mp2.mfg_transaction, mp1.prod_bom_subject
  `, { replacements, type: invtDB.QueryTypes.SELECT });

  const bomSubjectMap = {};
  results.forEach(item => {
    bomSubjectMap[item.mfg_transaction] = item.prod_bom_subject;
  });

  return bomSubjectMap;
}

async function fetchComponentsBatch(mfgTransactions) {
  if (mfgTransactions.length === 0) return {};

  const placeholders = mfgTransactions.map((_, i) => `:mfg${i}`).join(',');
  const replacements = {};
  mfgTransactions.forEach((mfg, i) => {
    replacements[`mfg${i}`] = mfg;
  });

  const results = await invtDB.query(`
    SELECT 
      rm.mfg_ppr_trans_id_2 as mfg_transaction,
      rm.mfg_bom_qty, rm.qty, rm.any_remark, rm.other_qty, rm.insert_date,
      c.c_part_no, c.c_new_part_no, c.c_name, c.component_key, c.components_type,
      u.units_name, lm.loc_name
    FROM rm_location rm
    LEFT JOIN components c ON rm.components_id = c.component_key
    LEFT JOIN units u ON c.c_uom = u.units_id
    LEFT JOIN location_main lm ON rm.loc_out = lm.location_key
    WHERE rm.mfg_ppr_trans_id_2 IN (${placeholders})
  `, { replacements, type: invtDB.QueryTypes.SELECT });

  const componentMap = {};
  results.forEach(comp => {
    if (!componentMap[comp.mfg_transaction]) {
      componentMap[comp.mfg_transaction] = [];
    }
    componentMap[comp.mfg_transaction].push(comp);
  });

  return componentMap;
}

async function fetchBomQuantitiesBatch(mfgTransactions) {
  if (mfgTransactions.length === 0) return {};

  // This is a simplified approach - you may need to adjust based on your BOM structure
  const results = await invtDB.query(`
    SELECT 
      CONCAT(bq.component_id, '_', bq.subject_under) as key_combo,
      bq.qty
    FROM bom_quantity bq
    WHERE bq.subject_under IN (
      SELECT DISTINCT mp1.prod_bom_subject 
      FROM mfg_production_2 mp2
      LEFT JOIN mfg_production_1 mp1 ON mp1.prod_transaction = mp2.mfg_ref_id 
      WHERE mp2.mfg_transaction IN (${mfgTransactions.map((_, i) => `:mfg${i}`).join(',')})
    )
  `, { 
    replacements: mfgTransactions.reduce((acc, mfg, i) => ({ ...acc, [`mfg${i}`]: mfg }), {}),
    type: invtDB.QueryTypes.SELECT 
  });

  const bomQuantityMap = {};
  results.forEach(item => {
    bomQuantityMap[item.key_combo] = item.qty;
  });

  return bomQuantityMap;
}

async function fetchWeightedRatesBatch(mfgTransactions) {
  // Get all unique component-date combinations first
  const componentDates = await invtDB.query(`
    SELECT DISTINCT 
      rm.components_id,
      DATE_FORMAT(rm.insert_date, '%Y-%m-%d %H:%i:%s') as formatted_date
    FROM rm_location rm
    WHERE rm.mfg_ppr_trans_id_2 IN (${mfgTransactions.map((_, i) => `:mfg${i}`).join(',')})
  `, { 
    replacements: mfgTransactions.reduce((acc, mfg, i) => ({ ...acc, [`mfg${i}`]: mfg }), {}),
    type: invtDB.QueryTypes.SELECT 
  });

  // Batch calculate weighted rates (this is the major optimization)
  const weightedRateMap = {};
  
  // Process in chunks to avoid overwhelming the system
  const chunkSize = 50;
  for (let i = 0; i < componentDates.length; i += chunkSize) {
    const chunk = componentDates.slice(i, i + chunkSize);
    
    await Promise.all(chunk.map(async (item) => {
      try {
        const rate = await require("../../helper/utils").getWeightedPurchaseRate(
          item.components_id,
          item.formatted_date
        );
        weightedRateMap[`${item.components_id}_${item.formatted_date}`] = rate || 0;
      } catch (error) {
        console.error(`Error calculating weighted rate for ${item.components_id}:`, error);
        weightedRateMap[`${item.components_id}_${item.formatted_date}`] = 0;
      }
    }));
  }

  return weightedRateMap;
}

function getProductType(productsType) {
  switch (productsType) {
    case "default": return "FG";
    case "semi": return "SEMI FG";
    default: return "N/A";
  }
}

function getComponentType(componentsType) {
  switch (componentsType) {
    case "default": return "RM";
    case "semi": return "SR";
    default: return "N/A";
  }
}

async function generateExcelFile(excelData, helper) {
  const ws = XLSX.utils.aoa_to_sheet(excelData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  
  const filename = helper.getUniqueNumber() + ".xlsx";
  const filePath = "./files/excel/R8" + filename;
  
  XLSX.writeFile(wb, filePath);
  return filePath;
}

async function updateUserFileRequest(uid, req_code, date, filePath, helper) {
  const filename = path.basename(filePath);
  
  await otherDB.query(
    `UPDATE user_files_req 
     SET status = 'complete', 
         other_data = :other 
     WHERE user_id = :uid 
       AND req_code = :req_code 
       AND req_date = :req_date`,
    {
      replacements: {
        uid,
        req_code,
        req_date: date,
        other: JSON.stringify({
          fileName: `Detailed Production ${filename}`,
          fileUrl: filePath,
          fileBuffer: Buffer.from(filePath, "base64"),
        }),
      },
      type: otherDB.QueryTypes.UPDATE,
    }
  );
}