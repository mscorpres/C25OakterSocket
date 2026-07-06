const moment = require("moment");
const fs = require("fs");
require("dotenv").config();

const { otherDB, invtDB } = require("./../../config/db/connection");
const helper = require("../../helper/helper");

const { verifyToken, emit_error_msg, error_log } = require("../utils");

const { htmlTemplate } = require("./EmailTemplate/fileDownload");
const { encode, decode } = require("html-entities");
const xmlFormatter = require("xml-formatter");
const Validator = require("validatorjs");
const archiver = require("archiver");

exports.r8xml = async (date, uid, emit_notifications, expression, fileName, notificationId, socket, io, branch) => {
  try {
    io.to(uid).emit("download_start_detail", {
      title: "Detailed production XML FILE",
      details: date,
      notificationId: notificationId,
      status: "pending",
      detailStatus: true,
      total: false,
      type: "file",
    });

    const fromdate = moment(date, "DD-MM-YYYY").format("YYYY-MM-DD");
    const todate = moment(date, "DD-MM-YYYY").format("YYYY-MM-DD");

    const stmt = await invtDB.query(
      "SELECT *, admin_login.user_name FROM mfg_production_2 LEFT JOIN admin_login ON admin_login.CustID = mfg_production_2.mfg_approved_by LEFT JOIN products ON mfg_production_2.mfg_sku = products.p_sku LEFT JOIN units ON products.p_uom = units.units_id WHERE DATE_FORMAT(mfg_production_2.mfg_full_date, '%Y-%m-%d') BETWEEN :date1 AND :date2 ORDER BY mfg_production_2.mfg_transaction DESC",
      {
        replacements: {
          date1: fromdate,
          date2: todate,
        },
        type: invtDB.QueryTypes.SELECT,
      }
    );

    if (stmt.length <= 0) {
      // EMIT NO DATA
      socket.emit("error", { message: "No Data Found" });
      //emit_error_msg(io, socket, "No Data Found");
      return false;
    }

    const files = [];

    let xml_str = ``;

    for (let i = 0; i < stmt.length; i++) {
      let stmt_a_2 = await invtDB.query("SELECT * FROM `location_main` WHERE `location_key` = :location", {
        replacements: {
          location: stmt[i].mfg_con_location,
        },
        type: invtDB.QueryTypes.SELECT,
      });

      let consump_location_name = "N/A";
      if (stmt_a_2.length > 0) {
        consump_location_name = stmt_a_2[0].loc_name;
      }

      let product_type = "N/A";
      if (stmt[i].products_type == "default") {
        product_type = "FG";
      } else if (stmt[i].products_type == "semi") {
        product_type = "SEMI FG";
      }

      let stmt_cons_location = await invtDB.query(
        "SELECT location_main.loc_name , location_main.company_branch FROM rm_location LEFT JOIN location_main ON rm_location.loc_out = location_main.location_key  WHERE mfg_ppr_trans_id_2 = :mfg_no",
        {
          replacements: {
            mfg_no: stmt[i].mfg_transaction,
          },
          type: invtDB.QueryTypes.SELECT,
        }
      );

      let company_branch = "N/A";
      if (stmt_cons_location.length > 0) {
        company_branch = stmt_cons_location[0].company_branch;
      }

      const header_data = {
        serial_no: i + 1,
        date: stmt[i].mfg_full_date,
        skucode: stmt[i].mfg_sku,
        mfg_id: stmt[i].mfg_transaction,
        mfg_qty: stmt[i].mfg_prod_planing_qty,
        productname: stmt[i].p_name,
        productsku: stmt[i].p_sku,
        fg_loc: consump_location_name,
        branch: company_branch,
        VOUCHERSOURCEGODOWN: "GDWP001_Alwar",
        unit: stmt[i].units_name,
        user: "sachin.koli",
        fgtype: product_type,
        comment: stmt[i].mfg_comment,
      };

      xml_str = require("../backendProcess/xml/r8xml_code").r8xml_code_header(header_data, helper.randomNumber(99999, 999999));

      // GET COMPONENET
      let stmt_comp = await invtDB.query(
        "SELECT rm_location.qty , rm_location.other_qty , components.c_part_no, components.component_key, components.c_name , components.components_type , units.units_name , location_main.loc_name , location_main.company_branch, rm_location.insert_date FROM rm_location LEFT JOIN components ON rm_location.components_id = components.component_key LEFT JOIN units ON components.c_uom = units.units_id LEFT JOIN location_main ON rm_location.loc_out = location_main.location_key  WHERE mfg_ppr_trans_id_2 = :mfg_no",
        {
          replacements: {
            mfg_no: stmt[i].mfg_transaction,
          },
          type: invtDB.QueryTypes.SELECT,
        }
      );
      for (let j = 0; j < stmt_comp.length; j++) {
        //LAST COMPONENT PURCHASE RATE
        //  let last_rate = await invtDB.query("SELECT `ID`, CASE WHEN `rm_location`.`currency_type` != '364907247' THEN TRUNCATE(`rm_location`.`exchange_rate` * in_po_rate, 3) ELSE COALESCE(`in_po_rate`, 0) END AS `last_rate`, `components_id` FROM `rm_location` WHERE `components_id` = :component AND `trans_type` = 'INWARD' AND `ID` = ( SELECT MAX(`ID`) FROM `rm_location` WHERE `components_id` = :component AND `trans_type` = 'INWARD' AND vendor_type = 'v01' AND DATE_FORMAT(`insert_date`, '%Y-%m-%d') <= :date)", {
        //  replacements: {
        //     component: stmt_comp[j].component_key,
        //     date: moment(date, "DD-MM-YYYY").format("YYYY-MM-DD")
        // },
        //  	type: invtDB.QueryTypes.SELECT,
        //  });

        //  let last_purchase = 1;
        //  if (last_rate.length > 0) {
        //  	last_purchase = last_rate[0].last_rate;
        //  } else {
        //  	last_purchase = 0;
        //  }

        // AVEREAGE RATE
        const last_purchase = await require("../../helper/utils").getWeightedPurchaseRate(stmt_comp[j].component_key, moment(stmt_comp[j].insert_date, "YYYY-MM-DD HH:mm:ss").format("YYYY-MM-DD HH:mm:ss"));

        let component_type = "N/A";
        if (stmt_comp[j].components_type == "default") {
          component_type = "RM";
        } else if (stmt_comp[j].components_type == "semi") {
          component_type = "SR";
        }

        const row_data = {
          serial_no: j + 1,
          cons_qty: Number(stmt_comp[j].qty) + Number(stmt_comp[j].other_qty),
          cons_loc: stmt_comp[j].loc_name,
          partcode: stmt_comp[j].c_part_no,
          component: stmt_comp[j].c_name,
          unit: stmt_comp[j].units_name,
          lastrate: last_purchase,
          fgtype: component_type,
          GODOWNNAME: "GDWP001_Alwar"
        };

        xml_str += require("../backendProcess/xml/r8xml_code").r8xml_code_body(row_data, helper.randomNumber(99999, 999999));
      } // Component loop

      xml_str += require("../backendProcess/xml/r8xml_code").r8xml_code_footer();

      const xml_file_name = stmt[i].mfg_transaction.replaceAll("/", "_") + " - " + stmt[i].mfg_sku + ".xml";
      const filePath = "./files/xml/temp/" + xml_file_name;
      files.push({
        name: xml_file_name,
        path: filePath,
      });
      const file_create = fs.writeFileSync(filePath, xml_str);
    } // MFG LOOP

    const xml_zip_Name = fileName + ".zip";
    const mxl_zip_path = "./files/xml/" + xml_zip_Name;

    //START
    const zipFileName = fs.createWriteStream(mxl_zip_path);
    const output = zipFileName;
    const archive = archiver("zip", { store: true });
    archive.on("error", (err) => {
      throw err;
    });
    archive.pipe(output);

    files.forEach((f) => {
      archive.append(fs.createReadStream(f.path), { name: f.name });
    });

    archive.finalize();

    let stmt_update = await otherDB.query("UPDATE `user_files_req` SET `status` = 'complete', `other_data` = :other WHERE `user_id`= :uid AND `req_code` = :req_code AND req_date = :req_date", {
      replacements: {
        uid: uid,
        req_code: expression,
        req_date: date,
        other: JSON.stringify({
          fileName: xml_zip_Name,
          fileUrl: mxl_zip_path,
          fileBuffer: "N/A",
        }),
      },
      type: otherDB.QueryTypes.UPDATE,
    });

    emit_notifications(notificationId);
  } catch (err) {
    error_log({ stack: err.stack });
  }
};
