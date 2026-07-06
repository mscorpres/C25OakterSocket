const moment = require("moment");
const fs = require("fs");
require("dotenv").config();

const { otherDB, invtDB } = require("./../../config/db/connection");
const helper = require("../../helper/helper");
const { htmlTemplate } = require("./EmailTemplate/fileDownload");
const { encode, decode } = require("html-entities");
const xmlFormatter = require("xml-formatter");
const Validator = require("validatorjs");
const archiver = require("archiver");

const xml_data = require("./xml/xml_rm_jw_code");

const getVendorGodown = async (vendor_id) => {
  try {
    const result = await otherDB.query("SELECT * FROM tbl_vendor_godown WHERE vendor = :vendor_id", {
      replacements: { vendor_id: vendor_id },
      type: otherDB.QueryTypes.SELECT,
    });

    if (result.length > 0) {
      return result[0].wh_name;
    }

    return "Godown Not Set For Vendor" + vendor_id;
  } catch (error) {
    return "Godown Not Set For Vendor" + vendor_id;
  }
};

exports.rm_jwXML = async (date, uid, emit_notifications, expression, fileName, notificationId, socket, io, branch) => {
  // Query for RM to JW location only
  try {
    let stmt1 = await invtDB.query(
      "SELECT *, COALESCE( jw_material_challan.jw_challan_txn_id, 'N/A' ) AS challan_no, jw_material_challan.jw_insert_dt AS challan_insert_dt FROM jw_material_issue LEFT JOIN jw_material_challan ON jw_material_issue.jw_m_transaction_id = jw_material_challan.jw_challan_ref_id WHERE DATE_FORMAT( jw_material_challan.jw_insert_dt, '%Y-%m-%d' ) = :date AND jw_material_issue.jw_m_status != 'C' GROUP BY jw_material_issue.jw_m_transaction_id ORDER BY jw_material_issue.jw_m_insert_dt DESC",
      {
        replacements: { date: moment(date, "DD-MM-YYYY").format("YYYY-MM-DD") },
        type: invtDB.QueryTypes.SELECT,
      }
    );

    let files = [];

    if (stmt1.length > 0) {
      io.to(uid).emit("download_start_detail", {
        title: "XML RM TO JW",
        details: date,
        notificationId: notificationId,
        status: "pending",
        detailStatus: true,
        total: false,
        type: "file",
      });

      count = 0;

      stmt1.map(async (item, inx) => {
       
        let stmt2 = await invtDB.query(
          "SELECT components.c_name, `components`.`component_key`, components.c_part_no, units.units_name, location_main.loc_name, admin_login.user_name, rm_location.insert_date, rm_location.trans_type, rm_location.in_vendor_name, rm_location.out_transaction_id, rm_location.any_remark, rm_location.jw_challan_id, rm_location.qty, loc2.loc_name AS `loc_out` FROM `rm_location` LEFT JOIN `components` ON `rm_location`.`components_id` = `components`.`component_key` LEFT JOIN `units` ON `components`.`c_uom` = `units`.`units_id` LEFT JOIN `location_main` ON `rm_location`.`loc_in` = `location_main`.`location_key` LEFT JOIN `location_main` AS loc2 ON `rm_location`.`loc_out` = `loc2`.`location_key` LEFT JOIN `admin_login` ON rm_location.insert_by = admin_login.CustID WHERE `components`.`c_type` = 'R' AND `components`.`c_is_enabled` = 'Y' AND rm_location.jw_challan_id = :challan AND `rm_location`.`trans_type` IN('JOBWORK') AND rm_location.company_branch = :branch AND FIND_IN_SET( location_main.location_key, ( SELECT locations FROM location_allotted WHERE loc_all_key = '2023919103150216' ) ) ORDER BY `rm_location`.`insert_date` DESC",
          {
            replacements: { challan: item.challan_no, branch: branch },
            type: invtDB.QueryTypes.SELECT,
          }
        );

        if (stmt2.length <= 0) {
          count++;
          return;
        }

        // start from below

        let modified_location_in, modified_location_out;
        if (item.loc_in !== "RM021" && item.loc_in !== "RM029") {
          modified_location_in = "RM021";
        } else {
          modified_location_in = item.loc_in;
        }

        if (item.loc_out !== "SF024" && item.loc_out !== "SF088") {
          modified_location_out = "SF021";
        } else {
          modified_location_out = item.loc_out;
        }

        const inventoryEntries_1 = [],
          inventoryEntries_2 = [];
        for (let i = 0; i < stmt2.length; i++) {
          //LAST COMPONENT PURCHASE RATE
          // let last_purchase = 1;

          // let stmt4 = await invtDB.query("SELECT `ID`, CASE WHEN `rm_location`.`currency_type` != '364907247' THEN TRUNCATE(`rm_location`.`exchange_rate` * in_po_rate, 3) ELSE COALESCE(`in_po_rate`, 0) END AS `last_rate`, `components_id` FROM `rm_location` WHERE `components_id` = :component AND `trans_type` = 'INWARD' AND `ID` = ( SELECT MAX(`ID`) FROM `rm_location` WHERE `components_id` = :component AND `trans_type` = 'INWARD' AND vendor_type = 'v01' AND DATE_FORMAT(insert_date,'%Y-%m-%d') <= :date)",
          //     {
          //         replacements: {
          //             component: stmt2[i].component_key,
          //             date: moment(date, "DD-MM-YYYY").format("YYYY-MM-DD")
          //         },
          //         type: invtDB.QueryTypes.SELECT,
          //     }
          // );
          // if (stmt4.length > 0) {
          //     last_purchase = stmt4[0].last_rate;
          // } else {
          //     last_purchase = 0;
          // }
          // AVEREAGE RATE
          const last_purchase = await require("../../helper/utils").getWeightedPurchaseRate(stmt2[i].component_key, moment(date, "DD-MM-YYYY").format("YYYY-MM-DD HH:mm:ss"));

          const inventoryEntry_1 = `
                    <INVENTORYENTRIESIN.LIST>
                        <STOCKITEMNAME>${stmt2[i].c_part_no}</STOCKITEMNAME>
                        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                        <ISGSTASSESSABLEVALUEOVERRIDDEN>No</ISGSTASSESSABLEVALUEOVERRIDDEN>
                        <STRDISGSTAPPLICABLE>No</STRDISGSTAPPLICABLE>
                        <CONTENTNEGISPOS>No</CONTENTNEGISPOS>
                        <ISLASTDEEMEDPOSITIVE>Yes</ISLASTDEEMEDPOSITIVE>
                        <ISAUTONEGATE>No</ISAUTONEGATE>
                        <ISCUSTOMSCLEARANCE>No</ISCUSTOMSCLEARANCE>
                        <ISTRACKCOMPONENT>No</ISTRACKCOMPONENT>
                        <ISTRACKPRODUCTION>No</ISTRACKPRODUCTION>
                        <ISPRIMARYITEM>No</ISPRIMARYITEM>
                        <ISSCRAP>No</ISSCRAP>
                        <RATE>${last_purchase}</RATE>
                        <AMOUNT>-${helper.number(helper.number(stmt2[i].qty) * helper.number(last_purchase))}</AMOUNT>
                        <ACTUALQTY> ${stmt2[i].qty}</ACTUALQTY>
                        <BILLEDQTY> ${stmt2[i].qty}</BILLEDQTY>
                        <BATCHALLOCATIONS.LIST>
                                <GODOWNNAME>${await getVendorGodown(stmt2[i].in_vendor_name)}</GODOWNNAME>
                                <BATCHNAME>Primary Batch</BATCHNAME>
                                <INDENTNO>&#4; Not Applicable</INDENTNO>
                                <ORDERNO>&#4; Not Applicable</ORDERNO>
                                <TRACKINGNUMBER>&#4; Not Applicable</TRACKINGNUMBER>
                                <DYNAMICCSTISCLEARED>No</DYNAMICCSTISCLEARED>
                                <AMOUNT>-${helper.number(helper.number(stmt2[i].qty) * helper.number(last_purchase))}</AMOUNT>
                                <ACTUALQTY> ${stmt2[i].qty}</ACTUALQTY>
                                <BILLEDQTY> ${stmt2[i].qty}</BILLEDQTY>
                                <ADDITIONALDETAILS.LIST> </ADDITIONALDETAILS.LIST>
                                <VOUCHERCOMPONENTLIST.LIST> </VOUCHERCOMPONENTLIST.LIST>
                        </BATCHALLOCATIONS.LIST>
                        <DUTYHEADDETAILS.LIST> </DUTYHEADDETAILS.LIST>
                        <RATEDETAILS.LIST> </RATEDETAILS.LIST>
                        <SUPPLEMENTARYDUTYHEADDETAILS.LIST> </SUPPLEMENTARYDUTYHEADDETAILS.LIST>
                        <TAXOBJECTALLOCATIONS.LIST> </TAXOBJECTALLOCATIONS.LIST>
                        <COSTTRACKALLOCATIONS.LIST> </COSTTRACKALLOCATIONS.LIST>
                        <REFVOUCHERDETAILS.LIST> </REFVOUCHERDETAILS.LIST>
                        <EXCISEALLOCATIONS.LIST> </EXCISEALLOCATIONS.LIST>
                        <EXPENSEALLOCATIONS.LIST> </EXPENSEALLOCATIONS.LIST>
                    </INVENTORYENTRIESIN.LIST>
                    `;

          const inventoryEntry_2 = `
                    <INVENTORYENTRIESOUT.LIST>
                        <STOCKITEMNAME>${stmt2[i].c_part_no}</STOCKITEMNAME>
                        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                        <ISGSTASSESSABLEVALUEOVERRIDDEN>No</ISGSTASSESSABLEVALUEOVERRIDDEN>
                        <STRDISGSTAPPLICABLE>No</STRDISGSTAPPLICABLE>
                        <CONTENTNEGISPOS>No</CONTENTNEGISPOS>
                        <ISLASTDEEMEDPOSITIVE>No</ISLASTDEEMEDPOSITIVE>
                        <ISAUTONEGATE>No</ISAUTONEGATE>
                        <ISCUSTOMSCLEARANCE>No</ISCUSTOMSCLEARANCE>
                        <ISTRACKCOMPONENT>No</ISTRACKCOMPONENT>
                        <ISTRACKPRODUCTION>No</ISTRACKPRODUCTION>
                        <ISPRIMARYITEM>No</ISPRIMARYITEM>
                        <ISSCRAP>No</ISSCRAP>
                        <RATE>${last_purchase}</RATE>
                        <AMOUNT>${helper.number(helper.number(stmt2[i].qty) * helper.number(last_purchase))}</AMOUNT>
                        <ACTUALQTY> ${stmt2[i].qty}</ACTUALQTY>
                        <BILLEDQTY> ${stmt2[i].qty}</BILLEDQTY>
                        <BATCHALLOCATIONS.LIST>
                                <GODOWNNAME>GDRM0021-A-21 Noida</GODOWNNAME>
                                <BATCHNAME>Primary Batch</BATCHNAME>
                                <INDENTNO>&#4; Not Applicable</INDENTNO>
                                <ORDERNO>&#4; Not Applicable</ORDERNO>
                                <TRACKINGNUMBER>&#4; Not Applicable</TRACKINGNUMBER>
                                <DYNAMICCSTISCLEARED>No</DYNAMICCSTISCLEARED>
                                <AMOUNT>${helper.number(helper.number(stmt2[i].qty) * helper.number(last_purchase))}</AMOUNT>
                                <ACTUALQTY> ${stmt2[i].qty}</ACTUALQTY>
                                <BILLEDQTY> ${stmt2[i].qty}</BILLEDQTY>
                                <ADDITIONALDETAILS.LIST> </ADDITIONALDETAILS.LIST>
                                <VOUCHERCOMPONENTLIST.LIST> </VOUCHERCOMPONENTLIST.LIST>
                        </BATCHALLOCATIONS.LIST>
                        <DUTYHEADDETAILS.LIST> </DUTYHEADDETAILS.LIST>
                        <RATEDETAILS.LIST> </RATEDETAILS.LIST>
                        <SUPPLEMENTARYDUTYHEADDETAILS.LIST> </SUPPLEMENTARYDUTYHEADDETAILS.LIST>
                        <TAXOBJECTALLOCATIONS.LIST> </TAXOBJECTALLOCATIONS.LIST>
                        <COSTTRACKALLOCATIONS.LIST> </COSTTRACKALLOCATIONS.LIST>
                        <REFVOUCHERDETAILS.LIST> </REFVOUCHERDETAILS.LIST>
                        <EXCISEALLOCATIONS.LIST> </EXCISEALLOCATIONS.LIST>
                        <EXPENSEALLOCATIONS.LIST> </EXPENSEALLOCATIONS.LIST>
                    </INVENTORYENTRIESOUT.LIST>
                    `;
          inventoryEntries_1.push(inventoryEntry_1);
          inventoryEntries_2.push(inventoryEntry_2);
        }

        const inventoryEntriesXML_1 = inventoryEntries_1.join("");
        const inventoryEntriesXML_2 = inventoryEntries_2.join("");

        const xmlData = inventoryEntriesXML_1 + inventoryEntriesXML_2;

        const xml_file_name = item.challan_no.replaceAll("/", "_") + ".xml";
        const filePath = "./files/xml/temp/" + xml_file_name;

        files.push({
          name: xml_file_name,
          path: filePath,
        });

        item.vendorGodown = await getVendorGodown(stmt2[0].in_vendor_name);

        const file_create = fs.writeFileSync(
          filePath,
          xml_data.xml_rm_jw_header(item, helper.randomNumber(99999, 999999)) + xmlData + xml_data.xml_rm_jw_footer(item, helper.randomNumber(99999, 999999))
        );

        const xmlDataWithBackticks = xmlData.replace(/&grave;/g, "`");
        count++;
        if (count === stmt1.length) {
          //START
          const zipFileName = fs.createWriteStream("./files/xml/" + fileName + ".zip");
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

          let stmt = await otherDB.query("UPDATE `user_files_req` SET `status` = 'complete', `other_data` = :other WHERE `user_id`= :uid AND `req_code` = :req_code AND req_date = :req_date", {
            replacements: {
              uid: uid,
              req_code: expression,
              req_date: date,
              other: JSON.stringify({
                fileName: fileName + ".zip",
                fileUrl: "./files/xml/" + fileName + ".zip",
                fileBuffer: "N/A",
              }),
            },
            type: otherDB.QueryTypes.UPDATE,
          });

          // END
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
              filename: "XML report of RM to Jobwork.zip",
              content: fs.readFileSync("./files/xml/" + fileName + ".zip"),
            },
          ];
          helper.sendMail(
            userEmail,
            "",
            expression + " transaction [File Ready for download] Ref:" + helper.randomNumber(99999, 999999),
            htmlTemplate(user[0].user_name, new Date(), "RM to Jobwork in XML", `${process.env.SOCKET_API_URL}/${filePath}`),
            attachment
          );
          //END MAIL

          return;
        }
      });
    }
  } catch (err) {
    console.log("**************************error********************", err);
    let stmt = await otherDB.query("UPDATE `user_files_req` SET `status` = 'failed' WHERE `reactNotificationId`= :uid AND `req_code` = :expression", {
      replacements: {
        expression: expression,
        uid: notificationId,
      },
      type: otherDB.QueryTypes.UPDATE,
    });
    emit_notifications(notificationId);
  }
};
