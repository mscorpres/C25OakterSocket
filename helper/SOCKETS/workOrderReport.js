const { otherDB } = require("./../../config/db/connection");
const { generateWODeliveryChallanReport } = require("../backendProcess/wo");
const moment = require("moment");
const Validator = require("validatorjs");
const { error_log } = require("../utils");

exports.woDeliveryChallanEvent = function (io, socket) {
  console.log("Client connected:", socket.id);

  const emit_notifications = async function (notificationId) {
    try {
      const user_id = "CRN615672"; // Hardcoded for testing
      console.log("Using test user_id for notifications:", user_id);

      const stmt = await otherDB.query("SELECT * FROM `user_files_req` WHERE `user_id` = :uid ORDER BY `ID` DESC", {
        replacements: { uid: user_id },
        type: otherDB.QueryTypes.SELECT,
      });

      console.log("Notifications query result:", stmt.length, "records");

      if (stmt.length > 0) {
        if (notificationId) {
          stmt[0] = { ...stmt[0], notificationId: notificationId };
          io.to(user_id).emit("socket_receive_notification", stmt);
          console.log("Notification sent for WO Delivery Challan Report:", notificationId);
        } else {
          socket.emit("notification", stmt);
          console.log("General notification sent to user:", user_id);
        }
      } else {
        console.log("No notifications found for user:", user_id);
      }
    } catch (err) {
      console.error("Error in emit_notifications:", err.message);
      error_log({ stack: err.stack });
      socket.emit("error", {
        message: "Failed to send notification",
        error: err.message,
        code: "NOTIFICATION_ERROR",
      });
    }
  };

  socket.on("generate_wo_delivery_challan_report", async (payload) => {
    try {
      console.log("Raw payload received:", payload);
      console.log("Payload type:", typeof payload);

      let parsedPayload = payload;
      if (typeof payload === "string") {
        console.log("Payload is a string, attempting to parse...");
        try {
          parsedPayload = JSON.parse(payload);
          console.log("Parsed payload:", JSON.stringify(parsedPayload, null, 2));
        } catch (parseErr) {
          console.error("Failed to parse stringified payload:", parseErr.message);
          socket.emit("error", { message: "Invalid payload: failed to parse JSON", code: "INVALID_PAYLOAD" });
          return;
        }
      }

      if (!parsedPayload || typeof parsedPayload !== "object") {
        console.log("Invalid payload: not an object or null");
        socket.emit("error", { message: "Invalid payload: must be an object", code: "INVALID_PAYLOAD" });
        return;
      }

      const { data: date, wise = "datewise", notificationId, type = "delivery" } = parsedPayload;

      console.log("Extracted fields:", { date, wise, notificationId, type });

      let rules = {
        data: "required",
        wise: "required|in:datewise",
        type: "required|in:delivery,return,scrape,all",
      };

      let validation = new Validator({ data: date, wise, type }, rules);

      if (validation.fails()) {
        const errorMsg = JSON.stringify(validation.errors.all());
        console.log("Validation errors:", errorMsg);
        socket.emit("error", { message: errorMsg, code: "VALIDATION_ERROR" });
        return;
      }

      const user_id = "CRN615672"; // Hardcoded for testing
      const branch = "BROAKTRC25"; // Hardcoded for testing
      console.log("Using test user_id:", user_id, "and branch:", branch);

      console.log("Checking for pending requests for user:", user_id, "date:", date);
      const check_data = await otherDB.query("SELECT * FROM user_files_req WHERE user_id = :uid AND req_code = 'WODELIVERYCHALLAN' AND req_date = :date AND status = 'pending'", {
        replacements: { uid: user_id, date },
        type: otherDB.QueryTypes.SELECT,
      });

      console.log("Pending requests found:", check_data.length);

      if (check_data.length > 0) {
        console.log("Pending request found for user:", user_id);
        socket.emit("error", {
          message: "Your request is already pending. Please try after some time or contact your administrator",
          code: "PENDING_REQUEST",
        });
        return;
      }

      console.log("Inserting request into user_files_req for user:", user_id);
      const stmt = await otherDB.query(
        "INSERT INTO user_files_req (request_txt_label, req_code, user_id, req_date, msg_type, status, other_data, insert_date) VALUES ('WO Delivery Challan Report', 'WODELIVERYCHALLAN', :uid, :req_date, 'file', 'pending', :other, :insert_date)",
        {
          replacements: {
            uid: user_id,
            req_date: date,
            other: JSON.stringify({ wise, type }),
            insert_date: moment().format("YYYY-MM-DD HH:mm:ss"),
          },
          type: otherDB.QueryTypes.INSERT,
        },
      );
      console.log("Inserted request into user_files_req:", stmt);

      console.log("Calling generateWODeliveryChallanReport with date:", date, "wise:", wise, "type:", type);
      const res = await generateWODeliveryChallanReport(date, user_id, emit_notifications, notificationId, socket, io, "WODELIVERYCHALLAN", wise, branch, type);

      if (!res) {
        console.log("Report generation failed for user:", user_id);
        socket.emit("error", { message: "Report generation failed", code: "REPORT_GENERATION_FAILED" });
      } else {
        console.log("Report generation initiated for user:", user_id);
      }
    } catch (err) {
      console.error("Error in generate_wo_delivery_challan_report:", err.message);
      error_log({ stack: err.stack });
      socket.emit("error", {
        message: "Internal Error!!! If this condition persists, contact your system administrator",
        error: err.message,
        code: "INTERNAL_ERROR",
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
};
