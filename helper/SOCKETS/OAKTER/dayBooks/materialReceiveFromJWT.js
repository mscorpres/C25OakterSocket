const path = require("path");
const moment = require("moment");
const XLSX = require("xlsx");
const jwt = require("jsonwebtoken");
const Validator = require("validatorjs");
const fs = require("fs");

const helper = require("../../../../helper/helper");
const { otherDB, invtDB } = require("../../../../config/db/connection");
const { htmlTemplate } = require("../../../backendProcess/EmailTemplate/fileDownload");

const { error_log, emit_error_msg } = require("../../../utils");


exports.materialReceiveFromJWT = async (date, uid, emit_notifications, notificationId, socket, io) => {

    try {
        query =
            "SELECT *, `rm_location`.`insert_date` FROM `rm_location` LEFT JOIN `components` ON rm_location.components_id = components.component_key LEFT JOIN units ON components.c_uom = units.units_id LEFT JOIN location_main ON rm_location.loc_in = location_main.location_key LEFT JOIN admin_login ON rm_location.insert_by = admin_login.CustID WHERE `components`.`c_type` = 'R' AND DATE_FORMAT(rm_location.insert_date,'%Y-%m-%d') BETWEEN :date1 AND :date2 AND `rm_location`.trans_type = 'INWARD' AND in_module = 'IN-JWI' ORDER BY rm_location.insert_date DESC";
        replacements = {
            replacements: { date1: date, date2: date },
            type: invtDB.QueryTypes.SELECT,
        };

        let result = await invtDB.query(query, replacements);
        if (result.length > 0) {
            let finalResult = [];
            result.forEach(async (element) => {
                let vendor = "";
                if (element.vendor_type == "v01") {
                    vendor = "Vendor";
                } else if (element.vendor_type == "j01") {
                    vendor = "JWI";
                } else if (element.vendor_type == "s01") {
                    vendor = "SortIn";
                } else if (element.vendor_type == "r01") {
                    vendor = "RejIn";
                } else if (element.vendor_type == "p01") {
                    vendor = "ProdReturn";
                } else {
                    vendor = "N/A";
                }

                let vendorName;
                let stmt_vendorName;
                stmt_vendorName = await invtDB.query("SELECT `po_vendor_name` FROM `po_purchase_req` WHERE `po_transaction` = :po", {
                    replacements: { po: element.in_po_transaction_id },
                    type: invtDB.QueryTypes.SELECT,
                });
                if (stmt_vendorName.length > 0) {
                    vendorName = stmt_vendorName[0].po_vendor_name;
                } else {
                    stmt_vendorName = await invtDB.query("SELECT `ven_name` FROM `ven_basic_detail` WHERE `ven_register_id` = :vendor", {
                        replacements: { vendor: element.in_vendor_name },
                        type: invtDB.QueryTypes.SELECT,
                    });
                    if (stmt_vendorName.length > 0) {
                        vendorName = stmt_vendorName[0].ven_name;
                    } else {
                        vendorName = "N/A";
                    }
                }

                if (element.in_po_invoice_id !== "--") {
                    invoice_number = element.in_po_invoice_id;
                    po_number = element.in_po_transaction_id;
                } else {
                    if (element.in_invoice_id !== "--") {
                        invoice_number = element.in_invoice_id;
                        po_number = element.in_jw_transaction_id;
                    } else {
                        invoice_number = "N/A";
                        po_number = "N/A";
                    }
                }

                if (element.currency_type == "--" || element.currency_type == "" || element.currency_type == "364907247") {
                    currency = "INR";
                } else {
                    currency = "USD";
                }

                let inQty = parseInt(element.qty) + parseInt(element.other_qty);

                let hsncode = "";
                if (element.in_hsn_code !== "" && element.in_hsn_code !== "--") {
                    hsncode = element.in_hsn_code;
                } else {
                    hsncode = "--";
                }

                finalResult.push({
                    DATE: moment(element.insert_date, "YYYY-MM-DD HH:mm:ss").format("DD-MM-YYYY HH:mm:ss"),
                    COMPONENT: element.c_name,
                    PART: element.c_part_no,
                    HSNCODE: hsncode,
                    VENDOR_CODE: element.in_vendor_name,
                    LOCATION: element.loc_name,
                    RATE: element.in_po_rate,
                    CURRENCY: currency,
                    INQTY: inQty,
                    UNIT: element.units_name,
                    VENDOR: vendorName,
                    PONUMBER: po_number,
                    INVOIVENUMBER: invoice_number,
                    TRANSACTION: element.in_transaction_id,
                    ADDED_BY: element.user_name,
                    VENDOR_TYPE: vendor,
                    EWAY_BILL_DOC_ID: element.min_ewaybill,
                    COMMENT: element.any_remark,
                });

                if (finalResult.length == result.length) {
                    const worksheet = XLSX.utils.json_to_sheet(finalResult);
                    const workbook = XLSX.utils.book_new();

                    XLSX.utils.book_append_sheet(workbook, worksheet, "JW Inward");

                    //buffer we use to handle the big file
                    XLSX.write(workbook, { bookType: "csv", type: "buffer" });
                    //   xlsx.write(workbook, { bookType: "xlsx", type: "binary" });

                    let randKey = Math.floor(Math.random() * (999 - 100 + 1)) + 100;

                    let fileGenarateName = "./files/excel/JW_MIN" + randKey + ".csv"

                    XLSX.writeFile(workbook, fileGenarateName);


                    let stmt = await otherDB.query("UPDATE user_files_req SET status = 'complete', other_data = :other WHERE user_id= :uid AND req_code = 'MATERIAL_RECEIVE_FROM_JW'", {
                        replacements: {
                            uid: uid,
                            other: JSON.stringify({
                                fileName: `JW_MIN${randKey}.csv`,
                                fileUrl: fileGenarateName,
                                fileBuffer: Buffer.from(fileGenarateName, "base64"),
                            }),
                        },
                        type: otherDB.QueryTypes.UPDATE,
                    });
                    emit_notifications(io, socket, notificationId);

                    // SEND USER MAIL
                    let user = await invtDB.query("SELECT `Email_ID`,`user_name` from `admin_login` WHERE `CustID`= :CustID", {
                        replacements: {
                            CustID: uid,
                        },
                        type: invtDB.QueryTypes.SELECT,
                    });
                    let userEmail = user[0].Email_ID;
                    let attachment = [
                        {
                            filename: "JW_MIN" + date + ".csv",
                            content: fs.readFileSync(fileGenarateName),
                        },
                    ];
                    await helper.sendMail(userEmail, "", "JW MIN REPORT [File Ready for download] Ref:" + helper.randomNumber(100 ,999), htmlTemplate(user[0].user_name, new Date(), "R1", `${process.env.SOCKET_API_URL}/${fileGenarateName}`), attachment);
                    //END MAIL
                    return;
                }
            });
        } else {
            let stmt_update = await otherDB.query("UPDATE user_files_req SET status = 'complete', other_data = :other WHERE user_id= :uid AND req_code = 'MATERIAL_RECEIVE_FROM_JW'", {
                replacements: {
                    uid: uid,
                    other: "{}",
                },
                type: otherDB.QueryTypes.UPDATE,
            });
            return;
        }

    } catch (err) {
        error_log({ stack: err.stack });
    }


}