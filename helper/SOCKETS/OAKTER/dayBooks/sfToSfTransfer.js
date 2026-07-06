const path = require("path");
const moment = require("moment");
const XLSX = require("xlsx");
const jwt = require("jsonwebtoken");
const Validator = require("validatorjs");
const fs = require("fs");

const helper = require("../../../../helper/helper");
const { otherDB, invtDB } = require("../../../../config/db/connection");
const { htmlTemplate } = require("../../../backendProcess/EmailTemplate/fileDownload");


exports.sfToSfTransfer = async (date, uid, emit_notifications, notificationId, socket, io) => {
    try {

        const stmt1 = await invtDB.query(
            "SELECT *, `rm_location`.`insert_date`, `rm_location`.`insert_by` AS `insertedByPersonName` FROM `rm_location` LEFT JOIN `components` ON `rm_location`.`components_id` = `components`.`component_key` LEFT JOIN `units` ON `components`.`c_uom` = `units`.`units_id` LEFT JOIN `admin_login` ON `rm_location`.`insert_by` = `admin_login`.`CustID` WHERE `components`.`c_type` = 'R' AND `components`.`c_is_enabled` = 'Y' AND DATE_FORMAT(`rm_location`.`insert_date`,'%Y-%m-%d') BETWEEN :datefrom AND :dateto AND `rm_location`.`trans_type` = 'TRANSFER' ORDER BY `rm_location`.`transfer_transaction_id` DESC",
            {
                replacements: {
                    datefrom: date,
                    dateto: date
                },
                type: invtDB.QueryTypes.SELECT,
            }
        );

        if (stmt1.length > 0) {
            var data = [];
            stmt1.map(async (item) => {
                let stmt2 = await invtDB.query("SELECT * FROM `location_main` WHERE `location_key` = :loc_in", { replacements: { loc_in: item.loc_in }, type: invtDB.QueryTypes.SELECT });
                let loc_in;
                if (stmt2.length > 0) {
                    loc_in = stmt2[0].loc_name;
                } else {
                    loc_in = "N/A";
                }

                let stmt3 = await invtDB.query("SELECT * FROM `location_main` WHERE `location_key` = :loc_out", { replacements: { loc_out: item.loc_out }, type: invtDB.QueryTypes.SELECT });
                let loc_out;
                if (stmt3.length > 0) {
                    loc_out = stmt3[0].loc_name;
                } else {
                    loc_out = "N/A";
                }

                data.push({
                    DATE: moment(item.insert_date).tz("Asia/Kolkata").format("DD-MM-YYYY HH:mm:ss"),
                    PART: item.c_part_no,
                    COMPONENT: item.c_name,
                    OUT_LOC: loc_out,
                    IN_LOC: loc_in,
                    QTY: helper.number(item.qty) + helper.number(item.other_qty),
                    UOM: item.units_name,
                    TXN_ID: item.transfer_transaction_id,
                    SHIFTED_BY: item.user_name,
                    REMARK: item.any_remark,
                });

                if (data.length === stmt1.length) {
                    // return res.json({ code: 200, status: "success", data: data });

                    const worksheet = XLSX.utils.json_to_sheet(data);
                    const workbook = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(workbook, worksheet, "SF TO SF TRANSFER");
                    // buffer we use to handle the big file
                    XLSX.write(workbook, { bookType: "csv", type: "buffer" });

                    let randKey = Math.floor(Math.random() * (999 - 100 + 1)) + 100;
                    let fileGenarateName = "./files/excel/SF_TO_SF_TRANSFER" + randKey + ".csv";

                    XLSX.writeFile(workbook, fileGenarateName);

                    let stmt = await otherDB.query("UPDATE user_files_req SET status = 'complete', other_data = :other WHERE user_id= :uid AND req_code = 'SF_TO_SF_TRANSFER' AND req_date = :req_date", {
                        replacements: {
                            uid: uid,
                            req_date: date,
                            other: JSON.stringify({
                                fileName: `SF_TO_SF_TRANSFER${randKey}.csv`,
                                fileUrl: fileGenarateName,
                                fileBuffer: Buffer.from(fileGenarateName, "base64"),
                            }),
                        },
                        type: otherDB.QueryTypes.UPDATE,
                    });
                    emit_notifications(io, socket, notificationId);

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
                            filename: "SF TO SF TRANSFER.csv",
                            content: fs.readFileSync(fileGenarateName),
                        },
                    ];
                    await helper.sendMail(userEmail, "", "DAY BOOK SF TO SF TRANSFER [File Ready for download] Ref:" + helper.randomNumber(10, 999), htmlTemplate(user[0].user_name, new Date(), "SF TO SF TRANSFER", fileGenarateName), attachment);
                    //END MAIL

                }
            });
        } else {
            let stmt_update = await otherDB.query("UPDATE user_files_req SET status = 'complete', other_data = :other WHERE user_id= :uid AND req_code = 'SF_TO_SF_TRANSFER'", {
                replacements: {
                    uid: uid,
                    other: "{}",
                },
                type: otherDB.QueryTypes.UPDATE,
            });
            return;
        }


    } catch (err) {
        console.log(err.stack);
    }


}