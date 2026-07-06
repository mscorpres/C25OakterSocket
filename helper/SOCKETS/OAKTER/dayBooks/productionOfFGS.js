const path = require("path");
const moment = require("moment");
const XLSX = require("xlsx");
const jwt = require("jsonwebtoken");
const Validator = require("validatorjs");
const fs = require("fs");

const helper = require("../../../helper");
const { otherDB, invtDB } = require("../../../../config/db/connection");
const { htmlTemplate } = require("../../../backendProcess/EmailTemplate/fileDownload");

const { error_log, emit_error_msg } = require("../../../utils");

exports.productionOfFGS = async (date, uid, emit_notifications, notificationId, socket, io) => {
    try {
        query =
            "SELECT `mfg_production_2`.`mfg_sku`, `mfg_production_2`.`mfg_ref_id`, `mfg_production_2`.`mfg_transaction`, `mfg_production_2`.`mfg_prod_type`, `mfg_production_2`.mfg_prod_planing_qty, `products`.`p_sku`, `products`.`p_name`, COALESCE( SUM( `mfg_production_2`.`mfg_prod_planing_qty` ), 0 ) AS `totalReqQty`, IF(`table1`.`testAMT` IS NULL, '0', `table1`.`testAMT`) AS `testAMT`, `mfg_production_2`.`mfg_full_date` FROM `mfg_production_2` LEFT JOIN(SELECT `mfg_ref_id`, `mfg_transaction`, `mfg_prod_planing_qty`, COALESCE(SUM(`mfg_prod_in`), 0) AS `testAMT`, `mfg_prod_type` FROM `mfg_production_2` GROUP BY `mfg_transaction`,`mfg_ref_id`) `table1` ON `mfg_production_2`.`mfg_transaction` = `table1`.`mfg_transaction` AND `mfg_production_2`.`mfg_ref_id` = `table1`.`mfg_ref_id` LEFT JOIN `products` ON `mfg_production_2`.`mfg_sku` = `products`.`p_sku` WHERE `mfg_production_2`.`mfg_prod_type` = 'C' AND DATE_FORMAT(`mfg_production_2`.`mfg_full_date`,'%Y-%m-%d') BETWEEN :date1 AND :date2 GROUP BY `mfg_production_2`.`mfg_transaction`,`mfg_production_2`.`step_count` ORDER BY `mfg_production_2`.`ID` DESC";
        replacements = {
            replacements: { date1: date, date2: date },
            type: invtDB.QueryTypes.SELECT,
        };

        let stmt0 = await invtDB.query(query, replacements);
        if (stmt0.length > 0) {
            let resData = [];
            let count = 0;
            stmt0.map(async (item0) => {
                if (helper.number(item0.totalReqQty) <= helper.number(item0.testAMT)) {
                    count++;
                    let completedQTY;
                    let typeOfPPR;
                    let stmt1 = await invtDB.query("SELECT `mfg_pro_apr_sku`, `mfg_ref_transid_2`, `mfg_ref_transid_1`, `mfg_approve_in_qty`, COALESCE( SUM(`mfg_approve_in_qty`), 0 ) AS totalApprovedQty FROM `mfg_production_3` WHERE `mfg_ref_transid_1` = :transaction1 AND `mfg_ref_transid_2` = :transaction2 GROUP BY mfg_production_3.mfg_ref_transid_2", {
                        replacements: { transaction1: item0.mfg_ref_id, transaction2: item0.mfg_transaction },
                        type: invtDB.QueryTypes.SELECT,
                    });
                    if (stmt1.length > 0) {
                        stmt1.map(async (item1) => {
                            let stmt2 = await invtDB.query("SELECT COALESCE(SUM(mfg_approve_in_qty),0) AS totalApprovedQty FROM `mfg_production_3` WHERE mfg_pro_apr_sku = :sku AND `mfg_ref_transid_1` = :transaction1 AND mfg_ref_transid_2 = :transaction2", {
                                replacements: { sku: item1.mfg_pro_apr_sku, transaction1: item1.mfg_ref_transid_1, transaction2: item1.mfg_ref_transid_2 },
                                type: invtDB.QueryTypes.SELECT,
                            });

                            if (stmt2.length > 0) {
                                completedQTY = stmt2[0].totalApprovedQty ?? 0;
                            } else {
                                completedQTY = 0;
                            }

                            let stmt3 = await invtDB.query("SELECT prod_type FROM `mfg_production_1` WHERE `prod_transaction` = :transaction1", {
                                replacements: { transaction1: item1.mfg_ref_transid_1 },
                                type: invtDB.QueryTypes.SELECT,
                            });
                            if (stmt3.length > 0) {
                                typeOfPPR = stmt3[0].prod_type.toUpperCase();
                            } else {
                                typeOfPPR = "N/A";
                            }
                            resData.push({
                                TYPE: typeOfPPR,
                                RQD_ID: item0.mfg_transaction,
                                PPR_NO: item0.mfg_ref_id,
                                DATA_TIME: moment(item0.mfg_full_date).tz("Asia/Kolkata").format("DD-MM-YYYY HH:mm:ss"),
                                SKU: item0.mfg_sku,
                                PRODUCT: item0.p_name,
                                MFG_OR_STIN_QTY: item0.mfg_prod_planing_qty + "/" + completedQTY,
                            });
                            sendRes();
                        });
                    } else {
                        let stmt4 = await invtDB.query("SELECT prod_type FROM `mfg_production_1` WHERE `prod_transaction` = :transaction1", {
                            replacements: { transaction1: item0.mfg_ref_id },
                            type: invtDB.QueryTypes.SELECT,
                        });
                        if (stmt4.length > 0) {
                            typeOfPPR = stmt4[0].prod_type.toUpperCase();
                        } else {
                            typeOfPPR = "N/A";
                        }

                        resData.push({
                            TYPE: typeOfPPR,
                            RQD_ID: item0.mfg_transaction,
                            PPR_NO: item0.mfg_ref_id,
                            DATA_TIME: item0.mfg_full_date,
                            SKU: item0.mfg_sku,
                            PRODUCT: item0.p_name,
                            MFG_OR_STIN_QTY: item0.mfg_prod_planing_qty + "/" + completedQTY,
                        });
                        sendRes();
                    }
                }
            });

            function sendRes() {
                if (resData.length == count) {
                  const excel =  async () => {
                        const worksheet = XLSX.utils.json_to_sheet(resData);
                        const workbook = XLSX.utils.book_new();

                        XLSX.utils.book_append_sheet(workbook, worksheet, "JW Inward");

                        //buffer we use to handle the big file
                        XLSX.write(workbook, { bookType: "csv", type: "buffer" });
                        //   xlsx.write(workbook, { bookType: "xlsx", type: "binary" });

                        let randKey = Math.floor(Math.random() * (999 - 100 + 1)) + 100;

                        let fileGenarateName = "./files/excel/Production_of_FG" + randKey + ".csv"

                        XLSX.writeFile(workbook, fileGenarateName);


                        let stmt = await otherDB.query("UPDATE user_files_req SET status = 'complete', other_data = :other WHERE user_id= :uid AND req_code = 'PRODUCTION_OF_FGS'", {
                            replacements: {
                                uid: uid,
                                other: JSON.stringify({
                                    fileName: `Production_of_FG${randKey}.csv`,
                                    fileUrl: fileGenarateName,
                                    fileBuffer: Buffer.from(fileGenarateName, "base64"),
                                }),
                            },
                            type: otherDB.QueryTypes.UPDATE,
                        });
                        emit_notifications(io, socket, notificationId);

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
                                filename: "Production_of_FG" + date + ".csv",
                                content: fs.readFileSync(fileGenarateName),
                            },
                        ];
                        await helper.sendMail(userEmail, "", "P [File Ready for download] Ref:" + helper.randomNumber(100, 999), htmlTemplate(user[0].user_name, new Date(), "Production_of_FG" + date + ".csv", ""), attachment);
                        //END MAIL
                        return;
                    }
                    excel();
                }
            }
        } else {
            let stmt_update = await otherDB.query("UPDATE user_files_req SET status = 'complete', other_data = :other WHERE user_id= :uid AND req_code = 'MATERIAL_RECEIVE_FROM_JW'", {
                replacements: {
                    uid: uid,
                    other: "{}",
                },
                type: otherDB.QueryTypes.UPDATE,
            });

            emit_error_msg(io, socket, "Material Receive From JW Report Already Generated");
            return;
        }

    } catch (err) {
        error_log({ stack: err.stack });
    }


}