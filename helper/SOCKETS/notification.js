const jwt = require("jsonwebtoken");
const { otherDB } = require("./../../config/db/connection");
const moment = require("moment");

exports.notification = function (io, socket) {
  if (socket) {
    socket.on("fetch_notifications", async (data) => {
      try {
        token_res = await verifyToken(`${socket.handshake.auth.token}`);
        let user_id = token_res.crn_id;

        let modules = ["INVT", "FINANCE"];

        let query = "SELECT * FROM `user_files_req` WHERE `user_id` = :user_id AND `module_name` IN (";
        query += modules.map(module => `'${module}'`).join(', ');
        query += ") ORDER BY `ID` DESC";

        let stmt_0 = await otherDB.query(query, {
          replacements: {
            user_id: user_id
          },
          type: otherDB.QueryTypes.SELECT,
        });
		  
        let final_data = [];
        if (stmt_0.length > 0) {
          let stmt_1 = await otherDB.query("SELECT COUNT(CASE WHEN `msg_type` LIKE 'msg' THEN 0 END) AS `push_msg`, COUNT(CASE WHEN `msg_type` LIKE 'file' THEN 0 END) AS `file_msg`, COUNT(CASE WHEN `msg_type` LIKE 'btn' THEN 0 END) AS `btn_msg` FROM `user_files_req` WHERE `user_id` = :user_id ORDER BY `ID` DESC", {
            replacements: { user_id: user_id },
            type: otherDB.QueryTypes.SELECT,
          });
          for (let i = 0; i < stmt_0.length; i++) {
            final_data.push({
              insert_date: moment(stmt_0[i].insert_date, "YYYY-MM-DD HH:mm:ss").fromNow(),
              msg_type: stmt_0[i].msg_type,
              other_data: stmt_0[i].other_data,
              req_code: stmt_0[i].req_code,
              req_date: stmt_0[i].req_date,
              request_txt_label: stmt_0[i].request_txt_label,
              status: stmt_0[i].status,
              user_id: stmt_0[i].user_id,
              notificationId: stmt_0[i].reactNotificationId,
            });
          }

          socket.emit("notification", {
            data: final_data,
            push_count: Number(stmt_1[0].push_msg + stmt_1[0].btn_msg),
            file_count: stmt_1[0].file_msg,
          });
          if (data) {
            io.to(user_id).emit("all-notifications", {
              data: final_data,
              push_count: Number(stmt_1[0].push_msg + stmt_1[0].btn_msg),
              file_count: stmt_1[0].file_msg,
            });
          }
        } else {
          socket.emit("notification", {
            data: final_data,
            push_count: 0,
            file_count: 0,
          });
          if (data) {
            io.to(user_id).emit("all-notifications", {
              data: final_data,
              push_count: 0,
              file_count: 0,
            });
          }
        }
      } catch (err) {
        console.log("fetch_notifications := ", err.stack);
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
  }
};