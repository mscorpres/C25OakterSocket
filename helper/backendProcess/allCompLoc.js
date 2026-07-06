const multer = require("multer");
const path = require("path");
const moment = require("moment");
const XLSX = require("xlsx");
const fs = require("fs");
require("dotenv").config();

const { otherDB, invtDB } = require("./../../config/db/connection");
const helper = require("../../helper/helper");
const { error_log } = require("../../helper/utils");
const { htmlTemplate } = require("./EmailTemplate/fileDownload");
const { encode, decode } = require("html-entities");

const Validator = require("validatorjs");

exports.allCompLocation = async (data, uid, emit_notifications, fileName, notificationId, socket, io, location) => {
  const validation = new Validator(
    { date: data },
    {
      date: "required",
    }
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
    if (totalRows <= 0) {
      XLSX.utils.sheet_add_aoa(sheet, [["DATE RANGE", "PART_CODE", "CAT_PART_CODE", "COMPONENT NAME", "OPENING", "INWARD", "OUTWARD", "CLOSING", "LASTIN", "LASTOUT", "AVG_RATE"]], { origin: 0 });
      comp_stmt = await invtDB.query("SELECT `component_key`, `c_part_no`, `c_new_part_no`, `c_name`, `c_min_stock` FROM `components` WHERE `c_type` = 'R'", {
        type: invtDB.QueryTypes.SELECT,
      });
    } else {
      comp_stmt = await invtDB.query(`SELECT component_key, c_part_no, c_new_part_no, c_name, c_min_stock FROM components WHERE c_type = 'R' LIMIT ${totalRows} , 100`, {
        type: invtDB.QueryTypes.SELECT,
      });
    }

    const date = data.match(/([0-9]{2})-([0-9]{2})-([0-9]{4})/g);

    let fromdate = moment(date[0], "DD-MM-YYYY").format("YYYY-MM-DD");
    let todate = moment(date[1], "DD-MM-YYYY").format("YYYY-MM-DD");

    let total_comp = await invtDB.query("SELECT COUNT(*) AS `records` FROM `components` WHERE `c_type` = 'R'", { type: invtDB.QueryTypes.SELECT });
    const records = total_comp[0].records;
    if (comp_stmt.length > 0) {
      for (let i = 0; i < comp_stmt.length; i++) {
        let INWARD,
          OPENING,
          OUTWARD,
          CLOSING,
          LASTIN,
          LASTOUT = 0;
        let countStock = await invtDB.query(
          "SELECT (SELECT COALESCE(SUM(qty+other_qty), 0) AS inward FROM rm_location WHERE components_id = :component AND trans_type IN ('INWARD' , 'ISSUE' , 'JOBWORK' , 'REJECTION' , 'TRANSFER') AND loc_in IN (:location) AND DATE_FORMAT(insert_date,'%Y-%m-%d') BETWEEN :date1 AND :date2) AS inward, (SELECT COALESCE(SUM(qty+other_qty), 0) AS outward FROM rm_location WHERE components_id = :component AND trans_type IN ('CONSUMPTION' , 'ISSUE' , 'JOBWORK' , 'REJECTION' , 'TRANSFER') AND loc_out IN (:location) AND DATE_FORMAT(insert_date,'%Y-%m-%d') BETWEEN :date1 AND :date2) outward ,(SELECT COALESCE(SUM(qty+other_qty), 0) AS inbefor FROM rm_location WHERE components_id = :component AND trans_type IN ('INWARD' , 'ISSUE' , 'JOBWORK' , 'REJECTION' , 'TRANSFER') AND loc_in IN (:location) AND DATE_FORMAT(insert_date,'%Y-%m-%d') < :date1 ) AS inbefor ,  (SELECT COALESCE(SUM(qty+other_qty), 0) AS outward FROM rm_location WHERE components_id = :component AND trans_type IN ('CONSUMPTION' , 'ISSUE' , 'JOBWORK' , 'REJECTION' , 'TRANSFER') AND loc_out IN (:location) AND DATE_FORMAT(insert_date,'%Y-%m-%d') < :date1) AS outbefore FROM DUAL",
          {
            replacements: {
              component: comp_stmt[i].component_key,
              date1: fromdate,
              date2: todate,
              location: [location],
            },
            type: invtDB.QueryTypes.SELECT,
          }
        );

        if (countStock.length > 0) {
          INWARD = countStock[0].inward;
          OUTWARD = countStock[0].outward;
          OPENING = countStock[0].inbefor - countStock[0].outbefore;
        } else {
          (INWARD = 0), (OUTWARD = 0), (OPENING = 0);
        }

        let last_in = await invtDB.query(
          "SELECT ID, insert_date FROM rm_location WHERE ID = (SELECT MAX(ID) FROM rm_location WHERE components_id = :compKey AND (trans_type = 'INWARD') AND vendor_type = 'v01') AND components_id = :compKey AND (trans_type = 'INWARD') AND vendor_type = 'v01'",
          {
            replacements: {
              compKey: comp_stmt[i].component_key,
            },
            type: invtDB.QueryTypes.SELECT,
          }
        );
        if (last_in.length > 0) {
          LASTIN = moment(last_in[0].insert_date, "YYYY-MM-DD").format("DD-MM-YYYY");
        }

        let last_out = await invtDB.query(
          "SELECT ID, insert_date FROM rm_location WHERE ID = (SELECT MAX(ID) FROM rm_location WHERE components_id = :compKey AND (trans_type = 'ISSUE' OR trans_type = 'TRANSFER')) AND components_id = :compKey AND (trans_type = 'ISSUE' OR trans_type = 'TRANSFER')",
          {
            replacements: {
              compKey: comp_stmt[i].component_key,
            },
            type: invtDB.QueryTypes.SELECT,
          }
        );
        if (last_out.length > 0) {
          LASTOUT = moment(last_out[0].insert_date, "YYYY-MM-DD").format("DD-MM-YYYY");
        }

        CLOSING = Number(OPENING) + Number(INWARD) - Number(OUTWARD);

        const AVG_RATE = await require("../utils").getWeightedPurchaseRate(comp_stmt[i].component_key, moment(new Date()).format("YYYY-MM-DD HH:mm:ss"));

        let tempArr = [date, comp_stmt[i].c_part_no, comp_stmt[i].c_new_part_no, decode(comp_stmt[i].c_name), OPENING, INWARD, OUTWARD, CLOSING, LASTIN, LASTOUT, AVG_RATE];

        XLSX.utils.sheet_add_aoa(sheet, [tempArr], { origin: -1 });

        XLSX.writeFile(workbook, "./files/excel/" + fileName);

        totalRows++;
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

        let stmt = await otherDB.query("UPDATE `user_files_req` SET `other_data` = :other WHERE `user_id`= :uid AND `req_code` = 'ALLCOMPLOC'", {
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

        if (totalRows == records) {
          let stmt = await otherDB.query("UPDATE `user_files_req` SET `status` = 'complete', `other_data` = :other WHERE `user_id`= :uid AND `req_code` = 'ALLCOMPLOC'", {
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
          emit_notifications(io, socket, notificationId);
        }
      }
      // SEND USER MAILDONE
      let user = await invtDB.query("SELECT `Email_ID`,`user_name` from `admin_login` WHERE `CustID`= :CustID", {
        replacements: {
          CustID: uid,
        },
        type: invtDB.QueryTypes.SELECT,
      });
      let userEmail = user[0].Email_ID;
      let attachment = [
        {
          filename: "ALL COMP REPORT",
          content: fs.readFileSync("./files/excel/" + fileName),
        },
      ];

      const stmt_loc_name = await invtDB.query("SELECT loc_name FROM location_main WHERE 	location_key = :location_key", {
        replacements: {
          location_key: location,
        },
        type: invtDB.QueryTypes.SELECT,
      });

      helper.sendMail(
        userEmail,
        "",
        "R6 Location Wise Report  " + stmt_loc_name[0].loc_name + " [File Ready for download] Ref:" + helper.randomNumber(99999, 999999),
        htmlTemplate(user[0].user_name, new Date(), "R6", `${process.env.SOCKET_API_URL}/${fileName}`),
        attachment
      );
      //END MAIL
    }
  } catch (err) {
    error_log({ stack: err.stack });
    let stmt = await otherDB.query("UPDATE `user_files_req` SET `status` = 'failed' WHERE `reactNotificationId`= :uid AND `req_code` = 'ALLCOMP'", {
      replacements: {
        uid: notificationId,
      },
      type: otherDB.QueryTypes.UPDATE,
    });
    emit_notifications(io, socket, notificationId);
  }
};
