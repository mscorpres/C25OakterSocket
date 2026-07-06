const path = require("path");
const moment = require("moment");
const XLSX = require("xlsx");
const jwt = require("jsonwebtoken");
const Validator = require("validatorjs");
const fs = require("fs");

const helper = require("../../../../helper/helper");
const { otherDB, invtDB } = require("../../../../config/db/connection");
const { htmlTemplate } = require("../../../backendProcess/EmailTemplate/fileDownload");


exports.materialIssue = async (date, uid, emit_notifications, notificationId, socket, io) => {
    try {

        const finalResult = await invtDB.query("SELECT *, rm_location.insert_date, rm_location.loc_out AS loc_out FROM rm_location LEFT JOIN components ON rm_location.components_id = components.component_key LEFT JOIN units ON components.c_uom = units.units_id LEFT JOIN location_main ON rm_location.loc_in = location_main.location_key LEFT JOIN admin_login ON rm_location.insert_by = admin_login.CustID  WHERE DATE_FORMAT(`rm_location`.`insert_date`, '%Y-%m-%d') = :date AND trans_type = 'ISSUE' AND loc_in != '--' AND is_auto_cons != 'Y'  ", {
            replacements: {
                date: date,
            },
            type: invtDB.QueryTypes.SELECT,
        });

        if (finalResult.length <= 0) {
            let stmt_update = await otherDB.query("UPDATE user_files_req SET status = 'complete', other_data = :other WHERE user_id= :uid AND req_code = 'DAYBOOKMATERIALISSUE'", {
                replacements: {
                    uid: uid,
                    other: "{}",
                },
                type: otherDB.QueryTypes.UPDATE,
            });
            return;
        }

        let result = [];
        let count = 0;

        finalResult.map(async (item) => {

            // For HSN
            let hsn_code;

            let stmt3 = await invtDB.query("SELECT in_hsn_code FROM rm_location WHERE components_id= :component AND (in_hsn_code != '--' AND in_hsn_code != '') ORDER BY ID DESC LIMIT 1", {
                replacements: { component: item.components_id },
                type: invtDB.QueryTypes.SELECT,
            });
            if (stmt3.length > 0) {
                hsn_code = stmt3[0].in_hsn_code;
            }
            // END HSN

            let location;
            let stmt5 = await invtDB.query("SELECT loc_name FROM location_main WHERE location_key = :location", {
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
                let stmt6 = await invtDB.query("SELECT admin_login.user_name AS requested_by_user FROM material_request LEFT JOIN admin_login ON admin_login.CustID = material_request.inserted_by WHERE material_request.approval_transaction = :approval_id", {
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
                TRANSACTION: item.out_transaction_id,
                REQUESTED_BY: requested_by,
                ADDED_BY: item.user_name,
                COMMENT: item.any_remark,
            });
            count++;
            if (count == finalResult.length) {

                const worksheet = XLSX.utils.json_to_sheet(result);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "MATERIAL ISSUE REPORT");
                // buffer we use to handle the big file
                XLSX.write(workbook, { bookType: "csv", type: "buffer" });
                let randKey = Math.floor(Math.random() * (999 - 100 + 1)) + 100;
                let fileGenarateName = "./files/excel/MATERIAL_ISSUE" + randKey + ".csv";

                XLSX.writeFile(workbook, fileGenarateName);

                let stmt = await otherDB.query("UPDATE user_files_req SET status = 'complete', other_data = :other WHERE user_id= :uid AND req_code = 'DAYBOOKMATERIALISSUE' AND req_date = :req_date", {
                    replacements: {
                        uid: uid,
                        req_date: date,
                        other: JSON.stringify({
                            fileName: `MATERIAL_ISSUE${randKey}.csv`,
                            fileUrl: fileGenarateName,
                            fileBuffer: Buffer.from(fileGenarateName, "base64"),
                        }),
                    },
                    type: otherDB.QueryTypes.UPDATE,
                });
                emit_notifications(io , socket , notificationId);

                // SEND USER MAIL
                let user = await invtDB.query("SELECT Email_ID,user_name from admin_login WHERE CustID= :CustID", {
                    replacements: {
                        CustID: uid,
                    },
                    type: invtDB.QueryTypes.SELECT,
                });
                let userEmail = user[0].Email_ID;
                let attachment = [
                    {
                        filename: "MATERIAL ISSUE REPORT.csv",
                        content: fs.readFileSync(fileGenarateName),
                    },
                ];
                await helper.sendMail(userEmail, "", "DAY BOOK MATERIAL ISSUE REPORT [File Ready for download] Ref:" + helper.randomNumber(10, 999), htmlTemplate(user[0].user_name, new Date(), "MATERIAL ISSUE REPORT", fileGenarateName), attachment);
                //END MAIL
            }
        });

    } catch (err) {
        console.log(err.stack);
    }


}