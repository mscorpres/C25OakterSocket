const moment = require("moment");
const XLSX = require("xlsx");
const fs = require("fs");
const { otherDB, invtDB } = require("../config/db/connection");
const { error_log } = require("../helper/utils");
const helper = require("../helper/helper");

const { htmlTemplate } = require("../helper/backendProcess/EmailTemplate/fileDownload");

var cron = require("node-cron");

// CRON JOB
// cron.schedule("30 0 * * *", () => {
cron.schedule("30 2 * * *", () => { // added by shiv for 02:30 AM
  monthly_audit_email();
});

async function monthly_audit_email() {
  try {
    console.time("R28");
    const yesterday = moment().subtract(1, "days").format("DD-MM-YYYY");

    // REPORT GENERATION

    const stmt_part_codes = await otherDB.query("SELECT * FROM monthly_audit WHERE part_code NOT IN ( SELECT parts_code FROM invt_r28 WHERE req_date = :date AND insert_by = 'SYSTEM' )", {
      replacements: {
        date: yesterday,
      },
      type: otherDB.QueryTypes.SELECT,
    });

    if (stmt_part_codes.length > 0) {
      // SET PART CODE IN ARRAY
      const part_codes = [];
      for (let i = 0; i < stmt_part_codes.length; i++) {
        part_codes.push(stmt_part_codes[i].part_code);
      }

      const stmt_comp = await invtDB.query("SELECT component_key , c_part_no , c_name , c_new_part_no FROM components WHERE c_part_no IN (:part_codes)", {
        replacements: {
          part_codes: part_codes,
        },
        type: invtDB.QueryTypes.SELECT,
      });

      // RM LOCATIONS
      let rm_locations = await getLocationArray("2023112719352224");

      // SF LOCATIONS
      let sf_locations = await getLocationArray("20231127193722306");

      // VENDORS LOCATIONS
      let vendor_locations = await getLocationArray("20231127193739513");

      // JW LOCATIONS
      let jw_locations = await getLocationArray("20231127193756891");

      const report_data = [];
      for (let i = 0; i < stmt_comp.length; i++) {
        let rm_closing,
          sf_closing,
          jw_closing,
          vendor_closing = 0;
        // RM
        if (rm_locations.length > 0) {
          let stmt_rm = await invtDB.query(
            "SELECT (SELECT COALESCE(SUM(qty+other_qty), 0) AS inward FROM rm_location WHERE components_id = :component AND trans_type IN ('INWARD' , 'ISSUE' , 'JOBWORK' , 'REJECTION' , 'TRANSFER') AND loc_in IN (:location) AND DATE_FORMAT(insert_date,'%Y-%m-%d') BETWEEN :date1 AND :date2) AS inward, (SELECT COALESCE(SUM(qty+other_qty), 0) AS outward FROM rm_location WHERE components_id = :component AND trans_type IN ('CONSUMPTION' , 'ISSUE' , 'JOBWORK' , 'REJECTION' , 'TRANSFER') AND loc_out IN (:location) AND DATE_FORMAT(insert_date,'%Y-%m-%d') BETWEEN :date1 AND :date2) outward ,(SELECT COALESCE(SUM(qty+other_qty), 0) AS inbefor FROM rm_location WHERE components_id = :component AND trans_type IN ('INWARD' , 'ISSUE' , 'JOBWORK' , 'REJECTION' , 'TRANSFER') AND loc_in IN (:location) AND DATE_FORMAT(insert_date,'%Y-%m-%d') < :date1 ) AS inbefor ,  (SELECT COALESCE(SUM(qty+other_qty), 0) AS outward FROM rm_location WHERE components_id = :component AND trans_type IN ('CONSUMPTION' , 'ISSUE' , 'JOBWORK' , 'REJECTION' , 'TRANSFER') AND loc_out IN (:location) AND DATE_FORMAT(insert_date,'%Y-%m-%d') < :date1) AS outbefore FROM DUAL",
            {
              replacements: {
                component: stmt_comp[i].component_key,
                date1: moment(yesterday, "DD-MM-YYYY").format("YYYY-MM-DD"),
                date2: moment(yesterday, "DD-MM-YYYY").format("YYYY-MM-DD"),
                location: rm_locations,
              },
              type: invtDB.QueryTypes.SELECT,
            }
          );
          if (stmt_rm.length > 0) {
            rm_closing = Number(stmt_rm[0].inbefor - stmt_rm[0].outbefore) + Number(stmt_rm[0].inward) - Number(stmt_rm[0].outward);
          }
        }

        // SF
        if (sf_locations.length > 0) {
          let stmt_sf = await invtDB.query(
            "SELECT (SELECT COALESCE(SUM(qty+other_qty), 0) AS inward FROM rm_location WHERE components_id = :component AND trans_type IN ('INWARD' , 'ISSUE' , 'JOBWORK' , 'REJECTION' , 'TRANSFER') AND loc_in IN (:location) AND DATE_FORMAT(insert_date,'%Y-%m-%d') BETWEEN :date1 AND :date2) AS inward, (SELECT COALESCE(SUM(qty+other_qty), 0) AS outward FROM rm_location WHERE components_id = :component AND trans_type IN ('CONSUMPTION' , 'ISSUE' , 'JOBWORK' , 'REJECTION' , 'TRANSFER') AND loc_out IN (:location) AND DATE_FORMAT(insert_date,'%Y-%m-%d') BETWEEN :date1 AND :date2) outward ,(SELECT COALESCE(SUM(qty+other_qty), 0) AS inbefor FROM rm_location WHERE components_id = :component AND trans_type IN ('INWARD' , 'ISSUE' , 'JOBWORK' , 'REJECTION' , 'TRANSFER') AND loc_in IN (:location) AND DATE_FORMAT(insert_date,'%Y-%m-%d') < :date1 ) AS inbefor ,  (SELECT COALESCE(SUM(qty+other_qty), 0) AS outward FROM rm_location WHERE components_id = :component AND trans_type IN ('CONSUMPTION' , 'ISSUE' , 'JOBWORK' , 'REJECTION' , 'TRANSFER') AND loc_out IN (:location) AND DATE_FORMAT(insert_date,'%Y-%m-%d') < :date1) AS outbefore FROM DUAL",
            {
              replacements: {
                component: stmt_comp[i].component_key,
                date1: moment(yesterday, "DD-MM-YYYY").format("YYYY-MM-DD"),
                date2: moment(yesterday, "DD-MM-YYYY").format("YYYY-MM-DD"),
                location: sf_locations,
              },
              type: invtDB.QueryTypes.SELECT,
            }
          );
          if (stmt_sf.length > 0) {
            sf_closing = Number(stmt_sf[0].inbefor - stmt_sf[0].outbefore) + Number(stmt_sf[0].inward) - Number(stmt_sf[0].outward);
          }
        }

        // VENDOR
        if (vendor_locations.length > 0) {
          let stmt_vendor = await invtDB.query(
            "SELECT (SELECT COALESCE(SUM(qty+other_qty), 0) AS inward FROM rm_location WHERE components_id = :component AND trans_type IN ('INWARD' , 'ISSUE' , 'JOBWORK' , 'REJECTION' , 'TRANSFER') AND loc_in IN (:location) AND DATE_FORMAT(insert_date,'%Y-%m-%d') BETWEEN :date1 AND :date2) AS inward, (SELECT COALESCE(SUM(qty+other_qty), 0) AS outward FROM rm_location WHERE components_id = :component AND trans_type IN ('CONSUMPTION' , 'ISSUE' , 'JOBWORK' , 'REJECTION' , 'TRANSFER') AND loc_out IN (:location) AND DATE_FORMAT(insert_date,'%Y-%m-%d') BETWEEN :date1 AND :date2) outward ,(SELECT COALESCE(SUM(qty+other_qty), 0) AS inbefor FROM rm_location WHERE components_id = :component AND trans_type IN ('INWARD' , 'ISSUE' , 'JOBWORK' , 'REJECTION' , 'TRANSFER') AND loc_in IN (:location) AND DATE_FORMAT(insert_date,'%Y-%m-%d') < :date1 ) AS inbefor ,  (SELECT COALESCE(SUM(qty+other_qty), 0) AS outward FROM rm_location WHERE components_id = :component AND trans_type IN ('CONSUMPTION' , 'ISSUE' , 'JOBWORK' , 'REJECTION' , 'TRANSFER') AND loc_out IN (:location) AND DATE_FORMAT(insert_date,'%Y-%m-%d') < :date1) AS outbefore FROM DUAL",
            {
              replacements: {
                component: stmt_comp[i].component_key,
                date1: moment(yesterday, "DD-MM-YYYY").format("YYYY-MM-DD"),
                date2: moment(yesterday, "DD-MM-YYYY").format("YYYY-MM-DD"),
                location: vendor_locations,
              },
              type: invtDB.QueryTypes.SELECT,
            }
          );
          if (stmt_vendor.length > 0) {
            jw_closing = Number(stmt_vendor[0].inbefor - stmt_vendor[0].outbefore) + Number(stmt_vendor[0].inward) - Number(stmt_vendor[0].outward);
          }
        }

        // JW
        if (jw_locations.length > 0) {
          let stmt_jw = await invtDB.query(
            "SELECT (SELECT COALESCE(SUM(qty+other_qty), 0) AS inward FROM rm_location WHERE components_id = :component AND trans_type IN ('INWARD' , 'ISSUE' , 'JOBWORK' , 'REJECTION' , 'TRANSFER') AND loc_in IN (:location) AND DATE_FORMAT(insert_date,'%Y-%m-%d') BETWEEN :date1 AND :date2) AS inward, (SELECT COALESCE(SUM(qty+other_qty), 0) AS outward FROM rm_location WHERE components_id = :component AND trans_type IN ('CONSUMPTION' , 'ISSUE' , 'JOBWORK' , 'REJECTION' , 'TRANSFER') AND loc_out IN (:location) AND DATE_FORMAT(insert_date,'%Y-%m-%d') BETWEEN :date1 AND :date2) outward ,(SELECT COALESCE(SUM(qty+other_qty), 0) AS inbefor FROM rm_location WHERE components_id = :component AND trans_type IN ('INWARD' , 'ISSUE' , 'JOBWORK' , 'REJECTION' , 'TRANSFER') AND loc_in IN (:location) AND DATE_FORMAT(insert_date,'%Y-%m-%d') < :date1 ) AS inbefor ,  (SELECT COALESCE(SUM(qty+other_qty), 0) AS outward FROM rm_location WHERE components_id = :component AND trans_type IN ('CONSUMPTION' , 'ISSUE' , 'JOBWORK' , 'REJECTION' , 'TRANSFER') AND loc_out IN (:location) AND DATE_FORMAT(insert_date,'%Y-%m-%d') < :date1) AS outbefore FROM DUAL",
            {
              replacements: {
                component: stmt_comp[i].component_key,
                date1: moment(yesterday, "DD-MM-YYYY").format("YYYY-MM-DD"),
                date2: moment(yesterday, "DD-MM-YYYY").format("YYYY-MM-DD"),
                location: jw_locations,
              },
              type: invtDB.QueryTypes.SELECT,
            }
          );
          if (stmt_jw.length > 0) {
            vendor_closing = Number(stmt_jw[0].inbefor - stmt_jw[0].outbefore) + Number(stmt_jw[0].inward) - Number(stmt_jw[0].outward);
          }
        }

        // INSER INTO REPORT DATA

        await otherDB.query(
          "INSERT INTO  invt_r28 (  parts_code , c_new_part_no ,  part_name ,  rm ,  sf ,  vendor ,  jw , 	insert_date	, 	insert_by , req_date ) VALUES ( :PART_NO, :SECONDARY_PART_NO , :PART_NAME, :RM_CLOSING, :SF_CLOSING, :VENDOR_CLOSING, :JW_CLOSING , :insert_date , :insert_by , :req_date )",
          {
            replacements: {
              PART_NO: stmt_comp[i].c_part_no,
              PART_NAME: stmt_comp[i].c_name,
              SECONDARY_PART_NO: stmt_comp[i].c_new_part_no,
              RM_CLOSING: helper.number(rm_closing),
              SF_CLOSING: helper.number(sf_closing),
              VENDOR_CLOSING: helper.number(vendor_closing),
              JW_CLOSING: helper.number(jw_closing),
              insert_date: moment(new Date()).format("YYYY-MM-DD HH:mm:ss"),
              insert_by: "SYSTEM",
              req_date: yesterday,
            },
            type: otherDB.QueryTypes.INSERT,
          }
        );

        //   report_data.push({
        //     PART_NO: stmt_comp[i].c_part_no,
        //     SECONDARY_PART_NO: stmt_comp[i].c_new_part_no,
        //     PART_NAME: stmt_comp[i].c_name,
        //     RM_CLOSING: helper.number(rm_closing),
        //     SF_CLOSING: helper.number(sf_closing),
        //     //VENDOR_CLOSING: helper.number(vendor_closing),
        //     //JW_CLOSING: helper.number(jw_closing),
        //   });
      } // LOOP END
    }

    // END REPORT GENERATION

    const stmt = await otherDB.query(
      `SELECT invt_r28.* , components.c_new_part_no FROM invt_r28 LEFT JOIN ${global.oakter_db_invt}.components ON invt_r28.parts_code = ${global.oakter_db_invt}.components.c_part_no WHERE req_date = :date AND insert_by = 'SYSTEM' GROUP BY parts_code`,
      {
        replacements: { date: yesterday },
        type: otherDB.QueryTypes.SELECT,
      }
    );
    let report_data = [];
    for (let i = 0; i < stmt.length; i++) {
      report_data.push({
        part_code: stmt[i].parts_code,
        part_code_new: stmt[i].c_new_part_no,
        part_name: stmt[i].part_name,
        rm_qty: stmt[i].rm,
        sf_qty: stmt[i].sf,
        time: moment(stmt[i].insert_date, "YYYY-MM-DD HH:mm:ss").format("DD-MM-YYYY HH:mm:ss"),
      });
    }

    const worksheet = XLSX.utils.json_to_sheet(report_data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Weekly Audit");

    const fileName = "Weekly Audit.csv";
    const filePath = "./tmp/";

    XLSX.writeFile(workbook, filePath + fileName);

    // SEND MAIL
    let attachment = [
      {
        filename: "Weekly Audit.csv",
        content: fs.readFileSync(filePath + fileName),
      },
    ];

    console.log("Sending Mail...");

    // procurement@oakter.com
    helper.sendMail(
      "procurement@oakter.com",
      "Weekly Audit " + yesterday + " [File Ready for download] Ref:" + helper.randomNumber(99999, 999999),
      htmlTemplate("", new Date(), "Weekly Audit", ""),
      attachment
    );

    // END MAIL

    async function getLocationArray(location_key) {
      let stmt_get_a21 = await invtDB.query("SELECT locations FROM `location_allotted` WHERE `loc_all_key` = :location_key", {
        replacements: { location_key: location_key },
        type: invtDB.QueryTypes.SELECT,
      });

      let all_location = [];
      if (stmt_get_a21.length > 0) {
        for (let loc_i = 0; loc_i < stmt_get_a21.length; loc_i++) {
          all_location = stmt_get_a21[loc_i].locations.split(",");
        }
      }
      return all_location;
    }
    console.timeEnd("R28");
    return;
  } catch (err) {
    console.error("Error in fetching/sending data:", err);
  }
}
