const jwt = require("jsonwebtoken");
const { otherDB, invtDB } = require("./../../config/db/connection");
const { report8 } = require("../backendProcess/r8");
const moment = require("moment");
const Validator = require("validatorjs");

const { emit_error_msg, verifyToken, error_log } = require("../utils");
// Add helper import for helper.number
const helper = require("../../helper/helper");

exports.r8Event = function (io, socket) {
    const emit_notifications = async function (notificationId) {
        try {
            token_res = await verifyToken(`${socket.handshake.auth.token}`);
            let user_id = token_res.crn_id;
            let stmt = await otherDB.query("SELECT * FROM `user_files_req` WHERE `user_id` = :uid ORDER BY `ID` DESC", {
                replacements: { uid: user_id },
                type: otherDB.QueryTypes.SELECT,
            });

            if (stmt.length > 0) {
                if (notificationId) {
                    stmt[0] = { ...stmt[0], notificationId: notificationId };
                    io.to(user_id).emit("socket_receive_notification", stmt);
                    // console.log(stmt);
                    console.log("data sent********************************************");
                } else {
                    socket.emit("notification", stmt);
                }
            }
        } catch (err) {
            error_log(err.stack);
        }
    };
    // R8 REPORT
 socket.on("generate_r8_report", async (data) => {
  try {
    // Log incoming data for debugging
    console.log("Received payload:", JSON.stringify(data, null, 2));

    // Verify token
    let check = await verifyToken(`${socket.handshake.auth.token}`);

    // Ensure data is not null/undefined
    if (!data) {
      socket.emit("error", { message: "Request data is missing" });
      return;
    }

    // Extract fields with defaults
    const { otherdata, wise = "datewise", data: skuData = null, advanced = false, notificationId } = data;

    // Validate input data
    let rules = {
      otherdata: "required",
      wise: "required",
    };

    // Only add data rule if wise is skuwise or advanced is true
    if (wise === "skuwise" || advanced) {
      rules.data = "required";
    }

    let validation = new Validator({ otherdata, wise, data: skuData }, rules);

    if (validation.fails()) {
      console.log("Validation errors:", validation.errors.all());
      socket.emit("error", { message: validation.errors.all() });
      return;
    }

    // Check for pending requests
    let check_data = await otherDB.query(
      "SELECT * FROM user_files_req WHERE user_id = :uid AND req_code = 'R8REPORT' AND req_date = :date AND status = 'pending'",
      {
        replacements: {
          uid: check.crn_id,
          date: otherdata,
        },
        type: otherDB.QueryTypes.SELECT,
      }
    );

    if (check_data.length > 0) {
      socket.emit("error", {
        message: "Your request is already pending. Please try after some time or contact your administrator",
      });
      return;
    }

    // Insert request into user_files_req
    let stmt = await otherDB.query(
      "INSERT INTO user_files_req (request_txt_label, req_code, user_id, req_date, msg_type, status, other_data, insert_date) VALUES ('R8 REPORT', 'R8REPORT', :uid, :req_date, 'file', 'pending', :other, :insert_date)",
      {
        replacements: {
          uid: check.crn_id,
          req_date: otherdata,
          other: JSON.stringify({ wise, data: skuData, advanced }),
          insert_date: moment().format("YYYY-MM-DD HH:mm:ss"),
        },
        type: otherDB.QueryTypes.INSERT,
      }
    );

    // Call report8 with helper
    let res = await report8(
      otherdata,
      check.crn_id,
      emit_notifications,
      notificationId,
      socket,
      io,
      "R8REPORT",
      wise,
      skuData,
      advanced,
      helper // Pass helper for helper.number
    );

    if (!res) {
      socket.emit("error", { message: "Report generation failed" });
    }
  } catch (err) {
    error_log({ stack: err.stack });
    socket.emit("error", {
      message: "Internal Error!!! If this condition persists, contact your system administrator",
      error: err.stack,
    });
  }
});
}