const multer = require("multer");
const path = require("path");
const moment = require("moment");
const XLSX = require("xlsx");
const fs = require("fs");
const { decode } = require("html-entities");
require("dotenv").config();

const { otherDB, invtDB } = require("./../../config/db/connection");
const helper = require("../../helper/helper");
const { error_log, emit_error_msg } = require("../../helper/utils");
const { htmlTemplate } = require("./EmailTemplate/fileDownload");

const Validator = require("validatorjs");

exports.r18 = async (data, uid, emit_notifications, fileName, notificationId, socket, io, for_location) => {
  const validation = new Validator(
    {
      date: data,
      for_location: for_location,
    },
    {
      date: "required",
      for_location: "required|in:SF,RM",
    }
  );

  if (validation.fails()) {
    console.error("Validation failed:", validation.errors.all());
    emit_error_msg(io, socket, "Invalid date or location");
    return { code: 500, msg: "Please select valid date and location (SF or RM)" };
  }

  try {
    console.log("r18Process started for user:", uid, "fileName:", fileName, "for_location:", for_location, "date:", data);

    const report_date = moment(data, "DD-MM-YYYY").format("YYYY-MM-DD");
    
    // Get location key based on for_location 
    let location_key = "";
    if (for_location === "RM") {
      location_key = "2023112717950595";
    } else if (for_location === "SF") {
      location_key = "20231127171244714";
    }

    // Get all active locations for the selected floor 
    const stmt_get_q4_location = await invtDB.query(
      "SELECT locations FROM `location_allotted` WHERE `loc_all_key` = :location_key", 
      {
        replacements: { location_key: location_key },
        type: invtDB.QueryTypes.SELECT,
      }
    );

    if (!stmt_get_q4_location.length) {
      emit_error_msg(io, socket, "No location allocation found");
      return { code: 500, msg: "No location allocation found" };
    }

    const stmt_get_all_location = await invtDB.query(
      "SELECT loc_name, location_key, loc_address, assigned_to FROM location_main WHERE location_key IN (:location_defined) AND loc_status = 'ACTIVE' ORDER BY loc_name", 
      {
        replacements: { location_defined: stmt_get_q4_location[0].locations.split(",") },
        type: invtDB.QueryTypes.SELECT,
      }
    );

    if (stmt_get_all_location.length === 0) {
      emit_error_msg(io, socket, "No active locations found");
      return { code: 500, msg: "No active locations found" };
    }

    try {
      fs.accessSync("./files/excel/" + fileName);
    } catch (error) {
      fs.writeFileSync("./files/excel/" + fileName, "", "utf8");
    }

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([]);
    
    // Create headers
    const headers = ["Part Code", "New Part No", "Material Name"];
    stmt_get_all_location.forEach((loc) => {
      headers.push(loc.loc_name);
    });
    XLSX.utils.sheet_add_aoa(worksheet, [headers], { origin: "A1" });
    XLSX.utils.book_append_sheet(workbook, worksheet, "R18 Report");
    
    // Write initial file with headers to ensure it's not blank
    XLSX.writeFile(workbook, "./files/excel/" + fileName);

    // Get total count of components
    const total_comp = await invtDB.query(
      "SELECT COUNT(*) AS records FROM components WHERE c_type != 'S' AND c_is_enabled = 'Y'",
      { type: invtDB.QueryTypes.SELECT }
    );
    const totalRecords = total_comp[0].records;

    let processedCount = 0;
    const batchSize = 50; // Process in batches to avoid memory issues
    
    // Process components in batches
    for (let offset = 0; offset < totalRecords; offset += batchSize) {
      console.log(`Processing batch: ${offset + 1} to ${Math.min(offset + batchSize, totalRecords)} of ${totalRecords}`);
      
      // Get batch of components
      const stmt_all_comp = await invtDB.query(
        "SELECT c_part_no, component_key, c_name, c_new_part_no FROM components WHERE c_type != 'S' AND c_is_enabled = 'Y' ORDER BY c_part_no LIMIT :limit OFFSET :offset",
        {
          replacements: { limit: batchSize, offset: offset },
          type: invtDB.QueryTypes.SELECT,
        }
      );

      if (stmt_all_comp.length === 0) break;

      // Build optimized bulk query for all components in this batch and all locations
      // This matches the Q5 logic structure
      let bulkQuery = "";
      const component_keys = stmt_all_comp.map(comp => comp.component_key);
      
      for (let i = 0; i < stmt_get_all_location.length; i++) {
        if (i > 0) bulkQuery += " UNION ALL ";
        
        bulkQuery += `
        SELECT 
          c.component_key,
          c.c_part_no,
          c.c_name,
          c.c_new_part_no,
          '${stmt_get_all_location[i].location_key}' as location_key,
          '${stmt_get_all_location[i].loc_name}' as loc_name,
          COALESCE(SUM(CASE WHEN rm.trans_type IN ('INWARD', 'ISSUE', 'JOBWORK', 'REJECTION', 'TRANSFER') 
                            AND rm.loc_in = '${stmt_get_all_location[i].location_key}' 
                            AND DATE_FORMAT(rm.insert_date, '%Y-%m-%d') <= '${report_date}' 
                       THEN rm.qty ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN rm.trans_type IN ('CONSUMPTION', 'ISSUE', 'JOBWORK', 'REJECTION', 'TRANSFER') 
                            AND rm.loc_out = '${stmt_get_all_location[i].location_key}' 
                            AND DATE_FORMAT(rm.insert_date, '%Y-%m-%d') <= '${report_date}' 
                       THEN rm.qty ELSE 0 END), 0) AS closing_balance
        FROM components c
        LEFT JOIN rm_location rm ON c.component_key = rm.components_id
        WHERE c.component_key IN (${component_keys.join(',')})
        GROUP BY c.component_key, c.c_part_no, c.c_name, c.c_new_part_no
        `;
      }

      // Execute the bulk query
      const stockResults = await invtDB.query(bulkQuery, {
        type: invtDB.QueryTypes.SELECT,
      });

      // Organize results by component
      const stockByComponent = {};
      stockResults.forEach(row => {
        if (!stockByComponent[row.component_key]) {
          stockByComponent[row.component_key] = {
            c_part_no: row.c_part_no,
            c_name: row.c_name,
            c_new_part_no: row.c_new_part_no,
            locations: {}
          };
        }
        stockByComponent[row.component_key].locations[row.loc_name] = parseFloat(row.closing_balance) || 0;
      });

      // Prepare batch data for Excel
      const batchRows = [];
      for (const comp of stmt_all_comp) {
        const stockData = stockByComponent[comp.component_key];
        
        // Always add row, even if no stock data (use component data directly)
        const partNo = comp.c_part_no || "";
        const newPartNo = comp.c_new_part_no || "";
        const componentName = comp.c_name || "";
        
        const row = [
          partNo,
          newPartNo || "",
          decode(componentName)
        ];
        
        // Add stock for each location in the same order as headers
        stmt_get_all_location.forEach(loc => {
          const stock = stockData?.locations[loc.loc_name] || 0;
          row.push(helper.number(stock)); 
        });
        
        batchRows.push(row);
        processedCount++;
      }

      // Add batch rows to Excel - always add rows even if empty to maintain structure
      if (batchRows.length > 0) {
        XLSX.utils.sheet_add_aoa(worksheet, batchRows, { origin: -1 });
        // Ensure worksheet is still in workbook before writing
        if (!workbook.SheetNames.includes("R18 Report")) {
          XLSX.utils.book_append_sheet(workbook, worksheet, "R18 Report");
        }
        XLSX.writeFile(workbook, "./files/excel/" + fileName);
      }

      // Update progress
      const completedPercentage = (processedCount * 100) / totalRecords;
      if (notificationId) {
        io.to(uid).emit("getting-loading-percentage", {
          notificationId: notificationId,
          total: completedPercentage.toFixed(1),
        });
      } else {
        socket.emit("r18", {
          total: `${processedCount}/${totalRecords}`,
        });
      }

      // Update user_files_req
      await otherDB.query(
        "UPDATE `user_files_req` SET `other_data` = :other WHERE `user_id` = :uid AND `req_code` = 'R18'",
        {
          replacements: {
            uid: uid,
            other: JSON.stringify({
              fileName: fileName,
              fileUrl: "./files/excel/" + fileName,
              totalRows: processedCount,
            }),
          },
          type: otherDB.QueryTypes.UPDATE,
        }
      );

      // Small delay to prevent overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Final write to ensure all data is saved
    if (workbook && worksheet) {
      // Re-read worksheet from workbook to ensure we have the latest data
      const finalWorksheet = workbook.Sheets["R18 Report"];
      if (finalWorksheet) {
        XLSX.writeFile(workbook, "./files/excel/" + fileName);
      }
    }

    // Mark as complete
    await otherDB.query(
      "UPDATE `user_files_req` SET `status` = 'complete', `other_data` = :other WHERE `user_id` = :uid AND `req_code` = 'R18'",
      {
        replacements: {
          uid: uid,
          other: JSON.stringify({
            fileName: fileName,
            fileUrl: "./files/excel/" + fileName,
            totalRows: processedCount,
          }),
        },
        type: otherDB.QueryTypes.UPDATE,
      }
    );

    // Send email with attachment
    const user = await invtDB.query(
      "SELECT `Email_ID`, `user_name` FROM `admin_login` WHERE `CustID` = :CustID",
      {
        replacements: { CustID: uid },
        type: invtDB.QueryTypes.SELECT,
      }
    );

    if (user.length > 0) {
      const userEmail = user[0].Email_ID;
      const attachment = [
        {
          filename: `R18_Report_${for_location}_${data.replace(/-/g, '')}.xlsx`,
          content: fs.readFileSync("./files/excel/" + fileName),
        },
      ];

      helper.sendMail(
        userEmail,
        "",
        `R18 Report ${for_location} [File Ready for download] Ref:${helper.randomNumber(99999, 999999)}`,
        htmlTemplate(user[0].user_name, new Date(), "R18", `${process.env.SOCKET_API_URL}/${fileName}`),
        attachment
      );
    }

    emit_notifications(io, socket, notificationId);
    
    console.log(`R18 report generation completed. Processed ${processedCount} components.`);
    return { code: 200, msg: "Report generated successfully" };

  } catch (err) {
    console.error("Critical error in r18Process:", err.message);
    error_log({ stack: err.stack, message: err.message });
    
    await otherDB.query(
      "UPDATE `user_files_req` SET `status` = 'failed' WHERE `reactNotificationId` = :uid AND `req_code` = 'R18'",
      {
        replacements: { uid: notificationId },
        type: otherDB.QueryTypes.UPDATE,
      }
    );
    
    emit_error_msg(io, socket, `Critical failure in R18 report generation: ${err.message}`);
    emit_notifications(io, socket, notificationId);
    
    return { code: 500, msg: err.message };
  }
};