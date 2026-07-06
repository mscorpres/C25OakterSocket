const { rm_consXML } = require("../../backendProcess/xml_rm_cons.js");
const { rm_jwXML } = require("../../backendProcess/xml_rm_jw.js");
const { rm_sfXML } = require("../../backendProcess/xml_rm_sf.js");
const { rm_rejXML } = require("../../backendProcess/xml_rm_rej.js");
const { r8xml } = require("../../backendProcess/xml_r8.js");
const { ven_consXML } = require("../../backendProcess/xml_ven_cons.js");

const jwt = require("jsonwebtoken");
const moment = require("moment");
const helper = require("../../helper.js");

const { otherDB } = require("../../../config/db/connection.js");
const { rm_sfgXML } = require("../../backendProcess/xml_rm_sfg.js");
const { rm_returnXML } = require("../../backendProcess/xml_rm_return.js");
const { sf_rejectXML } = require("../../backendProcess/xml_sf_rej.js");
const { reject_sf_XML } = require("../../backendProcess/xml_rej_sf.js");
const { sf024_rej021_XML } = require("../../backendProcess/xml_sf_rej021.js");
const { rm_to_sf999_XML } = require("../../backendProcess/xml_rm _sf999.js");
const { sf024_to_sf999_XML } = require("../../backendProcess/xml_rej_sf999.js");
const { fg_dismantleXML } = require("../../backendProcess/XML_DISMANTLE.js");
const { part_conversionXML } = require("../../backendProcess/XML_PARTCODE_CONV.js");
const { fg_XML } = require("../../backendProcess/xml_fg.js");
const { part_rm_conversionXML } = require("../../backendProcess/XML_RM_PARTCODE_CONV.js");

exports.generate_xml_report = function (io, socket) {
  const emit_notifications = async function (notificationId) {
    try {
      token_res = await verifyToken(`${socket.handshake.auth.token}`);
      let user_id = token_res.crn_id;
      let stmt = await otherDB.query("SELECT * FROM `user_files_req` WHERE `user_id` = :uid AND `module_name` = 'INVT' ORDER BY `ID` DESC", {
        replacements: { uid: user_id },
        type: otherDB.QueryTypes.SELECT,
      });
      if (stmt.length > 0) {
        if (notificationId) {
          stmt[0] = { ...stmt[0], notificationId: notificationId };
          io.to(user_id).emit("socket_receive_notification", stmt);
          console.log("data sent********************************************");
        } else {
          socket.emit("notification", stmt);
        }
      }
    } catch (err) {
      console.log("fetch_notifications :=", err.stack);
    }
  };

  socket.on("generate_xml_report", async (data) => {
    let check = await verifyToken(`${socket.handshake.auth.token}`);
    let user_id = check.crn_id;
    let branch = socket.handshake.auth.companyBranch;

    const myexpression = JSON.parse(data.otherdata).type;
    let fileName;

    let check_data = await otherDB.query("SELECT * FROM `user_files_req` WHERE `user_id`= :uid AND `req_code` = :expression AND req_date = :date AND `status` = 'pending'", {
      replacements: {
        expression: myexpression,
        uid: check.crn_id,
        date: JSON.parse(data.otherdata).date,
      },
      type: otherDB.QueryTypes.SELECT,
    });

    if (check_data.length > 0) {
      fileName = JSON.parse(check_data[0].other_data).fileName;
      //     socket.emit("toastr_error", {
      //         msg: "your previous request is already in pending, please wait until it is completed...",
      //     });
      //     return;
    } else {
      fileName = "XML-" + myexpression + "-" + user_id + Math.floor(Math.random() * 9999);
    }

    const myexpressionLabel =
      myexpression === "rm-sf"
        ? "XML Report of RM to SF"
        : myexpression === "rm-jw"
        ? "XML Report of RM to JW"
        : myexpression === "rm-cons"
        ? "XML Report of RM to Consumption"
        : myexpression === "mfg-xml"
        ? "XML Report of MFG"
        : myexpression === "rm-rej"
        ? "XML Report of RM to Rejection"
        : myexpression === "ven-cons"
        ? "XML Report of Vendor to Consumption"
        : myexpression === "rm-sfg"
        ? "XML Report of RM to SFG"
        : myexpression === "rm-return"
        ? "XML Report of RM to Return"
        : myexpression === "sf-rej"
        ? "XML Report of SF to Rejection"
        : myexpression === "rej-sf"
        ? "XML Report of Rejection to SF"
        : myexpression === "rej-rj21"
        ? "XML Report of SF024 to Rejection"
        : myexpression === "rm_sf999"
        ? "XML Report of RM to SF999"
        : myexpression === "rej-sf999"
        ? "XML Report of Rejection to SF999"
        : myexpression === "fg-dismantle"
        ? "XML Report of FG Dismantle"
        : myexpression === "part-conv"
        ? "XML Report of Part Conversion"
        : myexpression === "finish-goods"
        ? "XML Report of Finish Goods"
        : myexpression === "part-rm-conv"
        ? "XML Report of RM Part Conversion"
        : "--";

    await otherDB.query(
      "INSERT INTO `user_files_req` ( `module_name`, `request_txt_label`,  `req_code`, `user_id` , `req_date`, `msg_type` , `status` , `other_data`, `insert_date` ) VALUES ('INVT', :label, :expression, :uid, :req_date ,'file','pending', :other, :insert_date) ",
      {
        replacements: {
          label: myexpressionLabel,
          expression: myexpression,
          uid: check.crn_id,
          req_date: JSON.parse(data.otherdata).date,
          other: JSON.stringify({ fileName: fileName }),
          insert_date: moment().format("YYYY-MM-DD HH:mm:ss"),
        },
        type: otherDB.QueryTypes.INSERT,
      }
    );

    switch (myexpression) {
      case "rm-sf":
        await rm_sfXML(JSON.parse(data.otherdata).date, user_id, emit_notifications, myexpression, fileName, data.notificationId, socket, io, branch);
        break;

      case "rm-jw":
        await rm_jwXML(JSON.parse(data.otherdata).date, user_id, emit_notifications, myexpression, fileName, data.notificationId, socket, io, branch);
        break;

      case "rm-cons":
        await rm_consXML(JSON.parse(data.otherdata).date, user_id, emit_notifications, myexpression, fileName, data.notificationId, socket, io, branch);
        break;

      case "rm-rej":
        await rm_rejXML(JSON.parse(data.otherdata).date, user_id, emit_notifications, myexpression, fileName, data.notificationId, socket, io, branch);
        break;

      case "mfg-xml":
        await r8xml(JSON.parse(data.otherdata).date, user_id, emit_notifications, myexpression, fileName, data.notificationId, socket, io, branch);
        break;
      case "ven-cons":
        await ven_consXML(JSON.parse(data.otherdata).date, user_id, emit_notifications, myexpression, fileName, data.notificationId, socket, io, branch);
        break;
      case "rm-sfg":
        await rm_sfgXML(data, user_id, emit_notifications, myexpression, fileName, data.notificationId, socket, io, branch);
        break;
      case "rm-return":
        await rm_returnXML(data, user_id, emit_notifications, myexpression, fileName, data.notificationId, socket, io, branch);
        break;
      case "sf-rej":
        await sf_rejectXML(data, user_id, emit_notifications, myexpression, fileName, data.notificationId, socket, io, branch);
        break;
      case "rej-sf":
        await reject_sf_XML(data, user_id, emit_notifications, myexpression, fileName, data.notificationId, socket, io, branch);
        break;
      case "rej-rj21":
        await sf024_rej021_XML(data, user_id, emit_notifications, myexpression, fileName, data.notificationId, socket, io, branch);
        break;
      case "rm_sf999":
        await rm_to_sf999_XML(data, user_id, emit_notifications, myexpression, fileName, data.notificationId, socket, io, branch);
        break;
      case "rej-sf999":
        await sf024_to_sf999_XML(data, user_id, emit_notifications, myexpression, fileName, data.notificationId, socket, io, branch);
        break;
      case "fg-dismantle":
        await fg_dismantleXML(data, user_id, emit_notifications, myexpression, fileName, data.notificationId, socket, io, branch);
        break;
      case "part-conv":
        await part_conversionXML(data, user_id, emit_notifications, myexpression, fileName, data.notificationId, socket, io, branch);
        break;
       case "finish-goods":
        await fg_XML(data, user_id, emit_notifications, myexpression, fileName, data.notificationId, socket, io, branch);
        break;
       case "part-rm-conv":
        await part_rm_conversionXML(data, user_id, emit_notifications, myexpression, fileName, data.notificationId, socket, io, branch);
        break;
      default:
        console.log(`sorry, we are out of - ${myexpression}`);
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
