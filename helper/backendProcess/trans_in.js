const moment = require("moment");
const xlsx = require("xlsx");
const { otherDB, invtDB } = require("../../config/db/connection");
const jwt = require("jsonwebtoken");

const helper = require("../../helper/helper");

const Validator = require("validatorjs");
const fs = require("fs");

exports.tran_in = async (date, uid, emit_notifications, notificationId, socket, io, branch, wise) => {
  try {
    const validation = new Validator(
      { searchTerm: date },
      {
        searchTerm: "required",
      }
    );

    token_res = await verifyToken(`${socket.handshake.auth.token}`);
    let user_id = token_res.crn_id;
    if (validation.fails()) {
      return { code: 500, msg: "Please Select Date" };
    }
    let query = "";
    let replacements = {};
    if (wise === "M") {
      let date1, date2;
      if (validation.passes()) {
        const data = date;
        var pattern = /([0-9]{2})-([0-9]{2})-([0-9]{4}) - ([0-9]{2})-([0-9]{2})-([0-9]{4})/gi;
        var pattern1 = /([0-9]{2})-([0-9]{2})-([0-9]{4})-([0-9]{2})-([0-9]{2})-([0-9]{4})/gi;
        if (pattern.test(data) || pattern1.test(data)) {
          const date = data.match(/([0-9]{2})-([0-9]{2})-([0-9]{4})/gi);

          date1 = moment(date[0], "DD-MM-YYYY").format("YYYY-MM-DD");
          date2 = moment(date[1], "DD-MM-YYYY").format("YYYY-MM-DD");
        }
        query =
          "SELECT *, `rm_location`.`insert_date` FROM `rm_location` LEFT JOIN `components` ON rm_location.components_id = components.component_key LEFT JOIN units ON components.c_uom = units.units_id LEFT JOIN location_main ON rm_location.loc_in = location_main.location_key LEFT JOIN admin_login ON rm_location.insert_by = admin_login.CustID WHERE `components`.`c_type` = 'R' AND DATE_FORMAT(rm_location.insert_date,'%Y-%m-%d') BETWEEN :date1 AND :date2 AND (`rm_location`.trans_type = 'INWARD' OR ( rm_location.trans_type = 'TRANSFER' AND rm_location.trans_mode = 'return' AND rm_location.vendor_type = 'j01' AND rm_location.in_jw_transaction_id != '--' )) AND `rm_location`.in_module != 'PART-CONV' AND `rm_location`.`company_branch` = :branch ORDER BY rm_location.insert_date DESC";
        replacements = {
          replacements: { date1: date1, date2: date2, branch: branch },
          type: invtDB.QueryTypes.SELECT,
        };
        io.to(user_id).emit("download_start_detail", {
          title: "Transaction IN",
          details: date,
          notificationId: notificationId,
          status: "pending",
          detailStatus: true,
          total: false,
          type: "file",
        });
      }
    } else if (wise === "P") {
      query =
        "SELECT *, `rm_location`.`insert_date` FROM `rm_location` LEFT JOIN `components` ON rm_location.components_id = components.component_key LEFT JOIN units ON components.c_uom = units.units_id LEFT JOIN location_main ON rm_location.loc_in = location_main.location_key LEFT JOIN admin_login ON rm_location.insert_by = admin_login.CustID WHERE `components`.`c_type` = 'R' AND `components`.`c_is_enabled` = 'Y' AND `rm_location`.`in_po_transaction_id` = :po AND (`rm_location`.trans_type = 'INWARD' OR ( rm_location.trans_type = 'TRANSFER' AND rm_location.trans_mode = 'return' AND rm_location.vendor_type = 'j01' AND rm_location.in_jw_transaction_id != '--' )) AND `rm_location`.in_module != 'PART-CONV' AND `rm_location`.`company_branch` = :branch ORDER BY rm_location.insert_date DESC";
      replacements = {
        replacements: { po: date, branch: branch },
        type: invtDB.QueryTypes.SELECT,
      };
      io.to(user_id).emit("download_start_detail", {
        title: "Transaction IN",
        details: date,
        notificationId: notificationId,
        status: "pending",
        detailStatus: true,
        total: false,
        type: "file",
      });
    }
    let result = await invtDB.query(query, replacements);
    if (result.length > 0) {
      let finalResult = [];
      result.forEach(async (element) => {
        let vendor = "";
        if (element.vendor_type == "v01") {
          vendor = "Vendor";
        } else if (element.vendor_type == "j01") {
          vendor = "JWI";
        } else if (element.vendor_type == "s01") {
          vendor = "SortIn";
        } else if (element.vendor_type == "r01") {
          vendor = "RejIn";
        } else if (element.vendor_type == "p01") {
          vendor = "ProdReturn";
        } else {
          vendor = "N/A";
        }

        let vendorName;
        let stmt_vendorName;
        stmt_vendorName = await invtDB.query("SELECT `po_vendor_name` FROM `po_purchase_req` WHERE `po_transaction` = :po", {
          replacements: { po: element.in_po_transaction_id },
          type: invtDB.QueryTypes.SELECT,
        });
        if (stmt_vendorName.length > 0) {
          vendorName = stmt_vendorName[0].po_vendor_name;
        } else {
          stmt_vendorName = await invtDB.query("SELECT `ven_name` FROM `ven_basic_detail` WHERE `ven_register_id` = :vendor", {
            replacements: { vendor: element.in_vendor_name },
            type: invtDB.QueryTypes.SELECT,
          });
          if (stmt_vendorName.length > 0) {
            vendorName = stmt_vendorName[0].ven_name;
          } else {
            vendorName = "N/A";
          }
        }

        if (element.in_po_invoice_id !== "--") {
          invoice_number = element.in_po_invoice_id;
          po_number = element.in_po_transaction_id;
        }
        else if (element.wo_transaction_id !== "--") {
          invoice_number = element.in_wo_invoice_id;
          po_number = element.wo_transaction_id;
        }
        else {
          if (element.in_invoice_id !== "--") {
            invoice_number = element.in_invoice_id;
            po_number = element.in_jw_transaction_id;
          } else {
            invoice_number = "N/A";
            po_number = "N/A";
          }
        }

        if (element.currency_type == "--" || element.currency_type == "" || element.currency_type == "364907247") {
          currency = "INR";
        } else {
          currency = "USD";
        }

        let inQty = parseInt(element.qty) + parseInt(element.other_qty);

        let hsncode = "";
        if (element.in_hsn_code !== "" && element.in_hsn_code !== "--") {
          hsncode = element.in_hsn_code;
        } else {
          hsncode = "--";
        }

        finalResult.push({
          DATE: moment(element.insert_date, "YYYY-MM-DD HH:mm:ss").format("DD-MM-YYYY HH:mm:ss"),
          COMPONENT: element.c_name,
          PART: element.c_part_no, CAT_PART_CODE: element.c_new_part_no,
          HSNCODE: hsncode,
          VENDOR_CODE: element.in_vendor_name,
          LOCATION: element.loc_name,
          RATE: element.in_po_rate,
          CURRENCY: currency,
          INQTY: inQty,
          UNIT: element.units_name,
          VENDOR: vendorName,
          PONUMBER: po_number,
          INVOIVENUMBER: invoice_number,
          TRANSACTION: element.in_transaction_id == "--"
                      ? element.transfer_transaction_id
                      : element.in_transaction_id,
          ADDED_BY: element.user_name,
          VENDOR_TYPE: vendor,
          EWAY_BILL_DOC_ID: element.min_ewaybill,
          COMMENT: element.any_remark == null ? element.rejection_any_remark : element.any_remark,
		  MST_MFGCODE: element.manufacturing_code,
          MNL_MFGCODE: element.manual_mfg_code,
          INWARD_TYPE: element.inward_type,

        });

        if (finalResult.length == result.length) {
          const worksheet = xlsx.utils.json_to_sheet(finalResult);
          const workbook = xlsx.utils.book_new();

          xlsx.utils.book_append_sheet(workbook, worksheet, "Transaction Inward");

          //buffer we use to handle the big file
          xlsx.write(workbook, { bookType: "csv", type: "buffer" });
          //   xlsx.write(workbook, { bookType: "xlsx", type: "binary" });

          let randKey = Math.floor(Math.random() * (999 - 100 + 1)) + 100;

          let fileGenarateName = "./files/excel/TRANIN" + randKey + ".xlsx"

          xlsx.writeFile(workbook, fileGenarateName);

          let stmt = await otherDB.query("UPDATE `user_files_req` SET `status` = 'complete', `other_data` = :other WHERE `user_id`= :uid AND `req_code` = 'TRANIN'", {
            replacements: {
              uid: uid,
              other: JSON.stringify({
                fileName: `TRANIN${randKey}.xlsx`,
                fileUrl: fileGenarateName,
                fileBuffer: Buffer.from(fileGenarateName, "base64"),
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
              filename: "TRAN IN " + date,
              content: fs.readFileSync(fileGenarateName),
            },
          ];
          await helper.sendMail(userEmail, "", "TRANS IN REPORT [File Ready for download] Ref:" + helper.randomNumber(99999,999999),"", attachment);
          //END MAIL
			
          return;
        }
      });
    } else {
      socket.emit("toastr_error", {
        msg: "No Data Found",
      });
      return;
    }
  } catch (error) {

    let stmt = await otherDB.query("UPDATE `user_files_req` SET `status` = 'failed' WHERE `reactNotificationId`= :uid AND `req_code` = 'TRANIN' AND req_date = :req_date", {
      replacements: {
        uid: notificationId,
        req_date: date,
      },
      type: otherDB.QueryTypes.UPDATE,
    });
    emit_notifications(notificationId);
    socket.emit("toastr_error", {
      msg: "SQL ERROR",
    });
    return;
  }
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
      if (err) {
        reject(err);
      } else {
        resolve(decoded);
      }
    });
  });
}
