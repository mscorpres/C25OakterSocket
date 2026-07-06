const path = require("path");
const moment = require("moment");
const XLSX = require("xlsx");
const jwt = require("jsonwebtoken");
const Validator = require("validatorjs");
const fs = require("fs");

const helper = require("../../../../helper/helper");
const { otherDB, invtDB } = require("../../../../config/db/connection");

const { verifyToken, error_log, emit_notifications, emit_error_msg } = require("../../../../helper/utils");

const { htmlTemplate } = require("../../../../helper/backendProcess/EmailTemplate/fileDownload");

exports.vendorReqPending = async function (io, socket) {
    try {
        socket.on("vendorReqPending", async (data) => {

            const valid = new Validator({
                searchBy: data.otherdata.searchBy,
                searchValue: data.otherdata.searchValue
            }, {
                searchBy: "required|in:datewise",
                searchValue: "required"
            });

            if (valid.fails()) {
                emit_error_msg(io, socket, "Please select valid option");
                return;
            }

            const token_res = await verifyToken(`${socket.handshake.auth.token}`);
            const user_id = token_res.crn_id;
            const vendor = token_res.vendor;

            let fileName = "";
            const check_data = await otherDB.query("SELECT * FROM user_files_req WHERE user_id= :uid AND req_code = 'VENDOR_REQ_PENDING' AND req_date = :date AND status = 'pending'", {
                replacements: {
                    uid: user_id,
                    date: data.otherdata.searchValue,
                },
                type: otherDB.QueryTypes.SELECT,
            });

            if (check_data.length > 0) {
                fileName = JSON.parse(check_data[0].otherdata).fileName;
            } else {
                fileName = "PendingRequest-" + user_id + Math.floor(Math.random() * 9999) + ".csv";
            }


            // CREATE NEW REQUEST
            const stmt_create_req = await otherDB.query("INSERT INTO user_files_req (request_txt_label, req_code, user_id, req_date, msg_type , status , other_data, insert_date,reactNotificationId ) VALUES ('VENDOR_REQ_PENDING', 'VENDOR_REQ_PENDING', :uid, :req_date,'file','pending', :other , :insert_date,:notificationId) ", {
                replacements: {
                    uid: user_id,
                    req_date: data.otherdata.searchValue,
                    other: JSON.stringify({ fileName: fileName }),
                    insert_date: moment().format("YYYY-MM-DD HH:mm:ss"),
                    notificationId: data.notificationId ?? 0,
                },
                type: otherDB.QueryTypes.INSERT,
            });

            io.to(user_id).emit("download_start_detail", {
                title: "VENDOR_REQ_PENDING",
                details: data.otherdata.searchValue,
                notificationId: data.notificationId ?? 0,
                status: "pending",
                detailStatus: true,
                type: "file",
            });

            // END CREATE NEW REQUEST

            // REPORT DOWNLOAD
            const date = data.otherdata.searchValue.match(/([0-9]{2})-([0-9]{2})-([0-9]{4})/g);
            const fromdate = moment(date[0], "DD-MM-YYYY").format("YYYY-MM-DD");
            const todate = moment(date[1], "DD-MM-YYYY").format("YYYY-MM-DD");

            let stmt = await invtDB.query(
                "SELECT `jw_ven_challan`.`jw_jobwork_id`, `jw_ven_challan`.`jw_challan_id`, `jw_ven_challan`.`jw_insert_dt`, `admin_login`.`user_name` FROM `jw_ven_challan` LEFT JOIN `admin_login` ON `admin_login`.`CustID` = `jw_ven_challan`.`jw_insert_by` LEFT JOIN jw_material_challan ON jw_material_challan.jw_challan_txn_id = jw_ven_challan.jw_challan_id WHERE ( jw_ven_challan.`jw_trans_type` = 'P' AND DATE_FORMAT(jw_ven_challan.`jw_insert_dt`, '%Y-%m-%d') BETWEEN :date1 AND :date2 ) AND jw_ven_challan.jw_ven = :vendor AND jw_material_challan.challan_status = 'A' GROUP BY jw_ven_challan.`jw_trans_type`, jw_ven_challan.`jw_challan_ref`",
                {
                    replacements: { date1: fromdate, date2: todate, vendor: vendor },
                    type: invtDB.QueryTypes.SELECT,
                }
            );

            if (stmt.length <= 0) {
                updateOnError("Data Not Found", user_id, data.otherdata.searchValue);
                return emit_error_msg(io, socket, "Data Not Found");
            }

            const finalResult = [{
                PART_CODE: "Report",
                PART_NAME: "Vendor Request Pending",
                UOM: "For Date",
                TOTAL_QTY: data.otherdata.searchValue,
                LEFT_QTY: "",
                RATE: "",
                HSN: "",
                JOBWORK_ID: "",
                CHALLAN_ID: "",
                INSERT_DATE: "",
                INSERT_BY: "",
            }];
            for (let i = 0; i < stmt.length; i++) {

                let stmt_comp = await invtDB.query(
                    "SELECT `components`.`c_part_no`, `components`.`component_key`, `components`.`c_name`, `jw_ven_challan`.`jw_jobwork_id`, `jw_ven_challan`.`jw_challan_id`, `jw_ven_challan`.`jw_qty`, `jw_ven_challan`.`jw_rate`, `units`.`units_name`, (SELECT 	jw_hsncode FROM jw_material_challan WHERE jw_component_id = `components`.`component_key` AND jw_jobwork_id = :jw AND 	jw_challan_id = :challan LIMIT 1) AS hsn FROM `jw_ven_challan` LEFT JOIN `components` ON `jw_ven_challan`.`jw_part` = `components`.`component_key` LEFT JOIN `units` ON `components`.`c_uom` = `units`.`units_id` WHERE `jw_trans_type` = 'P' AND `jw_jobwork_id` = :jw AND `jw_challan_id` = :challan AND jw_ven_challan.jw_ven = :vendor",
                    {
                        replacements: { jw: stmt[i].jw_jobwork_id, challan: stmt[i].jw_challan_id, vendor: vendor },
                        type: invtDB.QueryTypes.SELECT,
                    }
                );

                if (stmt_comp.length <= 0) {
                } else {
                    for (let j = 0; j < stmt_comp.length; j++) {
                        let select_res = await invtDB.query(
                            "SELECT COALESCE(SUM(`jw_ven_in_qty`), 0) as `in_qty` FROM `jw_ven_location` WHERE `jw_ven_jw_ref` = :jobwork AND `jw_ven_rm` = :component AND `jw_ven_challan_ref` = :challan",
                            {
                                replacements: {
                                    component: stmt_comp[j].component_key,
                                    jobwork: stmt_comp[j].jw_jobwork_id,
                                    challan: stmt_comp[j].jw_challan_id
                                },
                                type: invtDB.QueryTypes.SELECT,
                            }
                        );
                        let in_qty = 0, jw_qty = 0;
                        if (select_res.length > 0) {
                            in_qty = helper.number(select_res[0].in_qty);
                            jw_qty = helper.number(stmt_comp[j].jw_qty);
                        }

                        finalResult.push({
                            PART_CODE: stmt_comp[j].c_part_no,
                            PART_NAME: stmt_comp[j].c_name,
                            UOM: stmt_comp[j].units_name,
                            TOTAL_QTY: stmt_comp[j].jw_qty,
                            LEFT_QTY: jw_qty - in_qty,
                            RATE: stmt_comp[j].jw_rate,
                            HSN: stmt_comp[j].hsn ?? '--',

                            JOBWORK_ID: stmt[i].jw_jobwork_id,
                            CHALLAN_ID: stmt[i].jw_challan_id,
                            INSERT_DATE: moment(stmt[i].jw_insert_dt).tz("Asia/Kolkata").format("DD-MM-YYYY hh:mm A"),
                            INSERT_BY: stmt[i].user_name,
                        });
                    }
                }

            }

            // console.table(finalResult);

            const filePath = "files/excel/";
            try {
                fs.accessSync(filePath + fileName);
            } catch (error) {
                fs.writeFileSync(filePath + fileName, "", "utf8");
            }

            // GENERATE CSV FILE
            const worksheet = XLSX.utils.json_to_sheet(finalResult);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "REQUES PENDING");

            XLSX.write(workbook, { bookType: "csv", type: "buffer" });
            XLSX.writeFile(workbook, filePath + fileName);


            let stmt_update = await otherDB.query("UPDATE user_files_req SET status = 'complete', other_data = :other WHERE user_id= :uid AND req_code = 'VENDOR_REQ_PENDING' AND req_date = :req_date", {
                replacements: {
                    uid: user_id,
                    req_date: data.otherdata.searchValue,
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
                        filename: "VENDOR_REQ_PENDING.csv",
                        content: fs.readFileSync(filePath + fileName),
                    },
                ];

                helper.sendMail(userEmail, "", " Pending Request " + data.otherdata.searchValue + " [File Ready for download] Ref:" + helper.randomNumber(99999, 999999), htmlTemplate(user[0].user_name, new Date(), "Pending Request", `${process.env.SOCKET_API_URL}/${filePath}${fileName}`), attachment);


            }

            emit_notifications(io, socket, data.notificationId ?? 0);


        }); //SOCKET CONNECTION


        async function updateOnError(err, user_id, date) {
            let stmt = await otherDB.query("UPDATE user_files_req SET status = 'complete', other_data = :other , request_txt_label = :request , msg_type = 'msg' WHERE user_id= :uid  AND req_code = 'VR01' AND req_date = :req_date", {
                replacements: {
                    request: "VENDOR_REQ_PENDING" + " - " + err,
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
        emit_error_msg(io, socket, err);
        return
    }
}