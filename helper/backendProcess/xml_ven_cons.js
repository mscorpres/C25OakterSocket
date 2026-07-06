const moment = require("moment");
const fs = require("fs");
require("dotenv").config();

const { otherDB, invtDB } = require("./../../config/db/connection");
const helper = require("../../helper/helper");
const { htmlTemplate } = require("./EmailTemplate/fileDownload");
const { encode, decode } = require("html-entities");
const xmlFormatter = require("xml-formatter");
const Validator = require("validatorjs");
const { verifyToken, emit_error_msg, error_log } = require("../utils");

exports.ven_consXML = async (date, uid, emit_notifications, expression, fileName, notificationId, socket, io, branch) => {
  try {
    let stmt = await invtDB.query(
      "SELECT jw_ven_location.*, components.c_part_no, components.c_name , units.units_name, admin_login.user_name FROM jw_ven_location LEFT JOIN components ON components.component_key = jw_ven_location.jw_ven_rm LEFT JOIN units ON units.units_id = components.c_uom LEFT JOIN admin_login ON admin_login.CustID = jw_ven_location.jw_ven_insert_by WHERE jw_ven_code = 'VEN0266' AND (DATE_FORMAT(`jw_ven_insert_dt`,'%Y-%m-%d') BETWEEN :data AND :data) AND jw_ven_txn_type = 'RM-CONSUMPTION' AND jw_ven_location.type = 'consumption'",
      {
        replacements: {
          vendor: "VEN0266",
          data: moment(date, "DD-MM-YYYY").format("YYYY-MM-DD"),
        },
        type: invtDB.QueryTypes.SELECT,
      }
    );

    const response_data = [];
    for (let i = 0; i < stmt.length; i++) {
      let fetchComponent = [];

      if (stmt[i].consumed_product != null && stmt[i].consumed_product != "" && stmt[i].consumed_product != undefined) {
        fetchComponent = await invtDB.query("SELECT * FROM components WHERE component_key = :data", {
          replacements: {
            data: stmt[i].consumed_product,
          },
          type: invtDB.QueryTypes.SELECT,
        });
      }

      // let last_purchase = 1;

      // let stmt4 = await invtDB.query(
      //   "SELECT `ID`, CASE WHEN `rm_location`.`currency_type` != '364907247' THEN TRUNCATE(`rm_location`.`exchange_rate` * in_po_rate, 3) ELSE COALESCE(`in_po_rate`, 0) END AS `last_rate`, `components_id` FROM `rm_location` WHERE `components_id` = :component AND `trans_type` = 'INWARD' AND `ID` = ( SELECT MAX(`ID`) FROM `rm_location` WHERE `components_id` = :component AND `trans_type` = 'INWARD' AND vendor_type = 'v01' AND DATE(`insert_date`) <= :date)",
      //   {
      //     replacements: {
      //       component: stmt[i].jw_ven_rm,
      //       date: moment(date, "DD-MM-YYYY").format("YYYY-MM-DD"),
      //     },
      //     type: invtDB.QueryTypes.SELECT,
      //   }
      // );
      // if (stmt4.length > 0) {
      //   last_purchase = stmt4[0].last_rate;
      // } else {
      //   last_purchase = 0;
      // }

      // AVEREAGE RATE
      const last_purchase = await require("../../helper/utils").getWeightedPurchaseRate(stmt[i].jw_ven_rm, moment(date, "DD-MM-YYYY").format("YYYY-MM-DD HH:mm:ss"));

      response_data.push({
        part_no: stmt[i].c_part_no,
        part_name: stmt[i].c_name,
        unit: stmt[i].units_name,
        qty: stmt[i].jw_ven_in_qty,
        rate: last_purchase,
        hsn: stmt[i].jw_ven_part_hsn,
        doc_ref: stmt[i].jw_ven_challan_ref,
        doc_date: stmt[i].jw_ven_date,
        create_dt: moment(stmt[i].jw_ven_insert_dt, "YYYY-MM-DD HH:mm:ss").format("DD-MM-YYYY HH:mm:ss"),
        create_by: "sachin.koli",
        txn_id: stmt[i].jw_ven_txn,
        remark: stmt[i].jw_ven_remark,
        type: stmt[i].type ?? "--",
        consumedProduct:
          fetchComponent.length > 0
            ? {
                text: fetchComponent[0].c_part_no + " - " + fetchComponent[0].c_name,
                value: fetchComponent[0].component_key,
              }
            : "--",
        consumedQty: stmt[i].consumed_product_qty ?? "--",
      });
    }

    if (response_data.length == 0) {
      let updateStmt = await otherDB.query("UPDATE `user_files_req` SET `status` = 'complete', `other_data` = :other WHERE `user_id`= :uid AND `req_code` = :req_code AND req_date = :req_date", {
        replacements: {
          uid: uid,
          req_code: expression,
          req_date: date,
          other: JSON.stringify({
            fileBuffer: "N/A",
          }),
        },
        type: otherDB.QueryTypes.UPDATE,
      });

      return;
    }

    const xmlData = require("./xml/xml_ven_code").xml_ven_code(response_data, helper.randomNumber(99999, 999999));
    const xml = xmlFormatter(xmlData);

    const file = "./files/xml/" + fileName + ".xml";
    fs.writeFileSync(file, xml, "utf8");

    let updateStmt = await otherDB.query("UPDATE `user_files_req` SET `status` = 'complete', `other_data` = :other WHERE `user_id`= :uid AND `req_code` = :req_code AND req_date = :req_date", {
      replacements: {
        uid: uid,
        req_code: expression,
        req_date: date,
        other: JSON.stringify({
          fileName: fileName,
          fileUrl: file,
          fileBuffer: "N/A",
        }),
      },
      type: otherDB.QueryTypes.UPDATE,
    });

    emit_notifications(notificationId);

    // SEND USER MAILDONE
    let user = await invtDB.query("SELECT `Email_ID`,`user_name` from `admin_login` WHERE `CustID`= :CustID", {
      replacements: {
        CustID: uid,
      },
      type: invtDB.QueryTypes.SELECT,
    });
    let userEmail = user[0].Email_ID;
    let attachment = [
      {
        filename: "XML report of RM to Rejection.xml",
        content: fs.readFileSync("./files/xml/" + fileName + ".xml"),
      },
    ];
    const filePath = "files/xml/" + fileName + ".xml";

    helper.sendMail(
      userEmail,
      "",
      "Vendor Cons XML" + " transaction [File Ready for download] Ref:" + helper.randomNumber(99999, 999999),
      htmlTemplate(user[0].user_name, new Date(), "RM to Rejection in XML", `${process.env.SOCKET_API_URL}/${filePath}`),
      attachment
    );
    //END MAIL
  } catch (err) {
    error_log({ stack: err.stack });
  }
};
