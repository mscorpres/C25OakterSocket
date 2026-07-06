const path = require("path");
const moment = require("moment");
const XLSX = require("xlsx");
const jwt = require("jsonwebtoken");
const Validator = require("validatorjs");
const fs = require("fs");

const helper = require("../../../helper/helper");
const { otherDB, invtDB , tallyDB } = require("../../../config/db/connection");

const { htmlTemplate } = require("../../backendProcess/EmailTemplate/fileDownload");


const { verifyToken, error_log, emit_notifications, emit_error_msg } = require("../../../helper/utils");

exports.q6 = async (io, socket, data) => {

    try {

        socket.on("q6Report", async (data) => {

            const validation = new Validator({
                date: data.otherdata.date
            }, {
                date: "required",
            });

            if (validation.fails()) {
                emit_error_msg(io, socket, "Please select date");
                return;
            }


            // 

            console.log("start");


            const token_res = await verifyToken(`${socket.handshake.auth.token}`);
            const user_id = token_res.crn_id;

            let fileName = "";
            const check_data = await otherDB.query("SELECT * FROM user_files_req WHERE user_id= :uid AND req_code = 'Q6' AND req_date = :date AND status = 'pending'", {
                replacements: {
                    uid: user_id,
                    date: data.otherdata.date,
                },
                type: otherDB.QueryTypes.SELECT,
            });

            if (check_data.length > 0) {
                fileName = JSON.parse(check_data[0].other_data).fileName;
            } else {
                fileName = "Q6Report-" + user_id + Math.floor(Math.random() * 9999) + ".csv";
                // CREATE NEW REQUEST
                const stmt_create_req = await otherDB.query("INSERT INTO user_files_req (request_txt_label, req_code, user_id, req_date, msg_type , status , other_data, insert_date,reactNotificationId ) VALUES ('Q6 Report', 'Q6', :uid, :req_date,'file','pending', :other , :insert_date,:notificationId) ", {
                    replacements: {
                        uid: user_id,
                        req_date: data.otherdata.date,
                        other: JSON.stringify({ fileName: fileName }),
                        insert_date: moment().format("YYYY-MM-DD HH:mm:ss"),
                        notificationId: data.notificationId ?? 0,
                    },
                    type: otherDB.QueryTypes.INSERT,
                });
            }

            io.to(user_id).emit("download_start_detail", {
                title: "Q6 Report",
                details: data.otherdata.date,
                notificationId: data.notificationId ?? 0,
                status: "pending",
                detailStatus: true,
                type: "file",
            });
            // 



            const date = data.otherdata.date.match(/([0-9]{2})-([0-9]{2})-([0-9]{4})/g);
            const fromdate = moment(date[0], "DD-MM-YYYY").format("YYYY-MM-DD");
            const todate = moment(date[1], "DD-MM-YYYY").format("YYYY-MM-DD");

            const stmt_all_comp = await invtDB.query("SELECT `c_part_no`, `component_key` FROM `components` WHERE `c_type` != 'S' AND `c_is_enabled` = 'Y'", {
                type: invtDB.QueryTypes.SELECT,
            });

            if (stmt_all_comp.length === 0) {
                emit_error_msg(io, socket, "Component not found");
                return;
            }

            const promises = [];

            const responsesData = [];
            promises.push(
                (async () => {
                    const stmt = await invtDB.query(
                        `SELECT 
                      components_id,
                      COALESCE(SUM(CASE WHEN trans_type = 'INWARD' AND in_module IN ('--','IN-PO','IN-MIN') AND vendor_type = 'v01' AND (DATE_FORMAT(insert_date, '%Y-%m-%d') BETWEEN :datefrom AND :dateto) THEN qty ELSE 0 END), 0) AS inward,
                      COALESCE(SUM(CASE WHEN trans_type IN ('CONSUMPTION','REJECTION','JOBWORK') AND (DATE_FORMAT(insert_date, '%Y-%m-%d') BETWEEN :datefrom AND :dateto) THEN qty ELSE 0 END), 0) AS outward,
                      COALESCE(SUM(CASE WHEN trans_type = 'ISSUE' AND loc_in IN ('20210921120435', '20211028124102', '20220715174205', '1690460862638') AND (DATE_FORMAT(insert_date, '%Y-%m-%d') BETWEEN :datefrom AND :dateto) THEN qty ELSE 0 END), 0) AS consumption,
                      COALESCE(SUM(CASE WHEN trans_type = 'INWARD' AND in_module IN ('--','IN-MIN','IN-JWI') AND vendor_type IN ('p01','j01') AND (DATE_FORMAT(insert_date, '%Y-%m-%d') BETWEEN :datefrom AND :dateto) THEN qty ELSE 0 END), 0) AS otherinward,
                      COALESCE(SUM(CASE WHEN trans_type = 'INWARD' AND in_module IN ('--','IN-PO','IN-MIN') AND vendor_type = 'v01' AND DATE_FORMAT(insert_date, '%Y-%m-%d') < :datefrom THEN qty ELSE 0 END), 0) AS totalOB_in,
                      COALESCE(SUM(CASE WHEN trans_type IN ('CONSUMPTION','REJECTION','JOBWORK') AND DATE_FORMAT(insert_date, '%Y-%m-%d') < :datefrom THEN qty ELSE 0 END), 0) AS totalOB_out,
                      COALESCE(SUM(CASE WHEN trans_type = 'ISSUE' AND loc_in IN ('20210921120435', '20211028124102', '20220715174205', '1690460862638') AND DATE_FORMAT(insert_date, '%Y-%m-%d') < :datefrom THEN qty ELSE 0 END), 0) AS OB_consumption,
                      COALESCE(SUM(CASE WHEN trans_type = 'INWARD' AND in_module IN ('--','IN-MIN','IN-JWI') AND vendor_type IN ('p01','j01') AND DATE_FORMAT(insert_date, '%Y-%m-%d') < :datefrom THEN qty ELSE 0 END), 0) AS OB_otherinward
                    FROM rm_location rm
                    WHERE components_id IN (SELECT component_key FROM components)
                    GROUP BY components_id`,
                        {
                            replacements: {
                                datefrom: fromdate,
                                dateto: todate,
                            },
                            type: invtDB.QueryTypes.SELECT,
                        }
                    );

                    const queries = stmt.map(async (row) => {
                        const component_key = row.components_id;
                        const inward_all_qty = helper.number(row.inward);
                        const outward_all_qty = helper.number(row.outward) + helper.number(row.consumption);
                        const otherinward_all_qty = helper.number(row.otherinward);
                        const opening_balance = helper.number(row.totalOB_in - (row.totalOB_out + row.OB_consumption) + row.OB_otherinward);
                        const closing_balance = helper.number(opening_balance + (inward_all_qty - (outward_all_qty)) + otherinward_all_qty);

                        const part_no = await invtDB.query("SELECT c_part_no, c_name, c_new_part_no FROM components WHERE component_key = :component_id ORDER BY ID ASC", {
                            replacements: {
                                component_id: component_key
                            },
                            type: invtDB.QueryTypes.SELECT
                        });

                        const part_code = part_no[0].c_part_no;
                        const part_name = part_no[0].c_name;
                        const sec_part_code = part_no[0].c_new_part_no;

                        const getVbtStock = await tallyDB.query("SELECT COALESCE(SUM(vbt_inqty), 0) AS vbt_inqty FROM tally_vbt WHERE part_code = :partCode AND (DATE_FORMAT(effective_date, '%Y-%m-%d') BETWEEN :datefrom AND :dateto) AND vbt_type != 'VBT06' AND vbt_debit_key = '--' GROUP BY part_code", {
                            replacements: {
                                partCode: component_key,
                                datefrom: fromdate,
                                dateto: todate,
                            },
                            type: tallyDB.QueryTypes.SELECT
                        });

                        const getDNStock = await tallyDB.query("SELECT COALESCE(SUM(vbt_inqty), 0) AS dnQty FROM tally_vbt WHERE part_code = :partCode AND (DATE_FORMAT(effective_date, '%Y-%m-%d') BETWEEN :datefrom AND :dateto) AND vbt_type != 'VBT06' AND vbt_debit_key != '--' GROUP BY part_code", {
                            replacements: {
                                partCode: component_key,
                                datefrom: fromdate,
                                dateto: todate,
                            },
                            type: tallyDB.QueryTypes.SELECT
                        });

                        responsesData.push({
                            "Part Code": part_code,
                            "Cat Part Code": sec_part_code,
                            "Part Name": part_name,
                            "Opening Stock": opening_balance,
                            "In": inward_all_qty,
                            "Other's In": otherinward_all_qty,
                            "Out": outward_all_qty,
                            "Closing Stock": closing_balance,
                            "Purchase Qty": (getVbtStock[0]?.vbt_inqty ?? 0) - (getDNStock[0]?.dnQty ?? 0)
                        });
                    });
                    await Promise.all(queries);
                })()
            );

            await Promise.all(promises);

            const worksheet = XLSX.utils.json_to_sheet(responsesData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Weekly Audit");

            const filePath = "./files/excel/";

            XLSX.writeFile(workbook, filePath + fileName);

            let stmt = await otherDB.query("UPDATE user_files_req SET status = 'complete', other_data = :other WHERE user_id= :uid AND req_code = 'Q6' AND req_date = :req_date", {
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

        })

    }
    catch (err) {
        error_log({ stack: err.stack });
        return emit_error_msg(io, socket, "Something went wrong to generate report  . Please try again later");
    }

}