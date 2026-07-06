const jwt = require("jsonwebtoken");
const moment = require("moment");

const { otherDB } = require("../../config/db/connection");
const { allCompM } = require("../backendProcess/allComp");
require("dotenv").config();

const { error_log } = require("../utils");

exports.allComp = function (io, socket) {
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
        } else {
          socket.emit("notification", stmt);
        }
      }
    } catch (err) {
      error_log({ stack: err.stack });
    }
  };

  //

  socket.on("allComp", async (data) => {
    try {
      const date = data.otherdata.date.match(/([0-9]{2})-([0-9]{2})-([0-9]{4})/g);
      const fromdate = moment(date[0], "DD-MM-YYYY").format("YYYY-MM-DD");
      const todate = moment(date[1], "DD-MM-YYYY").format("YYYY-MM-DD");

      if (moment(date[1], "DD-MM-YYYY").diff(moment(date[0], "DD-MM-YYYY"), "days") > "90") {
        socket.emit("toastr_error", {
          msg: "on the w.e.f Nov 11, 2021: We can provide you 90 days OR (3 months) data only",
        });
        return;
      }

      console.log("-----------------------------------------------------------");

      let check = await verifyToken(`${socket.handshake.auth.token}`);
      let user_id = check.crn_id;
      let fileName;
      let check_data = await otherDB.query("SELECT * FROM `user_files_req` WHERE `user_id`= :uid AND `req_code` = 'ALLCOMP' AND `req_date` = :date AND `status` = 'pending'", {
        replacements: {
          uid: user_id,
          date: data.otherdata.date,
        },
        type: otherDB.QueryTypes.SELECT,
      });

      if (check_data.length > 0) {
        fileName = JSON.parse(check_data[0].other_data).fileName;
      } else {
        let file_branch = "";
        // A21 R1 store LOCATION
        if (socket.handshake.auth.companyBranch == "BROAKTRC25") {
          file_branch = "A21";
        }
        // B29 R1 store LOCATION
        if (socket.handshake.auth.companyBranch == "BRMSC029") {
          file_branch = "B29";
        }

        fileName = "ALLCOMP-" + file_branch + user_id + Math.floor(Math.random() * 9999) + ".csv";
        let stmt = await otherDB.query(
          "INSERT INTO `user_files_req` (`request_txt_label`, `req_code`, `user_id`, `req_date`, `msg_type` , `status` , `other_data`, `insert_date`,`reactNotificationId` ) VALUES ('ALL COMP', 'ALLCOMP', :uid, :req_date,'file','pending', :other , :insert_date,:notificationId) ",
          {
            replacements: {
              uid: user_id,
              req_date: data.otherdata.date,
              other: JSON.stringify({ fileName: fileName }),
              insert_date: moment().format("YYYY-MM-DD HH:mm:ss"),
              notificationId: data.notificationId ?? 0,
            },
            type: otherDB.QueryTypes.INSERT,
          },
        );
      }

      io.to(user_id).emit("download_start_detail", {
        title: "All Comp",
        details: data.otherdata.date,
        notificationId: data.notificationId,
        status: "pending",
        detailStatus: true,
        type: "file",
      });
      let res = await allCompM(date, user_id, emit_notifications, fileName, data.notificationId, socket, io, socket.handshake.auth.companyBranch);
    } catch (err) {
      error_log({ stack: err.stack });
    }
  });

  function verifyToken(token) {
    return new Promise((resolve, reject) => {
      if (!token) {
        return reject(new Error("No token provided"));
      }

      let cleanToken = token.startsWith("Bearer ") ? token.slice(7) : token;

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
