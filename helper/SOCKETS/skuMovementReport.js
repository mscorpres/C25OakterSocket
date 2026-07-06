const jwt = require("jsonwebtoken");
const moment = require("moment");

const { otherDB } = require("../../config/db/connection");
const { skuMovementReport } = require("../backendProcess/skuMovementReport");
const { error_log } = require("../utils");

exports.skuMovementReport = function (io, socket) {
  const emit_notifications = async function (notificationId) {
    try {
      const token_res = await verifyToken(`${socket.handshake.auth.token}`);
      const user_id = token_res.crn_id;
      const stmt = await otherDB.query("SELECT * FROM user_files_req WHERE user_id = :uid ORDER BY ID DESC", {
        replacements: { uid: user_id },
        type: otherDB.QueryTypes.SELECT,
      });
      if (stmt.length > 0) {
        if (notificationId) {
          stmt[0] = { ...stmt[0], notificationId };
          io.to(user_id).emit("socket_receive_notification", stmt);
        } else {
          socket.emit("notification", stmt);
        }
      }
    } catch (err) {
      error_log({ stack: err.stack });
    }
  };

  socket.on("skuMovementReport", async (data) => {
    try {
      // Allow stringified JSON too (like weightedRateReport)
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch (e) {
          console.error("[skuMovementReport] invalid JSON string payload");
        }
      }

      const other = data.otherdata || data || {};
      console.log("[skuMovementReport] received payload:", JSON.stringify(other));

      // Frontend sends: { date: "01-03-2026-14-03-2026", type: "IN" }
      const rawDate = other.date || other.from_date || other.fromDate;
      const from_date = other.from_date || other.fromDate;
      const to_date = other.to_date || other.toDate;

      let fromDateParsed = from_date;
      let toDateParsed = to_date;
      if (rawDate && typeof rawDate === "string") {
        const matches = rawDate.match(/([0-9]{2})-([0-9]{2})-([0-9]{4})/g);
        if (matches && matches.length >= 2) {
          fromDateParsed = matches[0];
          toDateParsed = matches[1];
        } else if (matches && matches.length === 1) {
          fromDateParsed = matches[0];
          toDateParsed = matches[0];
        }
      }

      // type = IN/OUT (frontend), or transaction_type / filter_type
      const transaction_type =
        (other.type || other.transaction_type || other.filter_type || other.transactionType || "BOTH").toString().toUpperCase();

      if (!fromDateParsed || !toDateParsed) {
        socket.emit("toastr_error", { msg: "Please provide date range (e.g. date: \"DD-MM-YYYY-DD-MM-YYYY\" or from_date & to_date)." });
        return;
      }

      const check = await verifyToken(`${socket.handshake.auth.token}`);
      const user_id = check.crn_id;

      const rangeLabel = `${transaction_type}_${fromDateParsed}_to_${toDateParsed}`;

      let fileName;
      const check_data = await otherDB.query(
        "SELECT * FROM user_files_req WHERE user_id = :uid AND req_code = 'SKUMOVEMENT' AND req_date = :req_date AND status = 'pending'",
        {
          replacements: { uid: user_id, req_date: rangeLabel },
          type: otherDB.QueryTypes.SELECT,
        }
      );

      if (check_data.length > 0) {
        const otherData = JSON.parse(check_data[0].other_data || "{}");
        fileName = otherData.fileName;
      } else {
        fileName =
          "SKU_MOVEMENT_" + user_id + "_" + Math.floor(Math.random() * 9999) + ".xlsx";
        await otherDB.query(
          "INSERT INTO user_files_req (request_txt_label, req_code, user_id, req_date, msg_type, status, other_data, insert_date, reactNotificationId) VALUES ('SKU Movement Report', 'SKUMOVEMENT', :uid, :req_date, 'file', 'pending', :other, :insert_date, :notificationId)",
          {
            replacements: {
              uid: user_id,
              req_date: rangeLabel,
              other: JSON.stringify({
                fileName,
                from_date: fromDateParsed,
                to_date: toDateParsed,
                transaction_type,
              }),
              insert_date: moment().format("YYYY-MM-DD HH:mm:ss"),
              notificationId: data.notificationId ?? 0,
            },
            type: otherDB.QueryTypes.INSERT,
          }
        );
      }

      io.to(user_id).emit("download_start_detail", {
        title: "SKU Movement Report",
        details: rangeLabel,
        notificationId: data.notificationId,
        status: "pending",
        detailStatus: true,
        type: "file",
      });

      const result = await skuMovementReport({
        from_date: fromDateParsed,
        to_date: toDateParsed,
        transaction_type,
        fileName,
      });

      if (result.code !== 200) {
        console.log("[skuMovementReport] backend error:", result.msg);
        socket.emit("toastr_error", { msg: result.msg || "Report generation failed." });
        // mark request failed
        await otherDB.query(
          "UPDATE user_files_req SET status = 'failed' WHERE user_id = :uid AND req_code = 'SKUMOVEMENT' AND req_date = :req_date AND status = 'pending'",
          {
            replacements: { uid: user_id, req_date: rangeLabel },
            type: otherDB.QueryTypes.UPDATE,
          }
        );
      } else {
        // mark request complete and store file info
        await otherDB.query(
          "UPDATE user_files_req SET status = 'complete', other_data = :other WHERE user_id = :uid AND req_code = 'SKUMOVEMENT' AND req_date = :req_date",
          {
            replacements: {
              uid: user_id,
              req_date: rangeLabel,
              other: JSON.stringify({
                fileName,
                fileUrl: "./files/excel/" + fileName,
              }),
            },
            type: otherDB.QueryTypes.UPDATE,
          }
        );
        emit_notifications(data.notificationId ?? 0);
        console.log("[skuMovementReport] success, file:", fileName);
      }
    } catch (err) {
      console.error("[skuMovementReport] catch:", err.message || err);
      error_log({ stack: err.stack });
      socket.emit("toastr_error", { msg: err.message || "Request failed." });
    }
  });

  function verifyToken(token) {
    return new Promise((resolve, reject) => {
      if (!token) {
        return reject(new Error("No token provided"));
      }
  
      let cleanToken = token.startsWith("Bearer ")
        ? token.slice(7)
        : token;
  
      jwt.verify(cleanToken, process.env.TOKEN_SECRET, (err, decoded) => {
        if (err) {
          reject(err);
        } else {
          resolve(decoded);
        }
      });
    });
  }
};

