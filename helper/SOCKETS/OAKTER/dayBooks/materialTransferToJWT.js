const path = require("path");
const moment = require("moment");
const xlsx = require("xlsx");
const jwt = require("jsonwebtoken");
const Validator = require("validatorjs");
const fs = require("fs");

const helper = require("../../../../helper/helper");
const { otherDB, invtDB } = require("../../../../config/db/connection");
const { htmlTemplate } = require("../../../backendProcess/EmailTemplate/fileDownload");

const { error_log, emit_error_msg } = require("../../../utils");


exports.materialTransferToJWT = async (date, uid, emit_notifications, notificationId, socket, io, req_code) => {

    try {
        const data = date;
        const req_date = date;
        var pattern = /([0-9]{2})-([0-9]{2})-([0-9]{4}) - ([0-9]{2})-([0-9]{2})-([0-9]{4})/gi;
        var pattern1 = /([0-9]{2})-([0-9]{2})-([0-9]{4})-([0-9]{2})-([0-9]{2})-([0-9]{4})/gi;
        if (pattern.test(data) || pattern1.test(data)) {
            const date = data.match(/([0-9]{2})-([0-9]{2})-([0-9]{4})/gi);

            let date1 = moment(date[0], "DD-MM-YYYY").format("YYYY-MM-DD");
            let date2 = moment(date[1], "DD-MM-YYYY").format("YYYY-MM-DD");
            io.to(uid).emit("download_start_detail", {
                title: "DAY BOOK MATERIAL ISSUE JW",
                details: date,
                notificationId: notificationId,
                status: "pending",
                detailStatus: true,
                total: false,
                type: "file",
            });
            let finalResult = await invtDB.query(
                "SELECT *, rm_location.insert_date, `rm_location`.`loc_out` AS `loc_out` FROM `rm_location` LEFT JOIN `ven_basic_detail` ON `rm_location`.`in_vendor_name`  = `ven_basic_detail`.`ven_register_id` LEFT JOIN `components` ON `rm_location`.`components_id` = `components`.`component_key` LEFT JOIN `units` ON `components`.`c_uom` = `units`.`units_id` LEFT JOIN `location_main` ON `rm_location`.`loc_in` = `location_main`.`location_key` LEFT JOIN `admin_login` ON rm_location.insert_by = admin_login.CustID WHERE `components`.`c_type` = 'R' AND `components`.`c_is_enabled` = 'Y' AND DATE_FORMAT(`rm_location`.`insert_date`, '%Y-%m-%d') BETWEEN :date1 AND :date2 AND  `rm_location`.`trans_type` = 'JOBWORK'  ORDER BY `rm_location`.`insert_date` DESC",
                {
                    replacements: { date1: date1, date2: date2 },
                    type: invtDB.QueryTypes.SELECT,
                }
            );

            if (finalResult.length == 0) {

                let stmt = await otherDB.query("UPDATE `user_files_req` SET `status` = 'complete', `other_data` = :other WHERE `user_id`= :uid AND `req_code` = :req_code AND req_date = :req_date", {
                    replacements: {
                        req_code: req_code,
                        uid: uid,
                        req_date: req_date,
                        other: "",
                    },
                    type: otherDB.QueryTypes.UPDATE,
                });

                return { code: 500, message: "Transaction not found", status: "error" };
            }

            let result = [];
            let count = 0;

            finalResult.map(async (item) => {

                // For HSN
                let hsn_code;

                let stmt3 = await invtDB.query("SELECT `in_hsn_code` FROM `rm_location` WHERE `components_id`= :component AND (`in_hsn_code` != '--' AND `in_hsn_code` != '') ORDER BY `ID` DESC LIMIT 1", {
                    replacements: { component: item.components_id },
                    type: invtDB.QueryTypes.SELECT,
                });
                if (stmt3.length > 0) {
                    hsn_code = stmt3[0].in_hsn_code;
                }
                // END HSN

                // VENDOR
                let vendor;
                if (item.in_vendor_name == "--") {
                    vendor = "--";
                } else {
                    vendor = item.ven_name + " / " + item.in_vendor_name;
                }

                // For JW Order
                let jw_order_no, jw_challan_no, rate;
                if (item.jw_transaction_id !== "" && item.jw_transaction_id !== "--") {
                    jw_order_no = item.jw_transaction_id;
                    jw_challan_no = item.jw_challan_id;
                    rate = item.in_po_rate;
                } else {
                    jw_order_no = item.jw_transaction_id;
                    jw_challan_no = item.jw_challan_id;

                    let stmt4 = await invtDB.query("SELECT `in_po_rate` FROM `rm_location` WHERE `components_id`= :component AND (`in_po_rate` != '--' AND `in_po_rate` != '') AND `trans_type` = 'INWARD' AND `company_branch` = :branch ORDER BY `ID` DESC LIMIT 1", {
                        replacements: { component: item.components_id, branch: branch },
                        type: invtDB.QueryTypes.SELECT,
                    });
                    if (stmt4.length > 0) {
                        rate = stmt4[0].in_po_rate;
                    } else {
                        rate = "--";
                    }
                }
                // END JW Order
                let location;
                let stmt5 = await invtDB.query("SELECT loc_name FROM `location_main` WHERE `location_key` = :location", {
                    replacements: { location: item.loc_out },
                    type: invtDB.QueryTypes.SELECT,
                });
                if (stmt5.length > 0) {
                    location = stmt5[0].loc_name;
                } else {
                    location = "--";
                }

                // FETCH REQUEST REQUESTED BY
                let requested_by;
                if (item.out_transaction_id !== "" && item.out_transaction_id !== "--") {
                    let stmt6 = await invtDB.query("SELECT `admin_login`.`user_name` AS `requested_by_user` FROM `material_request` LEFT JOIN `admin_login` ON `admin_login`.`CustID` = `material_request`.`inserted_by` WHERE `material_request`.`approval_transaction` = :approval_id", {
                        replacements: { approval_id: item.out_transaction_id },
                        type: invtDB.QueryTypes.SELECT,
                    });
                    requested_by = stmt6.length > 0 ? stmt6[0].requested_by_user : "--";
                } else {
                    requested_by = "--";
                }

                result.push({
                    DATE: moment(item.insert_date).format("DD-MM-YYYY"),
                    COMPONENT: item.c_name,
                    PART: item.c_part_no,
                    HSN: hsn_code,
                    FROMLOCATION: location,
                    TOLOCATION: item.loc_name,
                    OUTQTY: `${item.qty}`,
                    UNIT: item.units_name,
                    RATE: rate,
                    TRANSACTION: item.out_transaction_id,
                    VENDOR: vendor,
                    JWORDER_CHALLANNO: jw_challan_no + " / " + jw_order_no,
                    REQUESTED_BY: requested_by,
                    ADDED_BY: item.user_name,
                    COMMENT: item.any_remark,
                });
                count++;
                if (count == finalResult.length) {

                    const worksheet = xlsx.utils.json_to_sheet(result);
                    const workbook = xlsx.utils.book_new();
                    xlsx.utils.book_append_sheet(workbook, worksheet, "DAY BOOK MATERIAL ISSUE JW");
                    // buffer we use to handle the big file
                    xlsx.write(workbook, { bookType: "csv", type: "buffer" });
                    let randKey = Math.floor(Math.random() * (999 - 100 + 1)) + 100;
                    let fileGenarateName = "./files/excel/DAY_BOOK_MATERIAL_ISSUE_JW" + randKey + ".csv";

                    xlsx.writeFile(workbook, fileGenarateName);

                    let stmt = await otherDB.query("UPDATE `user_files_req` SET `status` = 'complete', `other_data` = :other WHERE `user_id`= :uid AND `req_code` = :req_code AND req_date = :req_date", {
                        replacements: {
                            req_code: req_code,
                            uid: uid,
                            req_date: req_date,
                            other: JSON.stringify({
                                fileName: `DAY_BOOK_MATERIAL_ISSUE_JW${randKey}.csv`,
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
                            filename: "DAY BOOK MATERIAL ISSUE JW.csv",
                            content: fs.readFileSync(fileGenarateName),
                        },
                    ];
                    await helper.sendMail(userEmail, "", "DAY BOOK MATERIAL ISSUE JW [File Ready for download] Ref:" + helper.randomNumber(10, 999), "DAY BOOK MATERIAL ISSUE JW", attachment);
                    //END MAIL
                }
            });
        }else{
            emit_error_msg(io, socket, "Invalid date format");
        }
    } catch (err) {
        error_log({ stack:  err.stack });
        let stmt = await otherDB.query("UPDATE `user_files_req` SET `status` = 'failed' WHERE `reactNotificationId`= :uid AND `req_code` = :req_code AND req_date = :req_date", {
            replacements: {
                req_code: req_code,
                uid: notificationId,
                req_date: req_date,
            },
            type: otherDB.QueryTypes.UPDATE,
        });
        emit_notifications(io, socket, notificationId);
    }


}