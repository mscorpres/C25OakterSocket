const path = require("path");
const moment = require("moment");
const XLSX = require("xlsx");
const jwt = require("jsonwebtoken");
const Validator = require("validatorjs");
const fs = require("fs");

const helper = require("../../../helper/helper");
const { otherDB, invtDB } = require("../../../config/db/connection");

const { htmlTemplate } = require("../../backendProcess/EmailTemplate/fileDownload");

const { verifyToken, error_log, emit_notifications, emit_error_msg } = require("../../../helper/utils");

exports.r37 = async (io, socket) => {
  try {
    socket.on("r37", async (data) => {
      const validator = new Validator(data, {
        date: "required",
      });

      if (validator.fails()) {
        emit_error_msg(io, socket, "Please select date");
        return;
      }

      //
      const date = data.date.match(/([0-9]{2})-([0-9]{2})-([0-9]{4})/g);
      const fromdate = moment(date[0], "DD-MM-YYYY").format("YYYY-MM-DD");
      const todate = moment(date[1], "DD-MM-YYYY").format("YYYY-MM-DD");

      if (fromdate == "Invalid date" || todate == "Invalid date") {
        return emit_error_msg(io, socket, "Please select valid date");
      }

      const token_res = await verifyToken(`${socket.handshake.auth.token}`);
      const user_id = token_res.crn_id;

      let fileName = "";
      const check_data = await otherDB.query("SELECT * FROM user_files_req WHERE user_id= :uid AND req_code = 'JW_INVENTORY' AND req_date = :date AND status = 'pending'", {
        replacements: {
          uid: user_id,
          date: data.date,
        },
        type: otherDB.QueryTypes.SELECT,
      });

      if (check_data.length > 0) {
        fileName = JSON.parse(check_data[0].other_data).fileName;
      }
      fileName = "JW_INVENTORY-" + user_id + Math.floor(Math.random() * 9999) + ".csv";

      // CREATE NEW REQUEST
      const stmt_create_req = await otherDB.query(
        "INSERT INTO user_files_req (request_txt_label, req_code, user_id, req_date, msg_type , status , other_data, insert_date,reactNotificationId ) VALUES ('JW Inventory', 'JW_INVENTORY', :uid, :req_date,'file','pending', :other , :insert_date,:notificationId) ",
        {
          replacements: {
            uid: user_id,
            req_date: data.date,
            other: JSON.stringify({ fileName: fileName }),
            insert_date: moment().format("YYYY-MM-DD HH:mm:ss"),
            notificationId: data.notificationId ?? 0,
          },
          type: otherDB.QueryTypes.INSERT,
        }
      );

      io.to(user_id).emit("download_start_detail", {
        title: "JW Inventory",
        details: data.date,
        notificationId: data.notificationId ?? 0,
        status: "pending",
        detailStatus: true,
        type: "file",
      });

      // END REQU CREATE

      // START MAIN PROCESS

      const vendors = ["VEN0495", "VEN0168", "VEN0425","VEN0111"];
      // const vendors = ["VEN0495"];

      const vendorList = await invtDB.query("SELECT ven_register_id , ven_name FROM ven_basic_detail WHERE ven_register_id IN (:vendors)", {
        replacements: { vendors: vendors },
        type: invtDB.QueryTypes.SELECT,
      });

      const compAvgRate = {};

      const finalData = [];
      for (let v = 0; v < vendorList.length; v++) {
        let mainStmt = await invtDB.query(
          // SELECT * FROM jw_purchase_req WHERE DATE_FORMAT(jw_purchase_req.jw_po_full_date,'%Y-%m-%d') BETWEEN :date1 AND :date2 AND jw_purchase_req.jw_po_status = 'A' AND jw_po_vendor_reg_id = :vendor ORDER BY jw_purchase_req.jw_po_full_date DESC`,
          `SELECT jw_purchase_req.*, products.p_name , products.p_sku  FROM jw_purchase_req LEFT JOIN products ON jw_purchase_req.jw_po_sku = products.product_key WHERE jw_po_vendor_reg_id = :vendor AND jw_purchase_req.jw_po_status = 'A'`,
          {
            replacements: { date1: fromdate, date2: todate, vendor: vendorList[v].ven_register_id },
            type: invtDB.QueryTypes.SELECT,
          }
        );

        if (mainStmt.length == 0) {
          continue;
        }

        for (let jwIdIndex = 0; jwIdIndex < mainStmt.length; jwIdIndex++) {
          // GET aLL COMPONENENTS
          // SELECT jw_bom_recipe.*, COALESCE(SUM(jw_bom_recipe.jw_bom_qty),0) as bom_qty, components.c_name, components.c_part_no, units.units_name FROM jw_bom_recipe LEFT JOIN components ON jw_bom_recipe.jw_bom_part = components.component_key LEFT JOIN units ON components.c_uom = units.units_id WHERE jw_bom_recipe.jw_bom_po_trans IN (:jw_id)  GROUP BY jw_bom_recipe.jw_bom_part ORDER BY components.c_part_no ASC
          let stmt_comp = await invtDB.query(
            "SELECT jw_bom_recipe.*, COALESCE(jw_bom_recipe.jw_bom_qty,0) as bom_qty, components.c_name, components.c_part_no, units.units_name FROM jw_bom_recipe LEFT JOIN components ON jw_bom_recipe.jw_bom_part = components.component_key LEFT JOIN units ON components.c_uom = units.units_id WHERE jw_bom_recipe.jw_bom_po_trans = :jw_id  GROUP BY jw_bom_recipe.jw_bom_part ORDER BY components.c_part_no ASC",
            {
              replacements: { jw_id: mainStmt[jwIdIndex].jw_jw_transaction },
              type: invtDB.QueryTypes.SELECT,
            }
          );

          // START LOOP
          // for (let i = 0; i < stmt_comp.length; i++) {
          const jwData = stmt_comp.map(async (stmt_comp_item) => {
            const stmt_total_iss = await invtDB.query(
              "SELECT COALESCE(SUM(`qty`+`other_qty`), 0) AS `total_issued_rm` FROM `rm_location` WHERE `jw_transaction_id` = :transaction_id AND `components_id` = :component_id AND trans_type = 'JOBWORK' AND DATE_FORMAT(`insert_date`,'%Y-%m-%d') BETWEEN :date1 AND :date2",
              {
                replacements: { component_id: stmt_comp_item.jw_bom_part, transaction_id: mainStmt[jwIdIndex].jw_jw_transaction, date1: fromdate, date2: todate },
                type: invtDB.QueryTypes.SELECT,
              }
            );

            let total_issue_qty = 0;
            if (stmt_total_iss.length > 0) {
              total_issue_qty = stmt_total_iss[0].total_issued_rm;
            }

            const stmt_total_ret = await invtDB.query(
              "SELECT COALESCE(SUM(`qty`+`other_qty`),0 ) AS `total_returned_rm` FROM `rm_location` WHERE `trans_type` = 'INWARD' AND `in_jw_transaction_id` = :transaction_id AND `components_id` = :component_id AND trans_mode = 'return' AND DATE_FORMAT(`insert_date`,'%Y-%m-%d') BETWEEN :date1 AND :date2",
              {
                replacements: { component_id: stmt_comp_item.jw_bom_part, transaction_id: mainStmt[jwIdIndex].jw_jw_transaction, date1: fromdate, date2: todate },
                type: invtDB.QueryTypes.SELECT,
              }
            );
            let total_rm_return_qty = 0;
            if (stmt_total_ret.length > 0) {
              total_rm_return_qty = stmt_total_ret[0].total_returned_rm;
            }

            const stmt_total_consump = await invtDB.query(
              "SELECT COALESCE(SUM(`qty`+`other_qty`),0 ) AS `total_consumption` FROM `rm_location` WHERE `jw_transaction_id` = :transaction_id AND `components_id` = :component_id AND `trans_type` = 'SFG-CONSUMPTION' AND DATE_FORMAT(`insert_date`,'%Y-%m-%d') BETWEEN :date1 AND :date2",
              {
                replacements: { component_id: stmt_comp_item.jw_bom_part, transaction_id: mainStmt[jwIdIndex].jw_jw_transaction, date1: fromdate, date2: todate },
                type: invtDB.QueryTypes.SELECT,
              }
            );
            let total_consumption_value = 0;
            if (stmt_total_consump.length > 0) {
              total_consumption_value = stmt_total_consump[0].total_consumption;
            }

            // //////////////////
            // SELECT COALESCE(SUM(jw_po_order_qty),0) as jw_po_order_qty FROM `jw_purchase_req` WHERE `jw_po_sku` = :skucode AND `jw_jw_transaction` = :jw_id
            // const stmt_jwpo_req2 = await invtDB.query("SELECT COALESCE(SUM(jw_po_order_qty),0) as jw_po_order_qty FROM `jw_purchase_req` WHERE  `jw_jw_transaction` IN (:jw_id)", {
            //   replacements: { jw_id: mainStmt.map((item) => item.jw_jw_transaction) },
            //   type: invtDB.QueryTypes.SELECT,
            // });

            // let jw_order_qty = stmt_jwpo_req2[0].jw_po_order_qty;
            // const sortAccess = helper.number(jw_order_qty * stmt_comp_item.jw_bom_qty - total_issue_qty).toFixed(2);
            // //////////////////

            // //////////////////Closing

            // Query to get total issued quantity ever (without date filter) for this JW transaction and component, to calculate cumulative pending_qty
            const stmt_total_iss_ever = await invtDB.query(
              "SELECT COALESCE(SUM(`qty`+`other_qty`), 0) AS `total_issued_rm` FROM `rm_location` WHERE `jw_transaction_id` = :transaction_id AND `components_id` = :component_id AND trans_type = 'JOBWORK'",
              {
                replacements: { component_id: stmt_comp_item.jw_bom_part, transaction_id: mainStmt[jwIdIndex].jw_jw_transaction },
                type: invtDB.QueryTypes.SELECT,
              }
            );
            let total_issue_ever = 0;
            if (stmt_total_iss_ever.length > 0) {
              total_issue_ever = stmt_total_iss_ever[0].total_issued_rm;
            }
            // Added: Calculate required_qty based on jw_po_order_qty * bom_qty for this specific JW transaction and component
            const required_qty = mainStmt[jwIdIndex].jw_po_order_qty * stmt_comp_item.bom_qty;

            // Added: Calculate pending_qty as required_qty - total_issue_ever (similar to the first code's pending_qty = required - issued)
            // If positive, it's pending to issue; if negative, it's excess issued (short/excess logic)
            const pending_qty = helper.number(required_qty - total_issue_ever).toFixed(2);

            const stmt_total_iss_for_openeing = await invtDB.query(
              "SELECT COALESCE(SUM(`qty`+`other_qty`), 0) AS `total_issued_rm` FROM `rm_location` WHERE `jw_transaction_id` = :transaction_id AND `components_id` = :component_id AND trans_type = 'JOBWORK' AND DATE_FORMAT(`insert_date`,'%Y-%m-%d') < :date1",
              {
                replacements: { component_id: stmt_comp_item.jw_bom_part, transaction_id: mainStmt[jwIdIndex].jw_jw_transaction, date1: fromdate },
                type: invtDB.QueryTypes.SELECT,
              }
            );

            let total_issue_qty_for_opening = 0;
            if (stmt_total_iss_for_openeing.length > 0) {
              total_issue_qty_for_opening = stmt_total_iss_for_openeing[0].total_issued_rm;
            }

            const stmt_total_consump_for_opening = await invtDB.query(
              "SELECT COALESCE(SUM(`qty`+`other_qty`),0 ) AS `total_consumption` FROM `rm_location` WHERE `jw_transaction_id` = :transaction_id AND `components_id` = :component_id AND `trans_type` = 'SFG-CONSUMPTION' AND DATE_FORMAT(`insert_date`,'%Y-%m-%d') < :date1",
              {
                replacements: { component_id: stmt_comp_item.jw_bom_part, transaction_id: mainStmt[jwIdIndex].jw_jw_transaction, date1: fromdate },
                type: invtDB.QueryTypes.SELECT,
              }
            );
            let total_consumption_value_for_opening = 0;
            if (stmt_total_consump_for_opening.length > 0) {
              total_consumption_value_for_opening = stmt_total_consump_for_opening[0].total_consumption;
            }

            const stmt_total_ret_for_opening = await invtDB.query(
              "SELECT COALESCE(SUM(`qty`+`other_qty`),0 ) AS `total_returned_rm` FROM `rm_location` WHERE `trans_type` = 'INWARD' AND `in_jw_transaction_id` = :transaction_id AND `components_id` = :component_id AND trans_mode = 'return' AND DATE_FORMAT(`insert_date`,'%Y-%m-%d') < :date1",
              {
                replacements: { component_id: stmt_comp_item.jw_bom_part, transaction_id: mainStmt[jwIdIndex].jw_jw_transaction, date1: fromdate },
                type: invtDB.QueryTypes.SELECT,
              }
            );
            let total_rm_return_qty_for_opening = 0;
            if (stmt_total_ret_for_opening.length > 0) {
              total_rm_return_qty_for_opening = stmt_total_ret_for_opening[0].total_returned_rm;
            }

            // const consump_qty_for_opening = helper.number(
            //   total_consumption_value_for_opening > total_issue_qty_for_opening - total_rm_return_qty_for_opening
            //     ? total_issue_qty_for_opening - total_rm_return_qty_for_opening
            //     : total_consumption_value_for_opening
            // );
            const consump_qty_for_opening = helper.number(total_consumption_value_for_opening);

            const opening2 = Number(helper.number(total_issue_qty_for_opening - consump_qty_for_opening - total_rm_return_qty_for_opening).toFixed(2));

            // /////////////////Opening

            // const consump_qty = helper.number(total_consumption_value > total_issue_qty - total_rm_return_qty ? total_issue_qty - total_rm_return_qty : total_consumption_value);
            const consump_qty = helper.number(total_consumption_value);

            const inward = Number(helper.number(total_issue_qty).toFixed(2));
            const outward = Number(helper.number(consump_qty + Number(total_rm_return_qty)).toFixed(2));
            // const closing = Number(helper.number(total_issue_qty - consump_qty - total_rm_return_qty).toFixed(2));

            // const opening = closing + outward - inward;
            const closing2 = opening2 + inward - outward;

            // ////////////////// Rate

            let avgInward = 0;
            let avgOutward = 0;
            let openingRate = 0;
            let closingRate = 0;

            if (compAvgRate[stmt_comp_item.jw_bom_part]) {
              avgInward = compAvgRate[stmt_comp_item.jw_bom_part].avgInward;
              avgOutward = compAvgRate[stmt_comp_item.jw_bom_part].avgOutward;
              openingRate = compAvgRate[stmt_comp_item.jw_bom_part].openingRate;
              closingRate = compAvgRate[stmt_comp_item.jw_bom_part].closingRate;
            } else {
              openingRate = await require("../../../helper/utils").getWeightedPurchaseRate(stmt_comp_item.jw_bom_part, fromdate);

              closingRate = await require("../../../helper/utils").getWeightedPurchaseRate(stmt_comp_item.jw_bom_part, todate);

              const inwardRate = [];
              const outwardRate = [];

              let fromdate1 = moment(fromdate).format("YYYY-MM-DD");
              const todate1 = moment(todate).format("YYYY-MM-DD");
              while (fromdate1 <= todate1) {
                const temp = await require("../../../helper/utils").getWeightedPurchaseRate(stmt_comp_item.jw_bom_part, fromdate1);
                inwardRate.push(temp);

                const temp1 = await require("../../../helper/utils").getWeightedPurchaseRate(stmt_comp_item.jw_bom_part, fromdate1);
                outwardRate.push(temp1);

                // console.log(fromdate1, temp, temp1 , "============================");

                fromdate1 = moment(fromdate1).add(1, "days").format("YYYY-MM-DD");
              }

              avgInward = (inwardRate.reduce((a, b) => Number(a) + Number(b), 0) / inwardRate.length).toFixed(3);
              avgOutward = (outwardRate.reduce((a, b) => Number(a) + Number(b), 0) / outwardRate.length).toFixed(3);

              compAvgRate[stmt_comp_item.jw_bom_part] = {
                jw_bom_part: stmt_comp_item.jw_bom_part,
                avgInward: avgInward,
                avgOutward: avgOutward,
                openingRate: openingRate,
                closingRate: closingRate,
              };
            }

            // console.log(compAvgRate);

            // /////////////////////

            return {
              SKU: mainStmt[jwIdIndex].p_sku,
              JWId: mainStmt[jwIdIndex].jw_jw_transaction,
              VendorName: vendorList[v].ven_name,
              COMPONENT: stmt_comp_item.c_name,
              PART: stmt_comp_item.c_part_no,
              UNIT: stmt_comp_item.units_name,
              VENDOR: vendorList[v].ven_register_id,
              "Opening QTY": opening2,
              // Opening: opening,
              "Opening Rate": openingRate,
              "Opening Value": opening2 * openingRate,
              "Inward QTY": inward,
              "Inward Rate": avgInward,
              "Inward Value": inward * avgInward,
              "Outward QTY": outward,
              "Outward Rate": avgOutward,
              "Outward Value": outward * avgOutward,
              "Pending QTY": pending_qty, // Added: The pending_qty (or short/excess) per JW transaction and part
              // closing: closing,
              "Closing QTY": closing2,
              "Closing Rate": closingRate,
              "Closing Value": closing2 * closingRate,
            };
          });
          const result = await Promise.all(jwData);
          finalData.push(...result);
        }
      }
      // END LOOP

      const XLSX = require("xlsx");
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(finalData);
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      XLSX.writeFile(wb, "./files/excel/" + fileName);

      // END MAIN PROCESS

      const filePath = "./files/excel/";

      let stmt = await otherDB.query("UPDATE user_files_req SET status = 'complete', other_data = :other WHERE user_id= :uid AND req_code = 'JW_INVENTORY' AND req_date = :req_date", {
        replacements: {
          uid: user_id,
          req_date: data.date,
          other: JSON.stringify({
            fileName: fileName,
            fileUrl: filePath + fileName,
            fileBuffer: Buffer.from(filePath + fileName, "base64"),
          }),
        },
        type: otherDB.QueryTypes.UPDATE,
      });

      // SEND MAIL

      let user = await invtDB.query("SELECT `Email_ID`,`user_name` from `admin_login` WHERE `CustID`= :CustID", {
        replacements: {
          CustID: user_id,
        },
        type: invtDB.QueryTypes.SELECT,
      });

      if (user.length > 0) {
        let userEmail = user[0].Email_ID;
        let attachment = [
          {
            filename: "JW Inventory.csv",
            content: fs.readFileSync(filePath + fileName),
          },
        ];

        helper.sendMail(
          userEmail,
          "",
          "JW Inventory " + data.date + " [File Ready for download] Ref:" + helper.randomNumber(99999, 999999),
          htmlTemplate(user[0].user_name, new Date(), "JW Inventory", `${process.env.SOCKET_API_URL}/${filePath}${fileName}`),
          attachment
        );
      }

      // END MAIL
    });
  } catch (err) {
    console.log(err);
    error_log({ stack: err.stack });
    return emit_error_msg(io, socket, "Something went wrong to generate report  . Please try again later");
  }
};
