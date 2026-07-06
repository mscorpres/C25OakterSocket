const xlsx = require("xlsx");
let fs = require("fs");
const { otherDB } = require("../../../config/db/connection");
const jwt = require("jsonwebtoken");
const moment = require("moment");

exports.plReport = async function (io, socket) {
  try {
    socket.on("printPL", async (data) => {
      let check = await verifyToken(`${socket.handshake.auth.token}`);
      let user_id = check.crn_id;
      //   console.log("this is working", data);
      const { arr1, arr2, arr3, arr4, notificationId, otherdata, directExpenseTotal, directIncomeTotal, inirectExpensesTotal, inirectIncomeTotal } = JSON.parse(data);
      var ws = xlsx.utils.json_to_sheet(
        [
          {
            A: "NAME",
            B: "TYPE",
            C: "CLOSING",
            D: "",
            E: "TYPE",
            F: "",
            G: "NAME",
            H: "TYPE",
            I: "CLOSING",
            J: "",
            K: "CODE",
          },
        ],
        {
          header: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"],

          skipHeader: true,
        }
      );

      let arr = [];
      let bigArr = arr1.length > arr2.length ? arr1 : arr2;
      let bigArr1 = arr3.length > arr4.length ? arr3 : arr4;
      console.log(bigArr.length);
      for (let i = 0; i < bigArr.length; i++) {
        arr.push({
          A: arr1[i]?.name ?? "",
          B: arr1[i]?.type ?? "",
          C: i > 0 ? arr1[i]?.closing ?? "" : "",
          D: i === 0 ? arr1[i]?.closing ?? "" : "",
          E: arr1[i]?.code ?? "",
          F: "",
          G: arr2[i]?.name ?? "",
          H: arr2[i]?.type ?? "",
          I: i > 0 ? arr2[i]?.closing ?? "" : "",
          J: i === 0 ? arr2[i]?.closing ?? "" : "",
          K: arr2[i]?.code ?? "",
        });
      }
      arr.push({
        A: "",
        B: "",
        C: "",
        D: directExpenseTotal.total1,
        E: directExpenseTotal.total2,
        F: "",
        G: "",
        H: "",
        I: "",
        J: directIncomeTotal.total1,
        K: directIncomeTotal.total2,
      });
      arr.push({
        A: "",
        B: "",
        C: "",
        D: directExpenseTotal.total3,
        E: directExpenseTotal.total4,
        F: "",
        G: "",
        H: "",
        I: "",
        J: directIncomeTotal.total3,
        K: directIncomeTotal.total4,
      });
      arr.push({
        A: "",
        B: "",
        C: "",
        D: directExpenseTotal.total5,
        E: directExpenseTotal.total5,
        F: "",
        G: "",
        H: "",
        I: "",
        J: directIncomeTotal.total5,
        K: directIncomeTotal.total6,
      });
      arr.push({
        A: "",
        B: "",
        C: "",
        D: "",
        E: "",
        F: "",
        G: "",
        H: "",
        I: "",
        J: "",
        K: "",
      });
      arr.push({
        A: "NAME",
        B: "TYPE",
        C: "CLOSING",
        D: "",
        E: "TYPE",
        F: "",
        G: "NAME",
        H: "TYPE",
        I: "CLOSING",
        J: "",
        K: "CODE",
      });
      for (let i = 0; i < bigArr1.length; i++) {
        arr.push({
          A: arr3[i]?.name ?? "",
          B: arr3[i]?.type ?? "",
          C: i > 0 ? arr3[i]?.closing ?? "" : "",
          D: i === 0 ? arr3[i]?.closing ?? "" : "",
          E: arr3[i]?.code ?? "",
          F: "",
          G: arr4[i]?.name ?? "",
          H: arr4[i]?.type ?? "",
          I: i > 0 ? arr4[i]?.closing ?? "" : "",
          J: i === 0 ? arr4[i]?.closing ?? "" : "",
          K: arr4[i]?.code ?? "",
        });
      }
      arr.push({
        A: "",
        B: "",
        C: "",
        D: inirectExpensesTotal.total1,
        E: inirectExpensesTotal.total2,
        F: "",
        G: "",
        H: "",
        I: "",
        J: inirectIncomeTotal.total1,
        K: inirectIncomeTotal.total2,
      });
      arr.push({
        A: "",
        B: "",
        C: "",
        D: inirectExpensesTotal.total3,
        E: inirectExpensesTotal.total4,
        F: "",
        G: "",
        H: "",
        I: "",
        J: inirectIncomeTotal.total3,
        K: inirectIncomeTotal.total4,
      });
      arr.push({
        A: "",
        B: "",
        C: "",
        D: "inirectExpensesTotal.total5",
        E: "inirectExpensesTotal.total5",
        F: "",
        G: "",
        H: "",
        I: "",
        J: inirectIncomeTotal.total5,
        K: inirectIncomeTotal.total6,
      });
      xlsx.utils.sheet_add_json(
        ws,
        arr,

        { skipHeader: true, origin: "A2" }
      );

      const wb = xlsx.utils.book_new();

      xlsx.utils.book_append_sheet(wb, ws, "test");

      const filename = "plReport.xlsx";
      xlsx.writeFile(wb, `./files/excel/${filename}`);

      let stmt = await otherDB.query("INSERT INTO `user_files_req` (`request_txt_label`, `req_code`, `user_id`, `req_date`, `msg_type` , `status` , `other_data`, `insert_date`,`reactNotificationId` ) VALUES ('P&L Report', 'P&L Report', :uid, :req_date,'file','complete', :other , :insert_date,:notificationId) ", {
        replacements: {
          uid: user_id,
          req_date: moment(new Date()).tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss"),
          other: JSON.stringify({
            fileName: filename,
            fileUrl: `./files/excel/${filename}`,
          }),
          insert_date: moment(new Date()).tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss"),
          notificationId: notificationId ?? 0,
        },
        type: otherDB.QueryTypes.INSERT,
      });
      io.to(user_id).emit("download_start_detail", {
        title: "P&L Report",
        details: otherdata.date ?? "",
        notificationId: notificationId,
        status: "pending",
        detailStatus: true,
        type: "file",
      });
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
              console.log(stmt);
              console.log("data sent********************************************");
            } else {
              socket.emit("notification", stmt);
            }
          }
        } catch (err) {
          console.log("fetch_notifications :=", err.stack);
        }
      };
      emit_notifications(notificationId);
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
  } catch (error) {
    console.log(error.stack);
  }
};
