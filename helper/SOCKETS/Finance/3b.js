const { tallyDB, otherDB, invtDB } = require("../../../config/db/connection");
const xlsx = require("xlsx");
const fs = require("fs");
const moment = require("moment");
const jwt = require("jsonwebtoken");
const { sendMail } = require("../../helper");
const helper = require("../../helper");
const { error_log, verifyToken, emit_error_msg, emit_notifications, download_start_detail } = require("../../utils");
const { htmlTemplate } = require("./EmailTemplate/fileDownload");


const sumProperties = async (arr, invoiceType, annexure) => {
    return arr.reduce((acc, item) => {
        acc.annexure = annexure;
        acc.invoice = invoiceType;
        acc.totalTaxableValue += Number(item.totalTaxableValue);
        acc.totalIGST += Number(item.totalIGST);
        acc.totalCGST += Number(item.totalCGST);
        acc.totalSGST += Number(item.totalSGST);
        acc.totalTax += Number(item.totalTax);
        return acc;
    }, {
        annexure: annexure,
        invoice: invoiceType,
        totalTaxableValue: 0,
        totalIGST: 0,
        totalCGST: 0,
        totalSGST: 0,
        totalTax: 0,
    });
};

exports.gstr3b = async (io, socket) => {
    try {
        socket.on("gstr3b", async (params) => {
            try {
                let req = JSON.parse(params);
                let check = await verifyToken(`${socket.handshake.auth.token}`);
                const userID = check.crn_id;
                // const userID = "CRN2173606";

                if ((req.date && req.notificationId) == "" || (req.date && req.notificationId) == null || (req.date && req.notificationId) == undefined) {
                    await emit_error_msg(io, socket, "some fields are missing")
                }

                let fileName = 'GstrReport_' + helper.getUniqueNumber() + '.xlsx';

                let insertUserRequest = await otherDB.query("INSERT INTO user_files_req ( module_name , request_txt_label,  req_code, user_id , req_date, msg_type , status , reactNotificationId, other_data, insert_date ) VALUES ('FINANCE','GSTR Report', :filename , :uid, :req_data ,'file','pending', :notificationId, :other, :insert_date )", {
                    replacements: {
                        uid: userID,
                        req_data: JSON.stringify(req),
                        other: JSON.stringify({}),
                        insert_date: moment().format("YYYY-MM-DD HH:mm:ss"),
                        filename: fileName.replace(".xlsx", ""),
                        notificationId: req.notificationId
                    },
                    type: otherDB.QueryTypes.INSERT
                });

                let downloadEvent = await download_start_detail(io, socket, "GSTR-1 Report", "pending", req);

                let userDetails = await invtDB.query(`SELECT admin_login.Email_ID , admin_login.user_name , company.company_name , company.company_cin_no , company.company_address , company.companey_city , company.company_pin_code , company.company_gst_no FROM admin_login LEFT JOIN ${global.oakter_db_other}.ims_company AS company ON admin_login.company_id = company.company_id WHERE admin_login.CustID = :CustID`, {
                    replacements: {
                        CustID: userID,
                    },
                    type: invtDB.QueryTypes.SELECT
                });

                const date = req.date.match(/([0-9]{2})-([0-9]{2})-([0-9]{4})/g);
                const date1 = moment(date[0], "DD-MM-YYYY").format("YYYY-MM-DD");
                const date2 = moment(date[1], "DD-MM-YYYY").format("YYYY-MM-DD");

                const fetchLedgers = await tallyDB.query("SELECT ladger_key AS customerCode, COALESCE(SUM(`tally_ledger_data`.`debit`), 0) AS total_debit, COALESCE(SUM(`tally_ledger_data`.`credit`), 0) AS total_credit , module_used AS moduleUsed , debit_key AS debitKey , which_module AS whichModule , ref_date AS refDate FROM `tally_ledger_data` WHERE (`ladger_key` LIKE :ladgerKey1 OR `ladger_key` LIKE :ladgerKey2) AND (`which_module` LIKE :module1 OR `which_module` LIKE :module2) AND (DATE_FORMAT(tally_ledger_data.ref_date, '%Y-%m-%d') BETWEEN :date1 AND :date2) GROUP BY module_used , debit_key", {
                    replacements: {
                        date1: date1,
                        date2: date2,
                        ladgerKey1: '%CUS%',
                        ladgerKey2: '%VEN%',
                        module1: '%INV%',
                        module2: '%VBT07%'
                    },
                    type: tallyDB.QueryTypes.SELECT
                });

                let rcmData = [];
                let salesData = [];

                for (let i = 0; i < fetchLedgers.length; i++) {


                    if (fetchLedgers[i].whichModule == "VBT07") {
                        const getVendor = await invtDB.query("SELECT ven_basic_detail.ven_name AS name , ven_address_detail.ven_add_gst AS gst FROM ven_basic_detail LEFT JOIN ven_address_detail ON ven_basic_detail.ven_register_id = ven_address_detail.ven_id WHERE ven_basic_detail.ven_register_id = :venId", {
                            replacements: {
                                venId: fetchLedgers[i].customerCode
                            },
                            type: invtDB.QueryTypes.SELECT
                        });

                        const amountDetails = await tallyDB.query("SELECT COALESCE(SUM(vbt_taxable_value), 0) AS total_taxable, COALESCE(SUM(vbt_cgst), 0) AS total_cgst, COALESCE(SUM(vbt_sgst), 0) AS total_sgst, COALESCE(SUM(vbt_igst), 0) AS total_igst , COALESCE(SUM(vbt_cgst + vbt_sgst + vbt_igst), 0) AS totalTax FROM tally_vbt WHERE vbt_key = :moduleUsed GROUP BY vbt_key ", {
                            replacements: {
                                moduleUsed: fetchLedgers[i].moduleUsed
                            },
                            type: tallyDB.QueryTypes.SELECT
                        })

                        rcmData.push({
                            gstNo: getVendor[0].gst ?? "",
                            customerCode: fetchLedgers[i].customerCode,
                            customerName: getVendor[0].name,
                            refDate: moment(fetchLedgers[i].refDate).format("DD-MM-YYYY"),
                            voucherType: "RCM Invoices Purchase",
                            voucherNo: fetchLedgers[i].moduleUsed,
                            totalTaxableValue: amountDetails[0].total_taxable,
                            totalCGST: amountDetails[0].total_cgst,
                            totalSGST: amountDetails[0].total_sgst,
                            totalIGST: amountDetails[0].total_igst,
                            totalTax: amountDetails[0].totalTax
                        })
                    }
                    else {
                        const checkBusiness = await tallyDB.query("SELECT shippingGst AS gst , shippingName AS name , state_code.name AS stateName FROM invoice LEFT JOIN state_code ON state_code.code = invoice.shippingState WHERE invoiceID LIKE :invoiceID AND creditNoteID LIKE :creditNoteID", {
                            replacements: {
                                invoiceID: fetchLedgers[i].moduleUsed == "" ? "" : `${fetchLedgers[i].moduleUsed}`,
                                creditNoteID: fetchLedgers[i].debitKey == "--" ? "" : `${fetchLedgers[i].debitKey}`,
                            },
                            type: tallyDB.QueryTypes.SELECT
                        });

                        if (fetchLedgers[i].debitKey != "--" && fetchLedgers[i].debitKey != null && fetchLedgers[i].debitKey != "" && fetchLedgers[i].debitKey != undefined) {
                            const fetchProduct = await tallyDB.query("SELECT COALESCE(SUM(products.taxableValue), 0) AS totalTaxableValue, COALESCE(SUM(products.cgst), 0) AS totalCGST , COALESCE(SUM(products.sgst), 0) AS totalSGST , COALESCE(SUM(products.igst), 0) AS totalIGST , COALESCE(SUM(products.cgst + products.sgst + products.igst), 0) AS totalTax , COALESCE(SUM(products.customerAmount), 0) AS totalCustomerAmount FROM products WHERE creditNoteID = :creditNoteKey GROUP BY creditNoteID HAVING totalTax > 0", {
                                replacements: {
                                    creditNoteKey: fetchLedgers[i].debitKey
                                },
                                type: tallyDB.QueryTypes.SELECT
                            });

                            if (fetchProduct.length > 0) {
                                salesData.push({
                                    gstNo: checkBusiness[0].gst,
                                    customerCode: fetchLedgers[i].customerCode,
                                    customerName: checkBusiness[0].name,
                                    refDate: moment(fetchLedgers[i].refDate).format("DD-MMM-YYYY"),
                                    voucherType: fetchLedgers[i].moduleUsed.startsWith("RIOT") ? "D-Sales" : "E-Sales",
                                    voucherNo: fetchLedgers[i].debitKey,
                                    totalTaxableValue: "-" + fetchProduct[0].totalTaxableValue,
                                    totalCGST: fetchProduct[0].totalCGST ? "-" + fetchProduct[0].totalCGST : 0,
                                    totalSGST: fetchProduct[0].totalSGST ? "-" + fetchProduct[0].totalSGST : 0,
                                    totalIGST: fetchProduct[0].totalIGST ? "-" + fetchProduct[0].totalIGST : 0,
                                    totalTax: "-" + fetchProduct[0].totalTax,
                                    totalCustomerAmount: "-" + fetchProduct[0].totalCustomerAmount,
                                });
                            }

                        } else {
                            const fetchProduct = await tallyDB.query("SELECT COALESCE(SUM(products.taxableValue), 0) AS totalTaxableValue, COALESCE(SUM(products.cgst), 0) AS totalCGST , COALESCE(SUM(products.sgst), 0) AS totalSGST , COALESCE(SUM(products.igst), 0) AS totalIGST , COALESCE(SUM(products.cgst + products.sgst + products.igst), 0) AS totalTax , COALESCE(SUM(products.customerAmount), 0) AS totalCustomerAmount FROM products WHERE invoiceID = :invoiceID AND creditNoteID = '' GROUP BY invoiceID HAVING totalTax > 0", {
                                replacements: {
                                    invoiceID: fetchLedgers[i].moduleUsed
                                },
                                type: tallyDB.QueryTypes.SELECT
                            });
                            if (fetchProduct.length > 0) {
                                salesData.push({
                                    gstNo: checkBusiness[0].gst,
                                    customerCode: fetchLedgers[i].customerCode,
                                    customerName: checkBusiness[0].name,
                                    refDate: moment(fetchLedgers[i].refDate).format("DD-MMM-YYYY"),
                                    voucherType: fetchLedgers[i].moduleUsed.startsWith("RIOT") ? "D-Sales" : "E-Sales",
                                    voucherNo: fetchLedgers[i].moduleUsed,
                                    totalTaxableValue: fetchProduct[0].totalTaxableValue,
                                    totalCGST: fetchProduct[0].totalCGST,
                                    totalSGST: fetchProduct[0].totalSGST,
                                    totalIGST: fetchProduct[0].totalIGST,
                                    totalTax: fetchProduct[0].totalTax,
                                    totalCustomerAmount: fetchProduct[0].totalCustomerAmount,
                                });
                            }
                        }
                    }

                }

                const detailedSalesData = xlsx.utils.json_to_sheet([
                    {
                        A: "Report Date",
                        B: `${moment(date1).format('DD-MMM-YYYY')} to ${moment(date2).format('DD-MMM-YYYY')}`,
                    }
                ],
                    {
                        header: ["A"],
                        skipHeader: true,
                    }
                );

                xlsx.utils.sheet_add_json(detailedSalesData, [
                    {
                        A3: "GSTIN",
                        B3: "CUSTOMER CODE",
                        C3: "CUSTOMER NAME",
                        D3: "REFERENCE DATE",
                        E3: "VOUCHER TYPE",
                        F3: "VOUCHER NO",
                        G3: "TOTAL TAXABLE VALUE",
                        H3: "TOTAL CGST",
                        I3: "TOTAL SGST",
                        J3: "TOTAL IGST",
                        K3: "TOTAL TAX",
                    }
                ],
                    {
                        skipHeader: true,
                        origin: "A3"
                    }
                );

                xlsx.utils.sheet_add_json(detailedSalesData, salesData, { skipHeader: true, origin: "A4" });

                const detailedRCMData = xlsx.utils.json_to_sheet([
                    {
                        A: "Report Date",
                        B: `${moment(date1).format('DD-MMM-YYYY')} to ${moment(date2).format('DD-MMM-YYYY')}`,
                    }
                ],
                    {
                        header: ["A"],
                        skipHeader: true,
                    }
                );

                xlsx.utils.sheet_add_json(detailedRCMData, [
                    {
                        A3: "GSTIN",
                        B3: "CUSTOMER CODE",
                        C3: "CUSTOMER NAME",
                        D3: "REFERENCE DATE",
                        E3: "VOUCHER TYPE",
                        F3: "VOUCHER NO",
                        G3: "TOTAL TAXABLE VALUE",
                        H3: "TOTAL CGST",
                        I3: "TOTAL SGST",
                        J3: "TOTAL IGST",
                        K3: "TOTAL TAX",
                    }
                ],
                    {
                        skipHeader: true,
                        origin: "A3"
                    }
                );

                xlsx.utils.sheet_add_json(detailedRCMData, rcmData, { skipHeader: true, origin: "A4" });

                const salesCombined = await sumProperties(salesData, "Inward Supplies (applicable for Reverse Charge)", "Annexure 3.1a");
                const rcmCombined = await sumProperties(rcmData, "Outward Taxable Supplies (other than Zero Rated, Nil Rated, and Exempted Supplies)", "Annexure 3.1d");

                const annexure1 = xlsx.utils.json_to_sheet([
                    {
                        A: "Report Date",
                        B: `${moment(date1).format('DD-MMM-YYYY')} to ${moment(date2).format('DD-MMM-YYYY')}`,
                    }
                ],
                    {
                        header: ["A"],
                        skipHeader: true,
                    }
                );

                xlsx.utils.sheet_add_json(annexure1, [
                    {
                        A9: "TYPE",
                        B9: "PARTICULARS",
                        C9: "TAXABLE AMOUNT",
                        D9: "IGST",
                        E9: "CGST",
                        F9: "SGST",
                        G9: "TAX AMOUNT",
                    }
                ],
                    {
                        skipHeader: true,
                        origin: "A3"
                    }
                );

                xlsx.utils.sheet_add_json(annexure1, [salesCombined, {
                    annexure: 'Annexure 3.1b',
                    invoice: 'Outward Taxable Supplies (Zero Rated)',
                }, {
                        annexure: 'Annexure 3.1c',
                        invoice: 'Other Outward Supplies (Nil Rated And Exempted)',
                    }, rcmCombined, {
                        annexure: 'Annexure 3.1e',
                        invoice: 'Non-GST Outward Supplies',
                    }], { skipHeader: true, origin: "A4" });



                const merged3dot1 = await sumProperties([rcmCombined, salesCombined], "Tax on Outward and Reverse Charge Inward Supplies", "Annexure 3.1");
                //-----------------------------------------------------------------------

                const mainSheet = xlsx.utils.json_to_sheet([
                    {
                        A: `${userDetails[0].company_name}\n${userDetails[0].company_address}\n${userDetails[0].companey_city} - ${userDetails[0].company_pin_code}\nCIN : ${userDetails[0].company_cin_no}\n'Report Name : GSTR-1'\nReport Date : ${moment(date1).format('DD-MMM-YYYY')} to ${moment(date2).format('DD-MMM-YYYY')}\n'GSTIN : ' + ${userDetails[0].company_gst_no}`,
                    },
                ],
                    {
                        header: ["A"],
                        skipHeader: true,
                    }
                );

                xlsx.utils.sheet_add_json(mainSheet, [
                    {
                        A9: "TYPE",
                        B9: "PARTICULARS",
                        C9: "TAXABLE AMOUNT",
                        D9: "IGST",
                        E9: "CGST",
                        F9: "SGST",
                        G9: "TAX AMOUNT",
                    }
                ],
                    {
                        skipHeader: true,
                        origin: "A9"
                    }
                );

                xlsx.utils.sheet_add_json(mainSheet, [merged3dot1, {
                    annexure: 'Annexure 3.2',
                    invoice: 'Interstate Supplies',
                }, {
                        annexure: 'Annexure 4',
                        invoice: 'Eligible for Input Tax Credit',
                    }, {
                        annexure: 'Annexure 5',
                        invoice: 'Exempt, Nil Rated, and Non-GST Inward Supplies',
                    },
                    {
                        annexure: 'Annexure 6',
                        invoice: 'Interese, Late Fee, Penalty and Others',
                    }], { skipHeader: true, origin: "A10" });

                const merge = [
                    {
                        s: { r: 0, c: 0 },
                        e: { r: 6, c: 2 }
                    }
                ]
                mainSheet["!merges"] = merge;

                const workbook = xlsx.utils.book_new();
                xlsx.utils.book_append_sheet(workbook, mainSheet, "GSTR-3B");
                xlsx.utils.book_append_sheet(workbook, annexure1, "Annexure 3.1");
                xlsx.utils.book_append_sheet(workbook, detailedSalesData, "Detailed Annexure 3.1a");
                xlsx.utils.book_append_sheet(workbook, detailedRCMData, "Detailed Annexure 3.1d");

                xlsx.write(workbook, { bookType: "xlsx", type: "buffer" });
                xlsx.writeFile(workbook, "./files/gstr3b/" + fileName);

                let attachment = [
                    {
                        filename: fileName.split("_")[0] + ".xlsx",
                        content: fs.readFileSync("./files/gstr3b/" + fileName),
                    }
                ]

                let updateUserRequest = await otherDB.query("UPDATE user_files_req SET status = 'complete' , other_data = :otherData , update_date = :updateDate WHERE user_id = :uid AND req_date = :req_data AND req_code = :filename", {
                    replacements: {
                        uid: userID,
                        req_data: JSON.stringify(req),
                        otherData: JSON.stringify({
                            fileName: fileName,
                            fileUrl: "./files/gstr3b/" + fileName
                        }),
                        filename: fileName.replace(".xlsx", ""),
                        updateDate: moment().format("YYYY-MM-DD HH:mm:ss")
                    },
                    type: otherDB.QueryTypes.UPDATE,
                });

                await emit_notifications(io, socket, req.notificationId);

                const sendEmail = await sendMail(userDetails[0].Email_ID, "", "GSTR-3B Report", htmlTemplate(userDetails[0].user_name, new Date(), "GSTR-3B"), attachment);

            } catch (error) {
                console.log("error inner try:=", error);
                error_log({ stack: error.stack });
            }
        })
    } catch (error) {
        console.log("error :=", error);
        error_log({ stack: error.stack });
    }
}