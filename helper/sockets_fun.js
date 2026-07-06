const fs = require("fs");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { invtDB, otherDB } = require("./../config/db/connection");

exports.myFunction = function (io) {
  io.on("connection", (socket) => {
    require("./SOCKETS/chat").chat(io, socket);
    require("./SOCKETS/transaction").transaction(io, socket);
    require("./SOCKETS/push").push(io, socket);
    require("./SOCKETS/notification").notification(io, socket);
    require("./SOCKETS/allComp").allComp(io, socket);
    require("./SOCKETS/weightedRateReport").weightedRateReport(io, socket);
    require("./SOCKETS/skuMovementReport").skuMovementReport(io, socket);
    require("./SOCKETS/r8Event").r8Event(io, socket);
    require("./SOCKETS/companyBranch").companyBranch(io, socket);
    require("./SOCKETS/XML/xml_request").generate_xml_report(io, socket);
    require("./SOCKETS/Finance/plReport").plReport(io, socket);
    require("./SOCKETS/Finance/vbtappreport").vbtappreport(io, socket);
    require("./SOCKETS/Finance/vbtReport").vbtReport(io, socket);
    require("./SOCKETS/OAKTER/jw_analysis").jw_analysis(io, socket);
    require("./SOCKETS/OAKTER/allCompLocation").allCompLocation(io, socket);
    require("./SOCKETS/Finance/tdsReport").tdsReport(io, socket);
    require("./SOCKETS/OAKTER/vendor/vr01").vr01(io, socket);
    require("./SOCKETS/OAKTER/vendor/reqPending").vendorReqPending(io, socket);
    require("./SOCKETS/OAKTER/monthly_audit").monthly_audit(io, socket);
    require("./SOCKETS/OAKTER/r18").r18(io, socket);
    require("./SOCKETS/Finance/gstr1").gstrReport(io, socket);
    require("./SOCKETS/OAKTER/q6").q6(io, socket);
    require("./SOCKETS/Finance/3b").gstr3b(io, socket);
    require("./SOCKETS/OAKTER/r37").r37(io, socket);
    // 503 = Testing Mode
    // 200 = Production Mode

    socket.on("view_transaction_out_status", (data) => {
      io.emit("status", (data = { message: "YOU'RE IN TEST MODE", code: 200 }));
    });

    // CHECK PAGE PERMMITION
    socket.on("checkPagePermission", async (data) => {
      let page_id = socket.handshake.auth.page_id;
      let req_type = socket.handshake.auth.type;

      try {
        let token_res;
        token_res = await verifyToken(`${socket.handshake.auth.token}`);
        let user_id = token_res.crn_id;
        let stmt1 = await invtDB.query("SELECT * FROM `admin_login` WHERE `CustID` = :user_id", { replacements: { user_id: user_id }, type: invtDB.QueryTypes.SELECT });
        if (stmt1.length > 0) {
          if (stmt1[0].isMobileConfirmed == "0") {
            return io.emit("permission", { code: 403, message: "Please confirm your mobile number", error: "warning", url: "https://www.google.com", demandPermission: "0" });
          } else if (stmt1[0].isEmailConfirmed == "0") {
            return io.emit("permission", { code: 403, message: "Please confirm your mobile number", error: "warning", url: "https://www.google.com", demandPermission: "0" });
          } else {
            let stmt2 = await otherDB.query("SELECT * FROM `ims_permission` WHERE `page_id` = :page_id AND `username` = :user_id", {
              replacements: {
                page_id: page_id,
                user_id: user_id,
              },
              type: otherDB.QueryTypes.SELECT,
            });
            if (stmt2.length > 0) {
              let jsonData = JSON.parse(stmt2[0].permission);

              if (req_type == "view" && jsonData.view == "true") {
                next();
              } else if (req_type == "edit" && jsonData.edit == "true") {
                next();
              } else if (req_type == "delete" && jsonData.delete == "true") {
                next();
              } else if (req_type == "create" && jsonData.create == "true") {
                next();
              } else {
                io.emit("permission", {
                  code: 403,
                  message: "the administrator has not provided you with this rights yet.<br/>suggestion to contact them...",
                  status: "warning",
                  demandPermission: "1",
                });
              }
            } else {
              io.emit("permission", {
                code: 403,
                message: "it might be accidentally that the administrator has not provided you with any rights yet.<br/>suggestion to contact them...",
                status: "info",
                demandPermission: "1",
              });
            }
          }
        } else {
          io.emit("permission", { code: 403, message: "authentication failed, contact to system administrator..", url: "https://ims.mscorpres.com/auth/logout" });
        }
      } catch (err) {
        console.log(err);
      }
    });
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
