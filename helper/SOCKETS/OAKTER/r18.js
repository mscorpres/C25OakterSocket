const jwt = require("jsonwebtoken");
const { otherDB, invtDB } = require("../../../config/db/connection");
const moment = require("moment");
const { verifyToken, error_log, emit_notifications, emit_error_msg } = require("../../../helper/utils");
require("dotenv").config();

exports.r18 = async function (io, socket) {
  try {
    socket.on("generate_r18", async (data) => {
      try {
        console.log("generate_r18 payload received:", JSON.stringify(data, null, 2)); // Debug input

        // Verify token and get user_id
        const token_res = await verifyToken(`${socket.handshake.auth.token}`);
        const user_id = token_res.crn_id;

        // Generate unique file name
        let fileName;
        const check_data = await otherDB.query(
          "SELECT * FROM user_files_req WHERE user_id = :uid AND req_code = 'R18' AND req_date = :date AND status = 'pending'",
          {
            replacements: {
              uid: user_id,
              date: data.otherdata.date,
            },
            type: otherDB.QueryTypes.SELECT,
          }
        );

        if (check_data.length > 0) {
          fileName = JSON.parse(check_data[0].other_data).fileName;
        } else {
          fileName = `R18Report-${user_id}-${Date.now()}.csv`; // Unique fileName
          await otherDB.query(
            "INSERT INTO user_files_req (request_txt_label, req_code, user_id, req_date, msg_type, status, other_data, insert_date, reactNotificationId) VALUES ('R18 Report', 'R18', :uid, :req_date, 'file', 'pending', :other, :insert_date, :notificationId)",
            {
              replacements: {
                uid: user_id,
                req_date: data.otherdata.date,
                other: JSON.stringify({ fileName }),
                insert_date: moment().format("YYYY-MM-DD HH:mm:ss"),
                notificationId: data.notificationId ?? 0,
              },
              type: otherDB.QueryTypes.INSERT,
            }
          );
        }

        // Emit download start notification
        io.to(user_id).emit("download_start_detail", {
          title: "R18 Report",
          details: `${data.otherdata.for_location} - ${data.otherdata.date}`,
          notificationId: data.notificationId ?? 0,
          status: "pending",
          detailStatus: true,
          type: "file",
        });

        // Call the processing function
        await require("../../backendProcess/r18Process").r18(
          data.otherdata.date,
          user_id,
          emit_notifications,
          fileName,
          data.notificationId,
          socket,
          io,
          data.otherdata.for_location
        );
      } catch (err) {
        console.error("Error in r18.js:", err.message, err.stack);
        error_log({ stack: err.stack, message: err.message });
        emit_error_msg(io, socket, `Failed to initiate R18 report generation: ${err.message}`);
      }
    });
  } catch (err) {
    console.error("Error in socket listener setup:", err.message, err.stack);
    error_log({ stack: err.stack, message: err.message });
  }
};