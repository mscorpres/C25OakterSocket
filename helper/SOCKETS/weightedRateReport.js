const jwt = require("jsonwebtoken");
const moment = require("moment");

const { otherDB } = require("../../config/db/connection");
const { weightedRateReportM } = require("../backendProcess/weightedRateReport");
const { error_log, emit_notifications } = require("../utils");

exports.weightedRateReport = function (io, socket) {

  socket.on("weightedRateReport", async (data) => {
    try {
      // Allow both: data as object or JSON string
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch (e) {
          console.error("[weightedRateReport] invalid JSON string payload");
        }
      }

      // Support both frontend styles:
      // 1) { otherdata: { date: \"..\" } }
      // 2) { date: \"..\" }
      const other = data.otherdata || data || {};
      console.log("[weightedRateReport] received payload:", JSON.stringify(other));
      const rawDate = other.date;

      if (!rawDate && !(other.fromDate && other.toDate)) {
        socket.emit("toastr_error", { msg: "Please select a date or date range." });
        return;
      }

      // Make behaviour consistent with existing allComp.js:
      // - Supports: "DD-MM-YYYY-DD-MM-YYYY" (as single string with both dates)
      // - Also supports: single date "DD-MM-YYYY"
      // - Also supports: explicit fromDate / toDate
      let parsedDateInput;
      if (other.fromDate && other.toDate) {
        // Explicit range
        parsedDateInput = [other.fromDate, other.toDate];
      } else if (typeof rawDate === "string") {
        // Support "DD-MM-YYYY-DD-MM-YYYY" or single "DD-MM-YYYY"
        const matches = rawDate.match(/([0-9]{2})-([0-9]{2})-([0-9]{4})/g);
        if (matches && matches.length === 2) {
          parsedDateInput = matches; // range
        } else {
          parsedDateInput = rawDate; // single date
        }
      } else {
        parsedDateInput = rawDate;
      }

      const check = await verifyToken(`${socket.handshake.auth.token}`);
      const user_id = check.crn_id;

      let fileName;
      const reqDateLabel = Array.isArray(parsedDateInput)
        ? `${parsedDateInput[0]}_to_${parsedDateInput[1]}`
        : String(parsedDateInput);

      const check_data = await otherDB.query(
        "SELECT * FROM user_files_req WHERE user_id = :uid AND req_code = 'WEIGHTEDRATEREPORT' AND req_date = :req_date AND status = 'pending'",
        {
          replacements: { uid: user_id, req_date: reqDateLabel },
          type: otherDB.QueryTypes.SELECT,
        }
      );

      if (check_data.length > 0) {
        const otherData = JSON.parse(check_data[0].other_data || "{}");
        fileName = otherData.fileName;
      } else {
        fileName = "WEIGHTED_RATE_REPORT_" + user_id + "_" + Math.floor(Math.random() * 9999) + ".xlsx";
        await otherDB.query(
          "INSERT INTO user_files_req (request_txt_label, req_code, user_id, req_date, msg_type, status, other_data, insert_date, reactNotificationId) VALUES ('Weighted Rate Report', 'WEIGHTEDRATEREPORT', :uid, :req_date, 'file', 'pending', :other, :insert_date, :notificationId)",
          {
            replacements: {
              uid: user_id,
              req_date: reqDateLabel,
              other: JSON.stringify({ fileName, dateInput: parsedDateInput }),
              insert_date: moment().format("YYYY-MM-DD HH:mm:ss"),
              notificationId: data.notificationId ?? 0,
            },
            type: otherDB.QueryTypes.INSERT,
          }
        );
      }

      io.to(user_id).emit("download_start_detail", {
        title: "Weighted Rate Report",
        details: reqDateLabel,
        notificationId: data.notificationId,
        status: "pending",
        detailStatus: true,
        type: "file",
      });

      const res = await weightedRateReportM(
        parsedDateInput,
        user_id,
        (notificationId) => emit_notifications(io, socket, notificationId),
        fileName,
        data.notificationId,
        socket,
        io,
        reqDateLabel
      );

      if (res.code !== 200) {
        console.log("[weightedRateReport] backend error:", res.msg);
        socket.emit("toastr_error", { msg: res.msg || "Report generation failed." });
      } else {
        console.log("[weightedRateReport] success, file:", fileName);
        // Build download URL so frontend never gets undefined (fixes .../undefined)
        const fileUrl = "./files/excel/" + (fileName || "");
        const baseUrl = (process.env.SOCKET_API_URL || "").replace(/\/$/, "");
        const fullFileUrl = baseUrl ? baseUrl + "/files/excel/" + (fileName || "") : fileUrl;
        // Explicitly notify frontend that the download is ready to stop loader,
        // matching behaviour of other long-running reports (R18, R8, etc.)
        io.to(user_id).emit("download_start_detail", {
          title: "Weighted Rate Report",
          details: reqDateLabel,
          notificationId: data.notificationId,
          status: "complete",
          detailStatus: true,
          type: "file",
          fileName: fileName || "",
          fileUrl: fileUrl,
          fullFileUrl: fullFileUrl,
        });
      }
    } catch (err) {
      console.error("[weightedRateReport] catch:", err.message || err);
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
