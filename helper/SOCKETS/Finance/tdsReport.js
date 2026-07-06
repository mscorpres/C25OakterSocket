const { tallyDB, otherDB, invtDB } = require("../../../config/db/connection");
const xlsx = require("xlsx");
const fs = require("fs");
const moment = require("moment");
const jwt = require("jsonwebtoken");
const { sendMail } = require("../../helper");
const Validator = require("validatorjs");
const helper = require("../../helper");
const {
  error_log,
  verifyToken,
  emit_error_msg,
  emit_notifications,
  download_start_detail,
} = require("../../utils");
const { htmlTemplate } = require("./EmailTemplate/fileDownload");

exports.tdsReport = async (io, socket) => {
  try {
    socket.on("getTdsReport", async (params) => {
      try {
        let req = params;
        let check = await verifyToken(`${socket.handshake.auth.token}`);
        const userID = check.crn_id;

        let validation = new Validator(req, {
          date: "required",
          notificationId: "required",
        });

        if (validation.fails()) {
          await emit_error_msg(
            io,
            socket,
            Object.values(validation.errors.all())[0].join()
          );
        }

        const date = req.date.match(/([0-9]{2})-([0-9]{2})-([0-9]{4})/g);
        const date1 = moment(date[0], "DD-MM-YYYY").format("YYYY-MM-DD");
        const date2 = moment(date[1], "DD-MM-YYYY").format("YYYY-MM-DD");

        let fileName = "tdsReport" + helper.getUniqueNumber() + ".xlsx";

        let insertUserRequest = await otherDB.query(
          "INSERT INTO user_files_req ( module_name , request_txt_label,  req_code, user_id , req_date, msg_type , status , reactNotificationId, other_data, insert_date ) VALUES ('FINANCE','TDS Report', :filename , :uid, :req_data ,'file','pending', :notificationId, :other, :insert_date )",
          {
            replacements: {
              uid: userID,
              req_data: JSON.stringify(req),
              other: JSON.stringify({}),
              insert_date: moment().format("YYYY-MM-DD HH:mm:ss"),
              filename: fileName.replace(".xlsx", ""),
              notificationId: req.notificationId,
            },
            type: otherDB.QueryTypes.INSERT,
          }
        );

        let downloadEvent = await download_start_detail(
          io,
          socket,
          "TDS Report",
          "pending",
          req
        );

        let userDetails = await invtDB.query(
          "SELECT Email_ID , user_name FROM admin_login WHERE CustID = :CustID",
          {
            replacements: {
              CustID: userID,
            },
            type: invtDB.QueryTypes.SELECT,
          }
        );

        const fetchTds = await tallyDB.query(
          "SELECT tds_name , tds_code , tds_percent , tds_gl_code FROM tally_tds",
          {
            type: tallyDB.QueryTypes.SELECT,
          }
        );

        if (fetchTds.length === 0) {
          await emit_error_msg(io, socket, "No tds found");
        }

        let final_data = [];

        for (let i = 0; i < fetchTds.length; i++) {
          let gl_key = fetchTds[i].tds_gl_code;
          let tdsName = fetchTds[i].tds_name;
          let tdsPercent = fetchTds[i].tds_percent;

          let fetchLedgerData = await tallyDB.query(
            "SELECT SUM(`tally_ledger_data`.`debit`) AS debit,`tally_ledger_data`.`ref_date`,SUM(`tally_ledger_data`.`credit`) AS credit,`tally_ledger_data`.`which_module`,`tally_ledger_data`.`module_used`,DATE_FORMAT(`tally_ledger_data`.`insert_date`, '%d-%m-%Y') as insert_date,`ladger_key` , tally_ledger_data.voucher_account FROM `tally_ledger_data`  WHERE (`tally_ledger_data`.`ladger_key`= :ladger_key) AND (DATE_FORMAT(tally_ledger_data.ref_date ,'%Y-%m-%d') BETWEEN :date1 AND :date2 ) AND `ledger_data_status` NOT IN ('D' , 'DE') GROUP BY tally_ledger_data.module_used ORDER BY `tally_ledger_data`.`ref_date` ASC",
            {
              replacements: { date1: date1, date2: date2, ladger_key: gl_key },
              type: tallyDB.QueryTypes.SELECT,
            }
          );

          let fetchDebitNote = await tallyDB.query(
            "SELECT SUM(`tally_ledger_data`.`debit`) AS debit,`tally_ledger_data`.`ref_date`,SUM(`tally_ledger_data`.`credit`) AS credit,'DN' AS `which_module`,`tally_ledger_data`.debit_key AS `module_used`,DATE_FORMAT(`tally_ledger_data`.`insert_date`, '%d-%m-%Y') as insert_date,`ladger_key` , tally_ledger_data.voucher_account FROM `tally_ledger_data`  WHERE (`tally_ledger_data`.`ladger_key`= :ladger_key) AND (DATE_FORMAT(tally_ledger_data.ref_date ,'%Y-%m-%d') BETWEEN :date1 AND :date2 ) AND `ledger_data_status` = 'DE' GROUP BY tally_ledger_data.debit_key ORDER BY `tally_ledger_data`.`ref_date` ASC",
            {
              replacements: { date1: date1, date2: date2, ladger_key: gl_key },
              type: tallyDB.QueryTypes.SELECT,
            }
          );
          let stmt = fetchLedgerData.concat(fetchDebitNote);

          if (stmt.length > 0) {
            for (let i = 0; i < stmt.length; i++) {
              let invoice = "--";
              let invoice_date = "--";
              let ref = "--";
              let gstAssessableValue = 0;
              let tdsAssessableValue = 0;
              let tdsAmount = 0;
              let vendorpanNo = "--";
              let tdsToDeduct = 0;
              let tdsDeducted = 0;

              if (
                stmt[i].which_module == "VBT01" ||
                stmt[i].which_module == "VBT02" ||
                stmt[i].which_module == "VBT03" ||
                stmt[i].which_module == "VBT04" ||
                stmt[i].which_module == "VBT04" ||
                stmt[i].which_module == "VBT05" ||
                stmt[i].which_module == "VBT06"
              ) {
                let ref_stmt = await tallyDB.query(
                  `SELECT tally_vbt.ven_code,ven_name,vbt_invoice_no,vbt_invoice_date , vbp_gst_ass_value , vbt_tds_ass_val , vbt_tds_amount , ${global.oakter_db_invt}.ven_basic_detail.ven_pan_no AS panNo FROM tally_vbt LEFT JOIN ${global.oakter_db_invt}.ven_basic_detail ON tally_vbt.ven_code=${global.oakter_db_invt}.ven_basic_detail.ven_register_id WHERE vbt_key = :vbt_key GROUP BY vbt_key`,
                  {
                    replacements: { vbt_key: stmt[i].module_used },
                    type: tallyDB.QueryTypes.SELECT,
                  }
                );

                if (ref_stmt.length > 0) {
                  ref = `( ${ref_stmt[0].ven_code} ) ${ref_stmt[0].ven_name}`;
                  invoice = ref_stmt[0].vbt_invoice_no;
                  invoice_date = ref_stmt[0].vbt_invoice_date;
                  gstAssessableValue = ref_stmt[0].vbp_gst_ass_value;
                  tdsAssessableValue = ref_stmt[0].vbt_tds_ass_val;
                  tdsAmount = ref_stmt[0].vbt_tds_amount;
                  vendorpanNo = ref_stmt[0].panNo;
                }
                tdsToDeduct =
                  Math.abs(gstAssessableValue) > 0
                    ? (
                        (Math.abs(gstAssessableValue) * tdsPercent) /
                        100
                      ).toFixed(0)
                    : 0;
                tdsDeducted =
                  tdsAmount != 0
                    ? tdsAmount
                    : stmt[i].debit != 0
                    ? stmt[i].debit
                    : stmt[i].credit != 0
                    ? stmt[i].credit
                    : 0;
              }

              if (stmt[i].which_module == "DN") {
                let ref_stmt = await tallyDB.query(
                  `SELECT tally_vbt.ven_code,ven_name,vbt_invoice_no,vbt_invoice_date , vbp_gst_ass_value , vbt_tds_ass_val , vbt_tds_amount , ${global.oakter_db_invt}.ven_basic_detail.ven_pan_no AS panNo FROM tally_vbt LEFT JOIN ${global.oakter_db_invt}.ven_basic_detail ON tally_vbt.ven_code=${global.oakter_db_invt}.ven_basic_detail.ven_register_id WHERE vbt_debit_key = :debitKey GROUP BY vbt_debit_key`,
                  {
                    replacements: { debitKey: stmt[i].module_used },
                    type: tallyDB.QueryTypes.SELECT,
                  }
                );

                if (ref_stmt.length > 0) {
                  ref = `( ${ref_stmt[0].ven_code} ) ${ref_stmt[0].ven_name}`;
                  invoice = ref_stmt[0].vbt_invoice_no;
                  invoice_date = ref_stmt[0].vbt_invoice_date;
                  gstAssessableValue = ref_stmt[0].vbp_gst_ass_value
                    ? "-" + ref_stmt[0].vbp_gst_ass_value
                    : 0;
                  tdsAssessableValue = ref_stmt[0].vbt_tds_ass_val
                    ? "-" + ref_stmt[0].vbt_tds_ass_val
                    : 0;
                  tdsAmount = ref_stmt[0].vbt_tds_amount
                    ? "-" + ref_stmt[0].vbt_tds_amount
                    : 0;
                  vendorpanNo = ref_stmt[0].panNo;
                }
                tdsToDeduct =
                  Math.abs(gstAssessableValue) > 0
                    ? "-" +
                      (
                        (Math.abs(gstAssessableValue) * tdsPercent) /
                        100
                      ).toFixed(0)
                    : 0;
                tdsDeducted =
                  tdsAmount != 0
                    ? tdsAmount
                    : stmt[i].debit != 0
                    ? stmt[i].debit
                    : stmt[i].credit != 0
                    ? stmt[i].credit
                    : 0;
              }

              if (
                stmt[i].which_module == "BP" ||
                stmt[i].which_module == "BPM" ||
                stmt[i].which_module == "BR" ||
                stmt[i].which_module == "BRM" ||
                stmt[i].which_module == "JV" ||
                stmt[i].which_module == "DE" ||
                stmt[i].which_module == "CNT" ||
                stmt[i].which_module == "INV01"
              ) {
                let key =
                  stmt[i].voucher_account == "--"
                    ? stmt[i].ladger_key
                    : stmt[i].voucher_account;

                let ref_stmt = await tallyDB.query(
                  "SELECT `ladger_name` FROM `tally_ledger` WHERE `ledger_key` = :key",
                  {
                    replacements: { key: key },
                    type: tallyDB.QueryTypes.SELECT,
                  }
                );
                if (ref_stmt.length > 0) {
                  if (gl_key != ref_stmt[0].ladger_name) {
                    ref = ref_stmt[0].ladger_name;
                  }
                }
              }

              final_data.push({
                Section: tdsName,
                "Voucher No": stmt[i].module_used,
                "Effective Date": moment(stmt[i].ref_date, "YYYY-MM-DD").format(
                  "DD-MM-YYYY"
                ),
                "Vendor Name": ref.startsWith("TDS")
                  ? stmt[i].which_module
                  : ref,
                "Pan no": vendorpanNo,
                "Invoice No": invoice,
                "Invoice Date": invoice_date,
                "GST assessable value": (+gstAssessableValue).toFixed(2),
                "TDS assessable value": (+tdsAssessableValue).toFixed(2),
                "TDS rate": tdsPercent + "%",
                "TDS to be deducted on GST assessable value": tdsToDeduct,
                "TDS deducted": (+tdsDeducted).toFixed(2),
                Difference: +tdsToDeduct - +tdsDeducted,
              });
            }
          }
        }

        const worksheet = xlsx.utils.json_to_sheet(final_data);
        const workbook = xlsx.utils.book_new();

        xlsx.utils.book_append_sheet(workbook, worksheet, "TDS Report");
        xlsx.write(workbook, { bookType: "xlsx", type: "buffer" });
        xlsx.writeFile(workbook, "./files/tdsReport/" + fileName);

        let attachment = [
          {
            filename: fileName,
            content: fs.readFileSync("./files/tdsReport/" + fileName),
          },
        ];

        let updateUserRequest = await otherDB.query(
          "UPDATE user_files_req SET status = 'complete' , other_data = :otherData , update_date = :updateDate WHERE user_id = :uid AND req_date = :req_data AND req_code = :filename",
          {
            replacements: {
              uid: userID,
              req_data: JSON.stringify(req),
              otherData: JSON.stringify({
                fileName: fileName,
                fileUrl: "./files/tdsReport/" + fileName,
              }),
              filename: fileName.replace(".xlsx", ""),
              updateDate: moment().format("YYYY-MM-DD HH:mm:ss"),
            },
            type: otherDB.QueryTypes.UPDATE,
          }
        );

        emit_notifications(io, socket, params.notificationId);

        const sendEmail = await sendMail(
          userDetails[0].Email_ID,
          "",
          "TDS Report",
          htmlTemplate(userDetails[0].user_name, new Date(), "TDS"),
          attachment
        );
      } catch (error) {
        error_log({ stack: error.stack });
      }
    });
  } catch (error) {
    error_log({ stack: error.stack });
  }
};
