const path = require("path");
const moment = require("moment");
const XLSX = require("xlsx");
const jwt = require("jsonwebtoken");
const Validator = require("validatorjs");
const fs = require("fs");

const helper = require("../../../../helper/helper");
const { otherDB, invtDB } = require("../../../../config/db/connection");

const { verifyToken, error_log, emit_notifications, emit_error_msg } = require("../../../../helper/utils");

exports.vr01 = async function (io, socket) {
    try {
        socket.on("vr01", async (data) => {

            const valid = new Validator({
                date: data.otherdata.date
            }, {
                date: "required"
            });

            if (valid.fails()) {
                emit_error_msg(io, socket, "Please select date");
                return;
            }

            const token_res = await verifyToken(`${socket.handshake.auth.token}`);
            const user_id = token_res.crn_id;

            let fileName = "";
            const check_data = await otherDB.query("SELECT * FROM user_files_req WHERE user_id= :uid AND req_code = 'VR01' AND req_date = :date AND status = 'pending'", {
                replacements: {
                    uid: user_id,
                    date: data.otherdata.date,
                },
                type: otherDB.QueryTypes.SELECT,
            });

            if (check_data.length > 0) {
                fileName = JSON.parse(check_data[0].other_data).fileName;
            }
            fileName = "VR01-" + user_id + Math.floor(Math.random() * 9999) + ".csv";

            // CREATE NEW REQUEST
            const stmt_create_req = await otherDB.query("INSERT INTO user_files_req (request_txt_label, req_code, user_id, req_date, msg_type , status , other_data, insert_date,reactNotificationId ) VALUES ('VR01', 'VR01', :uid, :req_date,'file','pending', :other , :insert_date,:notificationId) ", {
                replacements: {
                    uid: user_id,
                    req_date: data.otherdata.date,
                    other: JSON.stringify({ fileName: fileName }),
                    insert_date: moment().format("YYYY-MM-DD HH:mm:ss"),
                    notificationId: data.notificationId ?? 0,
                },
                type: otherDB.QueryTypes.INSERT,
            });

            io.to(user_id).emit("download_start_detail", {
                title: "VR01",
                details: data.otherdata.date,
                notificationId: data.notificationId ?? 0,
                status: "pending",
                detailStatus: true,
                type: "file",
            });

            // REPORT GENERATION

            const date = data.otherdata.date.match(/([0-9]{2})-([0-9]{2})-([0-9]{4})/g);
            const fromdate = moment(date[0], "DD-MM-YYYY").format("YYYY-MM-DD");
            const todate = moment(date[1], "DD-MM-YYYY").format("YYYY-MM-DD");

            const stmt_comp = await invtDB.query("SELECT jw_ven_location.* FROM jw_ven_location WHERE DATE_FORMAT(`jw_ven_insert_dt`,'%Y-%m-%d') BETWEEN :date1 AND :date2 AND jw_ven_insert_by = :vendor GROUP BY jw_ven_rm", {
                replacements: { date1: fromdate, date2: todate, vendor: user_id },
                type: invtDB.QueryTypes.SELECT
            });

            if (stmt_comp.length <= 0) {
                updateOnError("Data Not Found" , user_id , data.otherdata.date);
                return emit_error_msg(io, socket, "Data Not Found");
            }

            const result = [];

            for (let i = 0; i < stmt_comp.length; i++) {
                const stmt = await invtDB.query("SELECT jw_ven_location.*, components.c_part_no , components.c_name FROM jw_ven_location LEFT JOIN components ON components.component_key = jw_ven_location.jw_ven_rm WHERE DATE_FORMAT(`jw_ven_insert_dt`,'%Y-%m-%d') BETWEEN :date1 AND :date2 AND jw_ven_rm = :component AND jw_ven_insert_by = :vendor", {
                    replacements: { date1: fromdate, date2: todate, component: stmt_comp[i].jw_ven_rm, vendor: user_id },
                    type: invtDB.QueryTypes.SELECT
                });

                if (stmt.length <= 0) {
                    continue;
                }
                for (let j = 0; j < stmt.length; j++) {
                    result.push({
                        PART_NAME: stmt[j].c_part_no,
                        PART_CODE: stmt[j].c_name,
                        TYPE: stmt[j].jw_ven_txn_type == "RM-INWARD" ? "INWARD" : stmt[j].jw_ven_txn_type == "RM-CONSUMPTION" ? "CONSUMPTION" : "NA",
                        QTY: stmt[j].jw_ven_in_qty,
                        HSN: stmt[j].jw_ven_part_hsn,
                        TXN_NO: stmt[j].jw_ven_txn,
                        DATE: moment(stmt[j].jw_ven_insert_dt, "YYYY-MM-DD HH:mm:ss").tz("Asia/Kolkata").format("DD-MM-YYYY HH:mm:ss"),
                    })
                }
            }
            // END REPORT GENERATION

            const filePath = "./files/excel/";
            try {
                fs.accessSync(filePath + fileName);
            } catch (error) {
                fs.writeFileSync(filePath + fileName, "", "utf8");
            }
            // GENERATE CSV FILE
            const worksheet = XLSX.utils.json_to_sheet(result);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "MATERIAL ISSUE REPORT");
            // buffer we use to handle the big file
            XLSX.write(workbook, { bookType: "csv", type: "buffer" });
            XLSX.writeFile(workbook, filePath + fileName);

            let stmt = await otherDB.query("UPDATE user_files_req SET status = 'complete', other_data = :other WHERE user_id= :uid AND req_code = 'VR01' AND req_date = :req_date", {
                replacements: {
                    uid: user_id,
                    req_date: data.otherdata.date,
                    other: JSON.stringify({
                        fileName: fileName,
                        fileUrl: filePath + fileName,
                        fileBuffer: Buffer.from(filePath + fileName, "base64"),
                    }),
                },
                type: otherDB.QueryTypes.UPDATE,
            });

            emit_notifications(io, socket, data.notificationId ?? 0);

        });

        async function updateOnError(err , user_id , date) {
            let stmt = await otherDB.query("UPDATE user_files_req SET status = 'complete', other_data = :other , request_txt_label = :request , msg_type = 'msg' WHERE user_id= :uid  AND req_code = 'VR01' AND req_date = :req_date", {
                replacements: {
                    request: "VR01" + " - " + err,
                    uid: user_id,
                    req_date: date,
                    other: JSON.stringify({

                    }),
                },
                type: otherDB.QueryTypes.UPDATE,
            });
        }

    }
    catch (err) {
        error_log({ stack: err.stack });
        return emit_error_msg(io, socket, "Something went wrong to generate report VR01 . Please try again later");
    }

}