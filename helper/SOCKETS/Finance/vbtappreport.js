const XLSX = require("xlsx");
let fs = require("fs");
const { otherDB } = require("../../../config/db/connection");
const jwt = require("jsonwebtoken");
const moment = require("moment");

exports.vbtappreport = async (io, socket) => {
  try {
    socket.on("vbtAppReport", async (req) => {
      let check = await verifyToken(`${socket.handshake.auth.token}`);
      let user_id = check.crn_id;

      let fileName;
      // CHECK PENDING REQUEST
      let check_data = await otherDB.query("SELECT * FROM `user_files_req` WHERE `user_id`= :uid AND `req_code` = 'VBTAPPREP' AND `req_date` = :date AND `status` = 'pending'", {
        replacements: {
          uid: user_id,
          date: data.otherdata.date,
        },
        type: otherDB.QueryTypes.SELECT,
      });

      if (check_data.length > 0) {
        fileName = JSON.parse(check_data[0].other_data).fileName;
      } else {
        fileName = "VBTAPPREP-" + user_id + ".csv";
        let stmt = await otherDB.query("INSERT INTO `user_files_req` (`request_txt_label`, `req_code`, `user_id`, `req_date`, `msg_type` , `status` , `other_data`, `insert_date`,`reactNotificationId` ) VALUES ('VBT APP REPORT', 'VBTAPPREP', :uid, :req_date, 'file', 'pending', :other , :insert_date,:notificationId) ", {
          replacements: {
            uid: user_id,
            req_date: "--",
            other: JSON.stringify({ fileName: fileName }),
            insert_date: moment().format("YYYY-MM-DD HH:mm:ss"),
            notificationId: data.notificationId ?? 0,
          },
          type: otherDB.QueryTypes.INSERT,
        });
      }

      // MAIN FUNCTION
      let data = [];

      // GET VENDOR Bill DATA
      let stmt = await tallyDB.query("SELECT `ven_code`, `vbt_key` , `vbt_invoice_no` ,`vbt_invoice_date` , min_id FROM `tally_vbt` WHERE `vbt_ap_status` = 'O' GROUP BY `vbt_key`", {
        replacements: { vendor: req.body.vendor },
        type: tallyDB.QueryTypes.SELECT,
      });

      if (stmt.length > 0) {
        for (let i = 0; i < stmt.length; i++) {
          // GET MIN & PO & COST & PROJECT CODE

          let stmt_other = await invtDB.query(
            "SELECT in_transaction_id , in_po_transaction_id , po_project_name , cost_center_name FROM rm_location LEFT JOIN po_purchase_req ON po_purchase_req.po_transaction = rm_location.in_po_transaction_id LEFT JOIN cost_center ON cost_center.cost_center_key =po_purchase_req.po_cost_center  WHERE in_transaction_id = :min_id GROUP BY rm_location.in_transaction_id ",
            {
              replacements: { min_id: stmt[i].min_id },
              type: invtDB.QueryTypes.SELECT,
            }
          );

          
          // GET TOTAL VENDOR AMMOUNT
          let stmt_total_amm = await tallyDB.query("SELECT SUM(`vbt_ven_ammount`) as ven_ammount  FROM `tally_vbt` WHERE `vbt_key` = :vbt_key ", {
            replacements: { vbt_key: stmt[i].vbt_key },
            type: tallyDB.QueryTypes.SELECT,
          });

          let stmt_pend = await tallyDB.query("SELECT SUM(`ap_os_amm`) as total_ap_os_amm FROM `tally_ap` WHERE `ap_ref_no` = :v_key ", {
            replacements: { v_key: stmt[i].vbt_key },
            type: tallyDB.QueryTypes.SELECT,
          });

          os_amm = stmt_total_amm[0].ven_ammount;

          if (stmt_pend.length > 0) {
            // PENDIG AMMOUNT
            os_amm = Number(stmt_total_amm[0].ven_ammount) - Number(stmt_pend[0].total_ap_os_amm);
          }

          data.push({
            "VBT CODE": stmt[i].vbt_key,
            "VEN CODE": stmt[i].ven_code,
            "INV. NO.": stmt[i].vbt_invoice_no,
            "INV DATE": stmt[i].vbt_invoice_date,
            "OS AMOUNT": Number(os_amm).toFixed(0),
            "CLEAR AMOUNT": Number(stmt_total_amm[0].ven_ammount).toFixed(0) - Number(os_amm).toFixed(0),
            "BILL AMOUNT": Number(stmt_total_amm[0].ven_ammount).toFixed(0),
            "PO NUMBER": stmt_other[0].in_po_transaction_id,
            "PROJECT ID": stmt_other[0].po_project_name ?? "--",
            "COST CENTER": stmt_other[0].cost_center_name ?? "--",
          });
        } // END FOR

        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "VBT APP. SETUP");
        XLSX.write(workbook, { bookType: "csv", type: "buffer" });

        //   let randKey = Math.floor(Math.random() * (999 - 100 + 1)) + 100;

        XLSX.writeFile(workbook, "./files/excel/" + fileName);

        let stmt_update = await otherDB.query("UPDATE `user_files_req` SET `status` = 'complete', `other_data` = :other WHERE `user_id`= :uid AND `req_code` = 'VBTAPPREP'", {
          replacements: {
            uid: user_id,
            other: JSON.stringify({
              fileName: fileName,
              fileUrl: "./files/excel/" + fileName,
              fileBuffer: Buffer.from("./files/excel/" + fileName, "base64"),
            }),
          },
          type: otherDB.QueryTypes.UPDATE,
        });
      } else {
        let stmt_update = await otherDB.query("UPDATE `user_files_req` SET `status` = 'complete', `other_data` = :other WHERE `user_id`= :uid AND `req_code` = 'VBTAPPREP'", {
          replacements: {
            uid: user_id,
            other: JSON.stringify({
              fileName: fileName,
              fileUrl: "./files/excel/" + fileName,
              fileBuffer: Buffer.from("./files/excel/" + fileName, "base64"),
            }),
          },
          type: otherDB.QueryTypes.UPDATE,
        });
      }
      // END MAIN FUNCTION

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
    });
  } catch (err) {
    console.log(err);
  }
};
