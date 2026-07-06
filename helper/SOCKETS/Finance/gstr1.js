const { tallyDB, otherDB, invtDB } = require("../../../config/db/connection");
const xlsx = require("xlsx");
const fs = require("fs");
const moment = require("moment");
const jwt = require("jsonwebtoken");
const { sendMail } = require("../../helper");
const helper = require("../../helper");
const { error_log, verifyToken, emit_error_msg, emit_notifications, download_start_detail } = require("../../utils");
const { htmlTemplate } = require("./EmailTemplate/fileDownload");

async function gstWise(array) {
    let obj = {}

    let result = array.map((elem) => {
        if (obj[elem.gstNo]) {
            obj[elem.gstNo].voucherCount += 1;
            obj[elem.gstNo].totalTaxableValue = +(obj[elem.gstNo].totalTaxableValue) + +elem.totalTaxableValue;
            obj[elem.gstNo].totalCGST = +(obj[elem.gstNo].totalCGST) + +elem.totalCGST;
            obj[elem.gstNo].totalSGST = +(obj[elem.gstNo].totalSGST) + +elem.totalSGST;
            obj[elem.gstNo].totalIGST = +(obj[elem.gstNo].totalIGST) + +elem.totalIGST;
            obj[elem.gstNo].totalTax = +(obj[elem.gstNo].totalTax) + +elem.totalTax;
            obj[elem.gstNo].totalCustomerAmount = +(obj[elem.gstNo].totalCustomerAmount) + +elem.totalCustomerAmount;
        } else {
            obj[elem.gstNo] = {
                "gstNo": elem.gstNo,
                "customerCode": elem.customerCode,
                "customerName": elem.customerName,
                "totalTaxableValue": elem.totalTaxableValue,
                "totalCGST": elem.totalCGST,
                "totalSGST": elem.totalSGST,
                "totalIGST": elem.totalIGST,
                "totalTax": elem.totalTax,
                "totalCustomerAmount": elem.totalCustomerAmount,
                "voucherCount": 1
            }
        }
    });

    return Object.values(obj);
}

async function stateWise(array) {
    let obj = {}

    let result = array.map((elem) => {
        if (obj[elem.stateName]) {
            obj[elem.stateName].voucherCount += 1;
            obj[elem.stateName].totalTaxableValue = +(obj[elem.stateName].totalTaxableValue) + +elem.totalTaxableValue;
            obj[elem.stateName].totalCGST = +(obj[elem.stateName].totalCGST) + +elem.totalCGST;
            obj[elem.stateName].totalSGST = +(obj[elem.stateName].totalSGST) + +elem.totalSGST;
            obj[elem.stateName].totalIGST = +(obj[elem.stateName].totalIGST) + +elem.totalIGST;
            obj[elem.stateName].totalTax = +(obj[elem.stateName].totalTax) + +elem.totalTax;
            obj[elem.stateName].totalCustomerAmount = +(obj[elem.stateName].totalCustomerAmount) + +elem.totalCustomerAmount;
        } else {
            obj[elem.stateName] = {
                "stateName": elem.stateName,
                "customerCode": elem.customerCode,
                "customerName": elem.customerName,
                "totalTaxableValue": elem.totalTaxableValue,
                "totalCGST": elem.totalCGST,
                "totalSGST": elem.totalSGST,
                "totalIGST": elem.totalIGST,
                "totalTax": elem.totalTax,
                "totalCustomerAmount": elem.totalCustomerAmount,
                "voucherCount": 1
            }
        }
    })

    return Object.values(obj);
}

const sumProperties = async (arr, invoiceType, annexure) => {
    return arr.reduce((acc, item) => {
        acc.annexure = annexure;
        acc.invoice = invoiceType;
        acc.voucherCount += item.voucherCount;
        acc.totalTaxableValue += Number(item.totalTaxableValue);
        acc.totalIGST += Number(item.totalIGST);
        acc.totalCGST += Number(item.totalCGST);
        acc.totalSGST += Number(item.totalSGST);
        acc.totalTax += Number(item.totalTax);
        acc.totalCustomerAmount += Number(item.totalCustomerAmount);
        return acc;
    }, {
        annexure: annexure,
        invoice: invoiceType,
        voucherCount: 0,
        totalTaxableValue: 0,
        totalIGST: 0,
        totalCGST: 0,
        totalSGST: 0,
        totalTax: 0,
        totalCustomerAmount: 0,
    });
};

async function hsnWise(array) {
    let obj = {}

    let result = array.map((elem) => {
        if (obj[elem.hsnsac]) {
            obj[elem.hsnsac].totalTaxableValue = +(obj[elem.hsnsac].totalTaxableValue) + +elem.taxableValue;

            obj[elem.hsnsac].totalCGST = +(obj[elem.hsnsac].totalCGST) + +elem.cgst;

            obj[elem.hsnsac].totalSGST = +(obj[elem.hsnsac].totalSGST) + +elem.sgst;

            obj[elem.hsnsac].totalIGST = +(obj[elem.hsnsac].totalIGST) + +elem.igst;

            obj[elem.hsnsac].totalTax = +(obj[elem.hsnsac].totalTax) + +elem.cgst + +elem.sgst + +elem.igst;

            obj[elem.hsnsac].totalCustomerAmount = +(obj[elem.hsnsac].totalCustomerAmount) + +elem.customerAmount;
			
			obj[elem.hsnsac].quantity = +(obj[elem.hsnsac].quantity) + +elem.quantity;

        } else {
            obj[elem.hsnsac] = {
                "hsnsac": elem.hsnsac,
                "uom": `${elem.uom ?? "NA"} ${elem.uomDetails ? '- ' + elem.uomDetails : ""}`,
                "quantity": elem.quantity,
                "totalCustomerAmount": elem.customerAmount,
                "gstRate": elem.gstRate + "%",
                "totalTaxableValue": elem.taxableValue,
                "totalIGST": elem.igst,
                "totalCGST": elem.cgst,
                "totalSGST": elem.sgst,
                "totalTax": +elem.cgst + +elem.sgst + +elem.igst,
            }
        }
    });
    return Object.values(obj);
}

exports.gstrReport = async (io, socket) => {
    try {
        socket.on("gstrReport", async (params) => {
            try {
                // console.log("gstrReport", params);
                let req = JSON.parse(params);
                console.log("req", req);
                let check = await verifyToken(`${socket.handshake.auth.token}`);
                const userID = check.crn_id;

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

                const gstRegex = new RegExp(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/);

                const fetchLedgers = await tallyDB.query("SELECT ladger_key AS customerCode, COALESCE(SUM(`tally_ledger_data`.`debit`), 0) AS total_debit, COALESCE(SUM(`tally_ledger_data`.`credit`), 0) AS total_credit , module_used AS moduleUsed , debit_key AS debitKey , which_module AS whichModule , ref_date AS refDate FROM `tally_ledger_data` WHERE `ladger_key` LIKE :ladgerKey AND `which_module` LIKE :whichModule AND (DATE_FORMAT(tally_ledger_data.ref_date, '%Y-%m-%d') BETWEEN :date1 AND :date2) GROUP BY module_used , debit_key", {
                    replacements: {
                        date1: date1,
                        date2: date2,
                        ladgerKey: '%CUS%',
                        whichModule: '%INV%',
                    },
                    type: tallyDB.QueryTypes.SELECT
                });

                let b2bSales = [];
                let b2bCN = [];
                let b2cSales = [];
                let b2cCN = [];

                for (let i = 0; i < fetchLedgers.length; i++) {

                    const checkBusiness = await tallyDB.query("SELECT shippingGst AS gst , shippingName AS name , state_code.name AS stateName FROM invoice LEFT JOIN state_code ON state_code.code = invoice.shippingState WHERE invoiceID LIKE :invoiceID AND creditNoteID LIKE :creditNoteID", {
                        replacements: {
                            invoiceID: fetchLedgers[i].moduleUsed == "" ? "" : `${fetchLedgers[i].moduleUsed}`,
                            creditNoteID: fetchLedgers[i].debitKey == "--" ? "" : `${fetchLedgers[i].debitKey}`,
                        },
                        type: tallyDB.QueryTypes.SELECT
                    });

                    const isB2B = gstRegex.test(checkBusiness[0].gst)

                    if (isB2B == true) {

                        if (fetchLedgers[i].debitKey != "--" && fetchLedgers[i].debitKey != null && fetchLedgers[i].debitKey != "" && fetchLedgers[i].debitKey != undefined) {
                            const fetchProduct = await tallyDB.query("SELECT COALESCE(SUM(products.taxableValue), 0) AS totalTaxableValue, COALESCE(SUM(products.cgst), 0) AS totalCGST , COALESCE(SUM(products.sgst), 0) AS totalSGST , COALESCE(SUM(products.igst), 0) AS totalIGST , COALESCE(SUM(products.cgst + products.sgst + products.igst), 0) AS totalTax , COALESCE(SUM(products.customerAmount), 0) AS totalCustomerAmount FROM products WHERE creditNoteID = :creditNoteKey GROUP BY creditNoteID HAVING totalTax > 0", {
                                replacements: {
                                    creditNoteKey: fetchLedgers[i].debitKey
                                },
                                type: tallyDB.QueryTypes.SELECT
                            });

                            if (fetchProduct.length > 0) {
                                b2bCN.push({
                                    gstNo: checkBusiness[0].gst,
                                    customerCode: fetchLedgers[i].customerCode,
                                    customerName: checkBusiness[0].name,
                                    refDate: moment(fetchLedgers[i].refDate).format("DD-MMM-YYYY"),
                                    voucherType: "Credit Note",
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
                                b2bSales.push({
                                    gstNo: checkBusiness[0].gst,
                                    customerCode: fetchLedgers[i].customerCode,
                                    customerName: checkBusiness[0].name,
                                    refDate: moment(fetchLedgers[i].refDate).format("DD-MMM-YYYY"),
                                    voucherType: "Sales",
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
                    } else {
                        if (fetchLedgers[i].debitKey != "--" && fetchLedgers[i].debitKey != null && fetchLedgers[i].debitKey != "" && fetchLedgers[i].debitKey != undefined) {
                            const fetchProduct = await tallyDB.query("SELECT COALESCE(SUM(products.taxableValue), 0) AS totalTaxableValue, COALESCE(SUM(products.cgst), 0) AS totalCGST , COALESCE(SUM(products.sgst), 0) AS totalSGST , COALESCE(SUM(products.igst), 0) AS totalIGST , COALESCE(SUM(products.cgst + products.sgst + products.igst), 0) AS totalTax , COALESCE(SUM(products.customerAmount), 0) AS totalCustomerAmount FROM products WHERE creditNoteID = :creditNoteKey GROUP BY creditNoteID HAVING totalTax > 0", {
                                replacements: {
                                    creditNoteKey: fetchLedgers[i].debitKey
                                },
                                type: tallyDB.QueryTypes.SELECT
                            });

                            if (fetchProduct.length > 0) {
                                b2cCN.push({
                                    stateName: checkBusiness[0].stateName,
                                    customerCode: fetchLedgers[i].customerCode,
                                    customerName: checkBusiness[0].name,
                                    refDate: moment(fetchLedgers[i].refDate).format("DD-MMM-YYYY"),
                                    voucherType: "Credit Note",
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
                                b2cSales.push({
                                    stateName: checkBusiness[0].stateName,
                                    customerCode: fetchLedgers[i].customerCode,
                                    customerName: checkBusiness[0].name,
                                    refDate: moment(fetchLedgers[i].refDate).format("DD-MMM-YYYY"),
                                    voucherType: "Sales",
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

                const fetchProductsSales = await tallyDB.query(`SELECT tallyProduct.invoiceID , tallyProduct.creditNoteID , tallyProduct.customerCode , tallyProduct.hsnsac AS hsnsac , tallyProduct.quantity AS quantity , tallyProduct.taxableValue AS taxableValue , tallyProduct.cgst AS cgst , tallyProduct.sgst AS sgst , tallyProduct.igst AS igst , tallyProduct.customerAmount AS customerAmount , tallyProduct.gstRate AS gstRate , invtUnits.units_name AS uom , invtUnits.units_details AS uomDetails FROM ${global.oakter_db_tally}.products AS tallyProduct LEFT JOIN ${global.oakter_db_tally}.invoice AS tallyInvoice ON tallyInvoice.invoiceID = tallyProduct.invoiceID AND tallyInvoice.creditNoteID = tallyProduct.creditNoteID LEFT JOIN ${global.oakter_db_invt}.products AS invtProduct ON invtProduct.product_key = tallyProduct.productID LEFT JOIN ${global.oakter_db_invt}.units AS invtUnits ON invtUnits.units_id = invtProduct.p_uom WHERE DATE_FORMAT(tallyInvoice.refDate, '%Y-%m-%d') BETWEEN :date1 AND :date2 AND tallyInvoice.creditNoteID = ''`, {
                    replacements: {
                        date1: date1,
                        date2: date2
                    },
                    type: tallyDB.QueryTypes.SELECT
                });

                let salesProducts = []

                if (fetchProductsSales.length > 0) {
                    for (let i = 0; i < fetchProductsSales.length; i++) {
                        
                        let totalTax = +fetchProductsSales[i].cgst + +fetchProductsSales[i].sgst + +fetchProductsSales[i].igst;

                        salesProducts.push({
                            voucher: "Sales",
                            voucherNo: fetchProductsSales[i].invoiceID,
                            customerCode: fetchProductsSales[i].customerCode,
                            hsnsac: fetchProductsSales[i].hsnsac,
                            quantity: fetchProductsSales[i].quantity,
                            uom: fetchProductsSales[i].uom,
                            uomDetails: fetchProductsSales[i].uomDetails,
                            taxableValue: (+fetchProductsSales[i].taxableValue).toFixed(2),
                            gstRate: fetchProductsSales[i].gstRate,
                            cgst: (+fetchProductsSales[i].cgst).toFixed(2),
                            sgst: (+fetchProductsSales[i].sgst).toFixed(2),
                            igst: (+fetchProductsSales[i].igst).toFixed(2),
                            totalTax: (+totalTax).toFixed(2),
                            customerAmount: (+fetchProductsSales[i].customerAmount).toFixed(2),
                        })
                    }
                }

                const fetchProductsReturn = await tallyDB.query(`SELECT tallyProduct.invoiceID , tallyProduct.creditNoteID , tallyProduct.customerCode , tallyProduct.hsnsac AS hsnsac , tallyProduct.quantity AS quantity , tallyProduct.taxableValue AS taxableValue , tallyProduct.cgst AS cgst , tallyProduct.sgst AS sgst , tallyProduct.igst AS igst , tallyProduct.customerAmount AS customerAmount , tallyProduct.gstRate AS gstRate , invtUnits.units_name AS uom , invtUnits.units_details AS uomDetails FROM ${global.oakter_db_tally}.products AS tallyProduct LEFT JOIN ${global.oakter_db_tally}.invoice AS tallyInvoice ON tallyInvoice.invoiceID = tallyProduct.invoiceID AND tallyInvoice.creditNoteID = tallyProduct.creditNoteID LEFT JOIN ${global.oakter_db_invt}.products AS invtProduct ON invtProduct.product_key = tallyProduct.productID LEFT JOIN ${global.oakter_db_invt}.units AS invtUnits ON invtUnits.units_id = invtProduct.p_uom WHERE DATE_FORMAT(tallyInvoice.refDate, '%Y-%m-%d') BETWEEN :date1 AND :date2 AND tallyInvoice.creditNoteID != ''`, {
                    replacements: {
                        date1: date1,
                        date2: date2
                    },
                    type: tallyDB.QueryTypes.SELECT
                });

                let returnProducts = []

                if (fetchProductsReturn.length > 0) {
                    for (let i = 0; i < fetchProductsReturn.length; i++) {

                        let totalTax = +fetchProductsReturn[i].cgst + +fetchProductsReturn[i].sgst + +fetchProductsReturn[i].igst;

                        returnProducts.push({
                            voucher: "Credit Note",
                            voucherNo: fetchProductsReturn[i].creditNoteID,
                            customerCode: fetchProductsReturn[i].customerCode,
                            hsnsac: fetchProductsReturn[i].hsnsac,
                            quantity: "-" + fetchProductsReturn[i].quantity,
                            uom: fetchProductsReturn[i].uom,
                            uomDetails: fetchProductsReturn[i].uomDetails,
                            taxableValue: fetchProductsReturn[i].taxableValue ? "-" + (+fetchProductsReturn[i].taxableValue).toFixed(2) : 0,
                            gstRate: fetchProductsReturn[i].gstRate,
                            cgst: fetchProductsReturn[i].cgst ? "-" + (+fetchProductsReturn[i].cgst).toFixed(2) : 0,
                            sgst: fetchProductsReturn[i].sgst ? "-" + (+fetchProductsReturn[i].sgst).toFixed(2) : 0,
                            igst: fetchProductsReturn[i].igst ? "-" + (+fetchProductsReturn[i].igst).toFixed(2) : 0,
                            totalTax: totalTax ? "-" + (+totalTax).toFixed(2) : 0,
                            customerAmount: fetchProductsReturn[i].customerAmount ? "-" + (+fetchProductsReturn[i].customerAmount).toFixed(2) : 0,
                        })
                    }
                }

                const hsnWiseData = await hsnWise(salesProducts.concat(returnProducts));
                // console.log("product", product);
                // return

                const b2bSalesGstWise = await gstWise(b2bSales);
                const b2bCNGstWise = await gstWise(b2bCN);
                const b2cStateWise = await stateWise(b2cSales.concat(b2cCN));

                const mergedB2BSales = await sumProperties(b2bSalesGstWise, "B2B Invoices - 4A, 4B, 4C, 6B, 6C", "Annexure 1");
                const mergedB2BCN = await sumProperties(b2bCNGstWise, "Credit or Debit Notes (Registered) - 9B", "Annexure 4");
                const mergedB2CState = await sumProperties(b2cStateWise, "B2C (Small) Invoices - 7", "Annexure 11");

                // console.log("mergedB2BSales-->", mergedB2BSales);

                // console.log("b2bSalesGstWise-->", b2bSalesGstWise);

                const combinedB2BSalesSheet = xlsx.utils.json_to_sheet([
                    {
                        A: `Report Date`,
                        B: `${moment(date1).format('DD-MMM-YYYY')} to ${moment(date2).format('DD-MMM-YYYY')}`,
                    }
                ],
                    {
                        header: ["A"],
                        skipHeader: true,
                    }
                );

                xlsx.utils.sheet_add_json(combinedB2BSalesSheet, [
                    {
                        A3: "GSTIN",
                        B3: "CUSTOMER CODE",
                        C3: "CUSTOMER NAME",
                        D3: "TOTAL TAXABLE VALUE",
                        E3: "TOTAL CGST",
                        F3: "TOTAL SGST",
                        G3: "TOTAL IGST",
                        H3: "TOTAL TAX",
                        I3: "TOTAL CUSTOMER AMOUNT",
                        J3: "VOUCHER COUNT",
                    }
                ],
                    {
                        skipHeader: true,
                        origin: "A3"
                    }
                );

                xlsx.utils.sheet_add_json(combinedB2BSalesSheet, b2bSalesGstWise, { skipHeader: true, origin: "A4" });

                const combinedCNSheet = xlsx.utils.json_to_sheet([
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

                xlsx.utils.sheet_add_json(combinedCNSheet, [
                    {
                        A3: "GSTIN",
                        B3: "CUSTOMER CODE",
                        C3: "CUSTOMER NAME",
                        D3: "TOTAL TAXABLE VALUE",
                        E3: "TOTAL CGST",
                        F3: "TOTAL SGST",
                        G3: "TOTAL IGST",
                        H3: "TOTAL TAX",
                        I3: "TOTAL CUSTOMER AMOUNT",
                        J3: "VOUCHER COUNT",
                    }
                ],
                    {
                        skipHeader: true,
                        origin: "A3"
                    }
                );

                xlsx.utils.sheet_add_json(combinedCNSheet, b2bCNGstWise, { skipHeader: true, origin: "A4" });

                const combinedStateSheet = xlsx.utils.json_to_sheet([
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

                xlsx.utils.sheet_add_json(combinedStateSheet, [
                    {
                        A3: "STATE",
                        B3: "CUSTOMER CODE",
                        C3: "CUSTOMER NAME",
                        D3: "TOTAL TAXABLE VALUE",
                        E3: "TOTAL CGST",
                        F3: "TOTAL SGST",
                        G3: "TOTAL IGST",
                        H3: "TOTAL TAX",
                        I3: "TOTAL CUSTOMER AMOUNT",
                        J3: "VOUCHER COUNT",
                    }
                ],
                    {
                        skipHeader: true,
                        origin: "A3"
                    }
                );

                xlsx.utils.sheet_add_json(combinedStateSheet, b2cStateWise, { skipHeader: true, origin: "A4" });

                const detailedB2BSalesSheet = xlsx.utils.json_to_sheet([
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

                xlsx.utils.sheet_add_json(detailedB2BSalesSheet, [
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
                        L3: "TOTAL CUSTOMER AMOUNT",
                    }
                ],
                    {
                        skipHeader: true,
                        origin: "A3"
                    }
                );

                xlsx.utils.sheet_add_json(detailedB2BSalesSheet, b2bSales, { skipHeader: true, origin: "A4" });

                const detailedCNSheet = xlsx.utils.json_to_sheet([
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

                xlsx.utils.sheet_add_json(detailedCNSheet, [
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
                        L3: "TOTAL CUSTOMER AMOUNT",
                    }
                ],
                    {
                        skipHeader: true,
                        origin: "A3"
                    }
                );

                xlsx.utils.sheet_add_json(detailedCNSheet, b2bCN, { skipHeader: true, origin: "A4" });

                const detailedStateSheet = xlsx.utils.json_to_sheet([
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

                xlsx.utils.sheet_add_json(detailedStateSheet, [
                    {
                        A3: "STATE",
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
                        L3: "TOTAL CUSTOMER AMOUNT",
                    }
                ],
                    {
                        skipHeader: true,
                        origin: "A3"
                    }
                );

                xlsx.utils.sheet_add_json(detailedStateSheet, b2cSales.concat(b2cCN), { skipHeader: true, origin: "A4" });

                const combinedHSNSheet = xlsx.utils.json_to_sheet([
                    {
                        A: `Report Date`,
                        B: `${moment(date1).format('DD-MMM-YYYY')} to ${moment(date2).format('DD-MMM-YYYY')}`,
                    }
                ],
                    {
                        header: ["A"],
                        skipHeader: true,
                    }
                );

                xlsx.utils.sheet_add_json(combinedHSNSheet, [
                    {
                        A3: "HSN/SAC",
                        B3: "UQC",
                        C3: "QUANTITY",
                        D3: "TOTAL AMOUNT",
                        E3: "TAX RATE",
                        F3: "TOTAL TAXABLE AMOUNT",
                        G3: "TOTAL IGST",
                        H3: "TOTAL CGST",
                        I3: "TOTAL SGST",
                        J3: "TOTAL TAX",
                    }
                ],
                    {
                        skipHeader: true,
                        origin: "A3"
                    }
                );

                xlsx.utils.sheet_add_json(combinedHSNSheet, hsnWiseData, { skipHeader: true, origin: "A4" });

                const detailedHSNSheet = xlsx.utils.json_to_sheet([
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

                xlsx.utils.sheet_add_json(detailedHSNSheet, [
                    {
                        A3: "VOUCHER TYPE",
                        B3: "VOUCHER NO",
                        C3: "CUSTOMER CODE",
                        D3: "HSNSAC",
                        E3: "QUANTITY",
                        F3: "UOM",
                        G3: "UOM DESCRIPTION",
                        H3: "TAXABLE VALUE",
                        I3: "TAX RATE",
                        J3: "TOTAL CGST",
                        K3: "TOTAL SGST",
                        L3: "TOTAL IGST",
                        M3: "TOTAL TAX",
                        N3: "TOTAL AMOUNT",
                    }
                ],
                    {
                        skipHeader: true,
                        origin: "A3"
                    }
                );

                xlsx.utils.sheet_add_json(detailedHSNSheet, salesProducts.concat(returnProducts), { skipHeader: true, origin: "A4" });

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
                        C9: "VOUCHER COUNT",
                        D9: "TAXABLE AMOUNT",
                        E9: "IGST",
                        F9: "CGST",
                        G9: "SGST",
                        H9: "TAX AMOUNT",
                        I9: "CUSTOMER AMOUNT",
                    }
                ],
                    {
                        skipHeader: true,
                        origin: "A9"
                    }
                );

                xlsx.utils.sheet_add_json(mainSheet, [mergedB2BSales, {
                    annexure: 'Annexure 2',
                    invoice: 'B2C(Large) Invoices - 5A, 5B',
                }, {
                        annexure: 'Annexure 3',
                        invoice: 'Export Invoices - 6A',
                    }, mergedB2BCN, {
                        annexure: 'Annexure 5',
                        invoice: 'Credit or Debit Notes (Unregistered) - 9B',
                    },
                    {
                        annexure: 'Annexure 6',
                        invoice: 'Amended B2B Invoices - 9A',
                    },
                    {
                        annexure: 'Annexure 7',
                        invoice: 'Amended B2C (Large) Invoices - 9A',
                    },
                    {
                        annexure: 'Annexure 8',
                        invoice: 'Amended Exports Invoices - 9A',
                    },
                    {
                        annexure: 'Annexure 9',
                        invoice: 'Amended Credit or Debit Notes (Registered) - 9C',
                    },
                    {
                        annexure: 'Annexure 10',
                        invoice: 'Amended Credit or Debit Notes (Unregistered) - 9C',
                    }
                    , mergedB2CState, {
                        annexure: 'Annexure 12',
                        invoice: 'Nil Rated Invoices - 8A, 8B, 8C, 8D',
                    }, {
                        annexure: 'Annexure 13',
                        invoice: 'Amendment B2C (Small) Invoices - 10',
                    }, {
                        annexure: 'Annexure 14',
                        invoice: 'Tax Liability (Advances Received) - 11A(1), 11A(2)',
                    }, {
                        annexure: 'Annexure 15',
                        invoice: 'Adjustment of Advances - 11B(1), 11B(2)',
                    }, {
                        annexure: 'Annexure 16',
                        invoice: 'Amended Tax Liability (Advances Received) - 11A',
                    }, {
                        annexure: 'Annexure 17',
                        invoice: 'Amendment of Adjusted Advances - 11B',
                    }, {
                        annexure: 'Annexure 18',
                        invoice: 'HSN Summary - 12',
                    }, {
                        annexure: 'Annexure 19',
                        invoice: 'Document Summary - 13',
                    }], { skipHeader: true, origin: "A10" });

                const merge = [
                    {
                        s: { r: 0, c: 0 },
                        e: { r: 6, c: 2 }
                    }
                ]
                mainSheet["!merges"] = merge;

                const workbook = xlsx.utils.book_new();

                xlsx.utils.book_append_sheet(workbook, mainSheet, "GSTR1 Return View");

                xlsx.utils.book_append_sheet(workbook, combinedB2BSalesSheet, "Annexure 1");

                xlsx.utils.book_append_sheet(workbook, combinedCNSheet, "Annexure 4");

                xlsx.utils.book_append_sheet(workbook, combinedStateSheet, "Annexure 11");

                xlsx.utils.book_append_sheet(workbook, combinedHSNSheet, "Annexure 18");

                xlsx.utils.book_append_sheet(workbook, detailedB2BSalesSheet, "Detailed Annexure 1");

                xlsx.utils.book_append_sheet(workbook, detailedCNSheet, "Detailed Annexure 4");

                xlsx.utils.book_append_sheet(workbook, detailedStateSheet, "Detailed Annexure 11");

                xlsx.utils.book_append_sheet(workbook, detailedHSNSheet, "Detailed Annexure 18");

                xlsx.write(workbook, { bookType: "xlsx", type: "buffer" });

                xlsx.writeFile(workbook, "./files/gstr1/" + fileName);

                let attachment = [
                    {
                        filename: fileName.split("_")[0] + '.xlsx',
                        content: fs.readFileSync("./files/gstr1/" + fileName),
                    }
                ]

                let updateUserRequest = await otherDB.query("UPDATE user_files_req SET status = 'complete' , other_data = :otherData , update_date = :updateDate WHERE user_id = :uid AND req_date = :req_data AND req_code = :filename", {
                    replacements: {
                        uid: userID,
                        req_data: JSON.stringify(req),
                        otherData: JSON.stringify({
                            fileName: fileName,
                            fileUrl: "./files/gstr1/" + fileName
                        }),
                        filename: fileName.replace(".xlsx", ""),
                        updateDate: moment().format("YYYY-MM-DD HH:mm:ss")
                    },
                    type: otherDB.QueryTypes.UPDATE,
                });

                await emit_notifications(io, socket, req.notificationId);

                const sendEmail = await sendMail(userDetails[0].Email_ID, "", "GSTR-1 Report", htmlTemplate(userDetails[0].user_name, new Date(), "GSTR-1"), attachment);

            } catch (error) {
                console.log("error :=", error);
                error_log({ stack: error.stack });
            }
        })
    } catch (error) {
        console.log("error :=", error);
        error_log({ stack: error.stack });
    }
}