const jwt = require("jsonwebtoken");
const { otherDB, invtDB } = require("../../../config/db/connection");
const moment = require("moment");
const { verifyToken, error_log, emit_notifications, emit_error_msg } = require("../../../helper/utils");
require("dotenv").config();

exports.allCompLocation = async function (io, socket) {
    try {

        socket.on("allCompLocation", async (data) => {
            let token_res = await verifyToken(`${socket.handshake.auth.token}`);
            let user_id = token_res.crn_id;
            let fileName;

            let check_data = await otherDB.query("SELECT * FROM user_files_req WHERE user_id= :uid AND req_code = 'ALLCOMPLOC' AND req_date = :date AND status = 'pending'", {
                replacements: {
                    uid: user_id,
                    date: data.otherdata.date,
                },
                type: otherDB.QueryTypes.SELECT,
            });
            if (check_data.length > 0) {
                fileName = JSON.parse(check_data[0].other_data).fileName;
            }
            fileName = "ALLCOMPLOC-" + user_id + Math.floor(Math.random() * 9999) + ".csv";

            let stmt = await otherDB.query("INSERT INTO user_files_req (request_txt_label, req_code, user_id, req_date, msg_type , status , other_data, insert_date,reactNotificationId ) VALUES ('ALL COMP Location', 'ALLCOMPLOC', :uid, :req_date,'file','pending', :other , :insert_date,:notificationId) ", {
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
                title: "All Comp",
                details: data.otherdata.date,
                notificationId: data.notificationId,
                status: "pending",
                detailStatus: true,
                type: "file",
              });


              let res = await require("../../backendProcess/allCompLoc").allCompLocation(data.otherdata.date, user_id, emit_notifications, fileName, data.notificationId, socket, io, data.otherdata.location);


        });


    }
    catch (err) {
        error_log({ stack: err.stack });
    }
}