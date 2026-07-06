const jwt = require("jsonwebtoken");
const { otherDB, invtDB } = require("../../../config/db/connection");
const moment = require("moment");
const { verifyToken, error_log, emit_notifications, emit_error_msg } = require("../../../helper/utils");

const { materialIssue } = require("./dayBooks/materialIssue");
const { report8 } = require("../../backendProcess/r8");

const { materialTransferToJWT } = require("./dayBooks/materialTransferToJWT");
const { materialReceiveFromJWT } = require("./dayBooks/materialReceiveFromJWT");
const { productionOfFGS } = require("./dayBooks/productionOfFGS");
const { sfToSfTransfer } = require("./dayBooks/sfToSfTransfer");

exports.dayBookEvent = function (io, socket) {

    // Material ISSUE to Prod
    socket.on("dayBookMaterialIssueReport", async (data) => {
        try {

            let check = await verifyToken(`${socket.handshake.auth.token}`);
            const report_date = moment().format("YYYY-MM-DD");
                        let check_data = await otherDB.query(
                "SELECT * FROM user_files_req WHERE user_id= :uid AND req_code = 'DAYBOOKMATERIALISSUE' AND req_date = :date",
                {
                    replacements: {
                                                uid: check.crn_id,
                        date: report_date,
                    },
                    type: otherDB.QueryTypes.SELECT,
                }
            );

            if (check_data.length > 0) {
                if (check_data[0].status == "complete") {
                    emit_error_msg(io, socket, "Material Issue Report Already Generated");
                    return;
                }
            }

            let stmt = await otherDB.query(
                "INSERT INTO user_files_req ( request_txt_label,  req_code, user_id , req_date, msg_type , status , other_data, insert_date ) VALUES ('DAY BOOK MATERIAL ISSUE', 'DAYBOOKMATERIALISSUE', :uid, :req_date ,'file','pending', :other, :insert_date ) ",
                {
                    replacements: {
                                                uid: check.crn_id,
                        req_date: report_date,
                        other: JSON.stringify({}),
                        insert_date: moment().format("YYYY-MM-DD HH:mm:ss"),
                    },
                    type: otherDB.QueryTypes.INSERT,
                }
            );


            let res = await materialIssue(
                report_date,
                check.crn_id,
                emit_notifications,
                data.notificationId,
                socket,
                io
            );
        } catch (err) {
            error_log({ stack: err.stack });
        }
    });

    // Consumption of Production
    socket.on("dayBookConsumptionReport", async (data) => {
        try {
            let check = await verifyToken(`${socket.handshake.auth.token}`);
            const req_code = "DAYBOOKCONSUMPTION";
            const report_date = moment().format("DD-MM-YYYY") + "-" + moment().format("DD-MM-YYYY");

            let check_data = await otherDB.query(
                "SELECT * FROM user_files_req WHERE user_id= :uid AND req_code = :req_code AND req_date = :date AND status = 'pending'",
                {
                    replacements: {
                        req_code: req_code,
                        uid: check.crn_id,
                        date: report_date,
                    },
                    type: otherDB.QueryTypes.SELECT,
                }
            );

            if (check_data.length > 0) {
                return;
            }

            let stmt = await otherDB.query(
                "INSERT INTO user_files_req ( request_txt_label,  req_code, user_id , req_date, msg_type , status , other_data, insert_date ) VALUES ('DAY BOOK CONSUMPTION', :req_code, :uid, :req_date ,'file','pending', :other, :insert_date ) ",
                {
                    replacements: {
                        uid: check.crn_id,
                        req_code: req_code,
                        req_date: report_date,
                        other: JSON.stringify({}),
                        insert_date: moment().format("YYYY-MM-DD HH:mm:ss"),
                    },
                    type: otherDB.QueryTypes.INSERT,
                }
            );


            let res = await report8(
                report_date,
                check.crn_id,
                emit_notifications,
                data.notificationId,
                socket,
                io,
                req_code
            );
        } catch (err) {
            error_log({ stack: err.stack });
        }
    });

    // Material Transfer to JW
    socket.on("materialTransferToJW", async (data) => {
        try {
            let check = await verifyToken(`${socket.handshake.auth.token}`);
            const report_date =  moment().format("DD-MM-YYYY") + "-" + moment().format("DD-MM-YYYY");;
            const req_code = "MATERIAL_TRANSFER_TO_JW";

            // Check if there is any pending material transfer JW
            let check_data = await otherDB.query(
                "SELECT * FROM user_files_req WHERE user_id = :uid AND req_code = :req_code AND req_date = :date",
                {
                    replacements: {
                        uid: check.crn_id,
                        req_code: req_code,
                        date: report_date,
                    },
                    type: otherDB.QueryTypes.SELECT,
                }
            );

            if (check_data.length > 0) {
                // if (check_data[0].status == "complete") {
                //     emit_error_msg(io, socket, "Material Transfer Report Already Generated");
                //     return
                // }
            }
            let stmt = await otherDB.query(
                "INSERT INTO user_files_req (request_txt_label, req_code, user_id, req_date, msg_type, status, other_data, insert_date) VALUES ('Material Transfer', :req_code , :uid, :req_date, 'file', 'pending', :other, :insert_date)",
                {
                    replacements: {
                        uid: check.crn_id,
                        req_code: req_code,
                        req_date: report_date,
                        other: JSON.stringify({}),
                        insert_date: moment().format("YYYY-MM-DD HH:mm:ss"),
                    },
                    type: otherDB.QueryTypes.INSERT,
                }
            );



            // Call the materialTransferToJW function to process the material transfer
            let res = await materialTransferToJWT(
                report_date,
                check.crn_id,
                emit_notifications,
                data.notificationId,
                socket,
                io,
                req_code
            );
        } catch (err) {
            error_log({ stack: err.stack });
        }
    });

    // Material Recive from JW
    // Material Consumption By JW
    socket.on("materialReceiveFromJW", async (data) => {
        try {
            let check = await verifyToken(`${socket.handshake.auth.token}`);
            const report_date = moment().format("YYYY-MM-DD");
            const req_code = "MATERIAL_RECEIVE_FROM_JW";

            // Check if there is any pending material transfer JW
            let check_data = await otherDB.query(
                "SELECT * FROM user_files_req WHERE user_id = :uid AND req_code = :req_code AND req_date = :date", {
                replacements: {
                    uid: check.crn_id,
                    req_code: req_code,
                    date: report_date,
                },
                type: otherDB.QueryTypes.SELECT,
            });

            if (check_data.length > 0) {
                if (check_data[0].status == "complete") {
                    emit_error_msg(io, socket, "Material Receive From JW Report Already Generated");
                    return
                }
            }

            let stmt = await otherDB.query(
                "INSERT INTO user_files_req (request_txt_label, req_code, user_id, req_date, msg_type, status, other_data, insert_date) VALUES ('Material Receive From JW', :req_code , :uid, :req_date, 'file', 'pending', :other, :insert_date)",
                {
                    replacements: {
                        uid: check.crn_id,
                        req_code: req_code,
                        req_date: report_date,
                        other: JSON.stringify({}),
                        insert_date: moment().format("YYYY-MM-DD HH:mm:ss"),
                    },
                    type: otherDB.QueryTypes.INSERT,
                }
            );

            const res = await materialReceiveFromJWT(
                report_date,
                check.crn_id,
                emit_notifications,
                data.notificationId,
                socket,
                io
            )


        } catch (err) {
            error_log({ stack: err.stack });
        }

    })


    // Production Of Fgs
    socket.on("productionOfFGS", async (data) => {
        try {
            let check = await verifyToken(`${socket.handshake.auth.token}`);
            // const report_date = moment().format("YYYY-MM-DD");
            const report_date = "2023-10-10";
            const req_code = "PRODUCTION_OF_FGS";

            // Check if there is any pending material transfer JW
            let check_data = await otherDB.query(
                "SELECT * FROM user_files_req WHERE user_id = :uid AND req_code = :req_code AND req_date = :date", {
                replacements: {
                    uid: check.crn_id,
                    req_code: req_code,
                    date: report_date,
                },
                type: otherDB.QueryTypes.SELECT,
            });

            if (check_data.length > 0) {
                if (check_data[0].status == "complete") {
                    emit_error_msg(io, socket, "Production Of FGS Report Already Generated");
                    return
                }
            }

            let stmt = await otherDB.query("INSERT INTO user_files_req (request_txt_label, req_code, user_id, req_date, msg_type, status, other_data, insert_date) VALUES ('Production Of FGS', :req_code , :uid, :req_date, 'file', 'pending', :other, :insert_date)", {
                replacements: {
                    uid: check.crn_id,
                    req_code: req_code,
                    req_date: report_date,
                    other: JSON.stringify({}),
                    insert_date: moment().format("YYYY-MM-DD HH:mm:ss"),
                },
                type: otherDB.QueryTypes.INSERT,
            })

            const res = await productionOfFGS(
                report_date,
                check.crn_id,
                emit_notifications,
                data.notificationId,
                socket,
                io
            )

        }
        catch (err) {
            error_log({ stack: err.stack });
        }
    })

    // SF TO SF Transfer
    socket.on("sfToSfTransfer", async (data) => {
        try {
            let check = await verifyToken(`${socket.handshake.auth.token}`);
            const report_date = moment().format("YYYY-MM-DD");
            const req_code = "SF_TO_SF_TRANSFER";

            // Check if there is any pending material transfer JW
            let check_data = await otherDB.query(
                "SELECT * FROM user_files_req WHERE user_id = :uid AND req_code = :req_code AND req_date = :date", {
                replacements: {
                    uid: check.crn_id,
                    req_code: req_code,
                    date: report_date,
                },
                type: otherDB.QueryTypes.SELECT,
            }
            );

            if (check_data.length > 0) {
                if (check_data[0].status == "complete") {
                    emit_error_msg(io, socket, "SF To SF Transfer Report Already Generated");
                    return
                }
            }

            let stmt = await otherDB.query("INSERT INTO user_files_req (request_txt_label, req_code, user_id, req_date, msg_type, status, other_data, insert_date) VALUES ('Production Of FGS', :req_code , :uid, :req_date, 'file', 'pending', :other, :insert_date)", {
                replacements: {
                    uid: check.crn_id,
                    req_code: req_code,
                    req_date: report_date,
                    other: JSON.stringify({}),
                    insert_date: moment().format("YYYY-MM-DD HH:mm:ss"),
                },
                type: otherDB.QueryTypes.INSERT,
            });

            const res = await sfToSfTransfer(
                report_date,
                check.crn_id,
                emit_notifications,
                data.notificationId,
                socket,
                io
            )

        } catch (err) {
            error_log({ stack: err.stack });
        }
    })

}