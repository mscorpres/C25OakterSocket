const moment = require("moment");
const fs = require("fs");
const xmlFormatter = require("xml-formatter");
const archiver = require("archiver");
const { invtDB, otherDB } = require("./../../config/db/connection");
const helper = require("../../helper/helper");
const { htmlTemplate } = require("./EmailTemplate/fileDownload");

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

exports.rm_sfgXML = async (data, uid, emit_notifications, expression, fileName, notificationId, socket, io, branch) => {
  try {
    const searchDate = JSON.parse(data.otherdata).date;
    if (!/([0-9]{2})-([0-9]{2})-([0-9]{4})/.test(searchDate)) {
      throw new Error("Invalid date format");
    }

    const formattedDate = moment(searchDate, "DD-MM-YYYY").format("YYYY-MM-DD");

    // Query INWARD transactions dynamically based on date and branch
    let results = await invtDB.query(
      `SELECT DISTINCT rm_location.*, rm_location.insert_date, rm_location.in_transaction_id AS min_no, cost_center.cost_center_name, cost_center.cost_center_short_name, 
              components.c_part_no, components.c_name, components.component_key, units.units_name, admin_login.user_name
       FROM rm_location 
       LEFT JOIN components ON rm_location.components_id = components.component_key 
       LEFT JOIN units ON components.c_uom = units.units_id 
       LEFT JOIN location_main ON rm_location.loc_in = location_main.location_key 
       LEFT JOIN admin_login ON rm_location.insert_by = admin_login.CustID 
       LEFT JOIN cost_center ON cost_center.cost_center_key = rm_location.rm_loc_cost_center 
       WHERE components.c_type = 'R' 
       AND components.c_is_enabled = 'Y' 
       AND DATE_FORMAT(rm_location.insert_date,'%Y-%m-%d') = :date 
       AND rm_location.trans_type = 'INWARD' 
       AND rm_location.in_module = 'IN-JWI'
       AND rm_location.in_module != 'PART-CONV' 
       AND components.c_is_enabled = 'Y' 
       AND rm_location.company_branch = :branch 
       AND rm_location.vendor_type = 'j01'
       ORDER BY rm_location.insert_date DESC`,
      {
        replacements: { date: formattedDate, branch },
        type: invtDB.QueryTypes.SELECT,
      }
    );

    if (results.length === 0) {
      await otherDB.query("UPDATE `user_files_req` SET `status` = 'failed' WHERE `user_id`= :uid AND `req_code` = :req_code AND req_date = :req_date", {
        replacements: { uid, req_code: expression, req_date: searchDate },
        type: otherDB.QueryTypes.UPDATE,
      });
      emit_notifications(notificationId);
      return;
    }

    io.to(uid).emit("download_start_detail", {
      title: "XML SFG Inward",
      details: searchDate,
      notificationId: notificationId,
      status: "pending",
      detailStatus: true,
      total: false,
      type: "file",
    });

    let count = 0;
   const files = [];
    const tempDir = "./files/xml/temp/";
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const processedTransactions = new Set();

    for (const item of results) {
      const transactionId = item.min_no;
      if (processedTransactions.has(transactionId)) continue;
      processedTransactions.add(transactionId);

      let invoiceStatus = false;
      const checkInvoices = await invtDB.query("SELECT * FROM ims_min_invoices WHERE min_min_id = :txn", {
        replacements: { txn: transactionId },
        type: invtDB.QueryTypes.SELECT,
      });
      if (checkInvoices.length > 0) {
        invoiceStatus = true;
      }

      let vendorName = "N/A";
      const stmt_vendorName = await invtDB.query("SELECT `ven_name` FROM `ven_basic_detail` WHERE `ven_register_id` = :vendor", {
        replacements: { vendor: item.in_vendor_name },
        type: invtDB.QueryTypes.SELECT,
      });
      if (stmt_vendorName.length > 0) {
        vendorName = stmt_vendorName[0].ven_name;
      }

      let project_name = "N/A",
        invoice_number = "N/A",
        po_number = "N/A";
      if (item.in_po_invoice_id !== "--") {
        invoice_number = item.in_po_invoice_id;
        po_number = item.in_po_transaction_id;
        const stmt_otherdata = await invtDB.query("SELECT po_purchase_req.po_project_name FROM `po_purchase_req` WHERE po_purchase_req.po_transaction = :po", {
          replacements: { po: po_number },
          type: invtDB.QueryTypes.SELECT,
        });
        if (stmt_otherdata.length > 0) {
          project_name = stmt_otherdata[0].po_project_name || "N/A";
        }
      } else if (item.in_invoice_id !== "--") {
        invoice_number = item.in_invoice_id;
      }

      const currency = item.currency_type === "--" || item.currency_type === "" || item.currency_type === "364907247" ? "INR" : "USD";
      const inQty = (parseInt(item.qty) || 0) + (parseInt(item.other_qty) || 0);
      const hsncode = item.in_hsn_code && item.in_hsn_code !== "--" ? item.in_hsn_code : "--";

      // Validate component_key before calling getWeightedPurchaseRate
      let last_purchase = 0;
      if (item.component_key) {
        try {
          last_purchase = await require("../../helper/utils").getWeightedPurchaseRate(item.component_key, moment(item.insert_date).tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss"));
        } catch (err) {
          console.error(`Error fetching weighted purchase rate for component_key ${item.component_key}:`, err);
        }
      }
      const amount = helper.number(item.qty * helper.number(item.in_po_rate));

      // Fetch SFG-CONSUMPTION records for the same transaction ID
      const sfgResults = await invtDB.query(
        `SELECT DISTINCT rm_location.*, components.c_part_no, components.c_name, components.component_key, units.units_name 
         FROM rm_location 
         LEFT JOIN components ON rm_location.components_id = components.component_key 
         LEFT JOIN units ON components.c_uom = units.units_id 
         WHERE rm_location.in_transaction_id = :txn 
         AND rm_location.trans_type = 'SFG-CONSUMPTION'`,
        {
          replacements: { txn: transactionId },
          type: invtDB.QueryTypes.SELECT,
        }
        
      );

      // Construct inventory history for UDF
      const inventoryHistory = `${item.c_part_no || "Unknown"} :- ${inQty} ${item.units_name || "Unit"} @ ${item.in_po_rate}/${item.units_name || "Unit"} = ${helper.number(inQty * item.in_po_rate)}`;

      // INWARD entry
      const inventoryEntryIn = `
        <INVENTORYENTRIESIN.LIST>
          <STOCKITEMNAME>${item.c_part_no || "Unknown"}</STOCKITEMNAME>
          <BOMNAME>${item.c_name || "N/A"}</BOMNAME>
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
          <RATE>${item.in_po_rate || 0}/${item.units_name || "Unit"}</RATE>
          <AMOUNT>-${amount}</AMOUNT>
          <ACTUALQTY>${inQty} ${item.units_name || "Unit"}</ACTUALQTY>
          <BILLEDQTY>${inQty} ${item.units_name || "Unit"}</BILLEDQTY>
          <BATCHALLOCATIONS.LIST>
            <GODOWNNAME>GDRM0021-A-21 Noida</GODOWNNAME>
            <BATCHNAME>Primary Batch</BATCHNAME>
            <INDENTNO>Not Applicable</INDENTNO>
            <ORDERNO>${po_number}</ORDERNO>
            <TRACKINGNUMBER>${invoice_number}</TRACKINGNUMBER>
            <DYNAMICCSTISCLEARED>No</DYNAMICCSTISCLEARED>
            <AMOUNT>-${amount}</AMOUNT>
            <ACTUALQTY>${inQty} ${item.units_name || "Unit"}</ACTUALQTY>
            <BILLEDQTY>${inQty} ${item.units_name || "Unit"}</BILLEDQTY>
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
        </INVENTORYENTRIESIN.LIST>`;

      // SFG-CONSUMPTION entries with deduplication
      const inventoryEntriesOut = [];
      const processedComponents = new Set();
      for (const sfgItem of sfgResults) {
        if (processedComponents.has(sfgItem.components_id)) continue; // Skip duplicates
        processedComponents.add(sfgItem.components_id);
        const outQty = (parseInt(sfgItem.qty) || 0) + (parseInt(sfgItem.other_qty) || 0);
        let sfgRate = sfgItem.in_po_rate || last_purchase || 0;
        if (sfgItem.component_key) {
          try {
            sfgRate = await require("../../helper/utils").getWeightedPurchaseRate(sfgItem.component_key, moment(sfgItem.insert_date).format("YYYY-MM-DD"));
          } catch (err) {
            console.error(`Error fetching weighted purchase rate for SFG component_key ${sfgItem.component_key}:`, err);
            sfgRate = sfgItem.in_po_rate || last_purchase || 0; // Fallback
          }
        }
        inventoryEntriesOut.push(`
        <INVENTORYENTRIESOUT.LIST>
          <STOCKITEMNAME>${sfgItem.c_part_no || "Unknown"}</STOCKITEMNAME>
          <BOMNAME>${sfgItem.c_name || "N/A"}</BOMNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <ISGSTASSESSABLEVALUEOVERRIDDEN>No</ISGSTASSESSABLEVALUEOVERRIDDEN>
          <STRDISGSTAPPLICABLE>No</STRDISGSTAPPLICABLE>
          <CONTENTNEGISPOS>Yes</CONTENTNEGISPOS>
          <ISLASTDEEMEDPOSITIVE>No</ISLASTDEEMEDPOSITIVE>
          <ISAUTONEGATE>No</ISAUTONEGATE>
          <ISCUSTOMSCLEARANCE>No</ISCUSTOMSCLEARANCE>
          <ISTRACKCOMPONENT>No</ISTRACKCOMPONENT>
          <ISTRACKPRODUCTION>No</ISTRACKPRODUCTION>
          <ISPRIMARYITEM>No</ISPRIMARYITEM>
          <ISSCRAP>No</ISSCRAP>
          <RATE>${sfgRate}/${sfgItem.units_name || "Unit"}</RATE>
          <AMOUNT>${helper.number(outQty * sfgRate)}</AMOUNT>
          <ACTUALQTY>${outQty} ${sfgItem.units_name || "Unit"}</ACTUALQTY>
          <BILLEDQTY>${outQty} ${sfgItem.units_name || "Unit"}</BILLEDQTY>
          <BATCHALLOCATIONS.LIST>
            <GODOWNNAME>${await getVendorGodown(item.in_vendor_name)}</GODOWNNAME>
            <BATCHNAME>Primary Batch</BATCHNAME>
            <INDENTNO>Not Applicable</INDENTNO>
            <ORDERNO>${po_number}</ORDERNO>
            <TRACKINGNUMBER>${invoice_number}</TRACKINGNUMBER>
            <DYNAMICCSTISCLEARED>No</DYNAMICCSTISCLEARED>
            <AMOUNT>${helper.number(outQty * sfgRate)}</AMOUNT>
            <ACTUALQTY>${outQty} ${sfgItem.units_name || "Unit"}</ACTUALQTY>
            <BILLEDQTY>${outQty} ${sfgItem.units_name || "Unit"}</BILLEDQTY>
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
        </INVENTORYENTRIESOUT.LIST>`);
      }
      const inventoryEntriesOutXML = inventoryEntriesOut.join("");

      const randCode = helper.randomNumber(99999, 999999);
      const narration = `Being ${item.c_part_no || "Unknown"} Received After Job Work From ${vendorName} Against Challan No-${invoice_number} Date-${moment(
        item.in_wo_invoice_date || item.insert_date
      ).format("DD-MM-YYYY")} Eway Bill No-${item.in_eway_bill || "N/A"}`;

      const xmlData = `
        <ENVELOPE>
          <HEADER>
            <TALLYREQUEST>Import Data</TALLYREQUEST>
          </HEADER>
          <BODY>
            <IMPORTDATA>
              <REQUESTDESC>
                <REPORTNAME>All Masters</REPORTNAME>
                <STATICVARIABLES>
                  <SVCURRENTCOMPANY>Riot Labz Private Limited - (from 1-Apr-25)</SVCURRENTCOMPANY>
                </STATICVARIABLES>
              </REQUESTDESC>
              <REQUESTDATA>
                <TALLYMESSAGE xmlns:UDF="TallyUDF">
                  <VOUCHER REMOTEID="d8d94e8c-ad22-40d9-b88e-8e570bac417c-00052854-${randCode}" VCHKEY="d8d94e8c-ad22-40d9-b88e-8e570bac417c-0000b30e:00000186-${randCode}" VCHTYPE="Production - JW" ACTION="Create" OBJVIEW="Multi Consumption Voucher View">
                    <OLDAUDITENTRYIDS.LIST TYPE="Number">
                      <OLDAUDITENTRYIDS>-1</OLDAUDITENTRYIDS>
                    </OLDAUDITENTRYIDS.LIST>
                    <ALTEREDON>${moment().format("YYYYMMDD")}</ALTEREDON>
                    <DATE>${moment(item.insert_date).format("YYYYMMDD")}</DATE>
                    <REFERENCEDATE>${moment(item.in_wo_invoice_date || item.insert_date).format("YYYYMMDD")}</REFERENCEDATE>
                    <VCHSTATUSDATE>${moment(item.insert_date).format("YYYYMMDD")}</VCHSTATUSDATE>
                    <GUID>d8d94e8c-ad22-40d9-b88e-8e570bac417c-00052854-${randCode}</GUID>
                    <NARRATION>${narration}</NARRATION>
                    <ENTEREDBY>sachin.koli</ENTEREDBY>
                    <ALTEREDBY>sachin.koli</ALTEREDBY>
                    <OBJECTUPDATEACTION>Create</OBJECTUPDATEACTION>
                    <GSTREGISTRATION>Not Applicable</GSTREGISTRATION>
                    <VOUCHERTYPENAME>Production - JW</VOUCHERTYPENAME>
                    <VOUCHERNUMBER>${transactionId}</VOUCHERNUMBER>
                    <REFERENCE>${invoice_number}</REFERENCE>
                    <NUMBERINGSTYLE>Automatic (Manual Override)</NUMBERINGSTYLE>
                    <CSTFORMISSUETYPE>Not Applicable</CSTFORMISSUETYPE>
                    <CSTFORMRECVTYPE>Not Applicable</CSTFORMRECVTYPE>
                    <FBTPAYMENTTYPE>Default</FBTPAYMENTTYPE>
                    <PERSISTEDVIEW>Multi Consumption Voucher View</PERSISTEDVIEW>
                    <VCHSTATUSTAXADJUSTMENT>Default</VCHSTATUSTAXADJUSTMENT>
                    <VCHSTATUSVOUCHERTYPE>Production - JW</VCHSTATUSVOUCHERTYPE>
                    <VCHGSTCLASS>Not Applicable</VCHGSTCLASS>
                    <DESTINATIONGODOWN>GDRM0021-A-21 Noida</DESTINATIONGODOWN>
                    <VOUCHERDESTINATIONGODOWN>GDRM0021-A-21 Noida</VOUCHERDESTINATIONGODOWN>
                    <VOUCHERSOURCEGODOWN>${await getVendorGodown(item.in_vendor_name)}</VOUCHERSOURCEGODOWN>
                    <DIFFACTUALQTY>No</DIFFACTUALQTY>
                    <ISMSTFROMSYNC>No</ISMSTFROMSYNC>
                    <ISDELETED>No</ISDELETED>
                    <ISSECURITYONWHENENTERED>Yes</ISSECURITYONWHENENTERED>
                    <ASORIGINAL>No</ASORIGINAL>
                    <AUDITED>No</AUDITED>
                    <ISCOMMONPARTY>No</ISCOMMONPARTY>
                    <FORJOBCOSTING>Yes</FORJOBCOSTING>
                    <ISOPTIONAL>No</ISOPTIONAL>
                    <EFFECTIVEDATE>${moment(item.insert_date).format("YYYYMMDD")}</EFFECTIVEDATE>
                    <USEFOREXCISE>No</USEFOREXCISE>
                    <ISFORJOBWORKIN>Yes</ISFORJOBWORKIN>
                    <ALLOWCONSUMPTION>No</ALLOWCONSUMPTION>
                    <USEFORINTEREST>No</USEFORINTEREST>
                    <USEFORGAINLOSS>No</USEFORGAINLOSS>
                    <USEFORGODOWNTRANSFER>No</USEFORGODOWNTRANSFER>
                    <USEFORCOMPOUND>No</USEFORCOMPOUND>
                    <USEFORSERVICETAX>No</USEFORSERVICETAX>
                    <ISREVERSECHARGEAPPLICABLE>No</ISREVERSECHARGEAPPLICABLE>
                    <ISSYSTEM>No</ISSYSTEM>
                    <ISFETCHEDONLY>No</ISFETCHEDONLY>
                    <ISGSTOVERRIDDEN>No</ISGSTOVERRIDDEN>
                    <ISCANCELLED>No</ISCANCELLED>
                    <ISONHOLD>No</ISONHOLD>
                    <ISSUMMARY>No</ISSUMMARY>
                    <ISECOMMERCESUPPLY>No</ISECOMMERCESUPPLY>
                    <ISBOENOTAPPLICABLE>No</ISBOENOTAPPLICABLE>
                    <ISGSTSECSEVENAPPLICABLE>No</ISGSTSECSEVENAPPLICABLE>
                    <IGNOREEINVVALIDATION>No</IGNOREEINVVALIDATION>
                    <CMPGSTISOTHTERRITORYASSESSEE>No</CMPGSTISOTHTERRITORYASSESSEE>
                    <PARTYGSTISOTHTERRITORYASSESSEE>No</PARTYGSTISOTHTERRITORYASSESSEE>
                    <IRNJSONEXPORTED>No</IRNJSONEXPORTED>
                    <IRNCANCELLED>No</IRNCANCELLED>
                    <IGNOREGSTCONFLICTINMIG>No</IGNOREGSTCONFLICTINMIG>
                    <ISOPBALTRANSACTION>No</ISOPBALTRANSACTION>
                    <IGNOREGSTFORMATVALIDATION>No</IGNOREGSTFORMATVALIDATION>
                    <ISELIGIBLEFORITC>Yes</ISELIGIBLEFORITC>
                    <IGNOREGSTOPTIONALUNCERTAIN>No</IGNOREGSTOPTIONALUNCERTAIN>
                    <UPDATESUMMARYVALUES>No</UPDATESUMMARYVALUES>
                    <ISEWAYBILLAPPLICABLE>No</ISEWAYBILLAPPLICABLE>
                    <ISDELETEDRETAINED>No</ISDELETEDRETAINED>
                    <ISNULL>No</ISNULL>
                    <ISEXCISEVOUCHER>No</ISEXCISEVOUCHER>
                    <EXCISETAXOVERRIDE>No</EXCISETAXOVERRIDE>
                    <USEFORTAXUNITTRANSFER>No</USEFORTAXUNITTRANSFER>
                    <ISEXER1NOPOVERWRITE>No</ISEXER1NOPOVERWRITE>
                    <ISEXF2NOPOVERWRITE>No</ISEXF2NOPOVERWRITE>
                    <ISEXER3NOPOVERWRITE>No</ISEXER3NOPOVERWRITE>
                    <IGNOREPOSVALIDATION>No</IGNOREPOSVALIDATION>
                    <EXCISEOPENING>No</EXCISEOPENING>
                    <USEFORFINALPRODUCTION>No</USEFORFINALPRODUCTION>
                    <ISTDSOVERRIDDEN>No</ISTDSOVERRIDDEN>
                    <ISTCSOVERRIDDEN>No</ISTCSOVERRIDDEN>
                    <ISTDSTCSCASHVCH>No</ISTDSTCSCASHVCH>
                    <INCLUDEADVPYMTVCH>No</INCLUDEADVPYMTVCH>
                    <ISSUBWORKSCONTRACT>No</ISSUBWORKSCONTRACT>
                    <ISVATOVERRIDDEN>No</ISVATOVERRIDDEN>
                    <IGNOREORIGVCHDATE>No</IGNOREORIGVCHDATE>
                    <ISVATPAIDATCUSTOMS>No</ISVATPAIDATCUSTOMS>
                    <ISDECLAREDTOCUSTOMS>No</ISDECLAREDTOCUSTOMS>
                    <VATADVANCEPAYMENT>No</VATADVANCEPAYMENT>
                    <VATADVPAY>No</VATADVPAY>
                    <ISCSTDELCAREDGOODSSALES>No</ISCSTDELCAREDGOODSSALES>
                    <ISVATRESTAXINV>No</ISVATRESTAXINV>
                    <ISSERVICETAXOVERRIDDEN>No</ISSERVICETAXOVERRIDDEN>
                    <ISISDVOUCHER>No</ISISDVOUCHER>
                    <ISEXCISEOVERRIDDEN>No</ISEXCISEOVERRIDDEN>
                    <ISEXCISESUPPLYVCH>No</ISEXCISESUPPLYVCH>
                    <GSTNOTEXPORTED>No</GSTNOTEXPORTED>
                    <IGNOREGSTINVALIDATION>No</IGNOREGSTINVALIDATION>
                    <ISGSTREFUND>No</ISGSTREFUND>
                    <OVRDNEWAYBILLAPPLICABILITY>No</OVRDNEWAYBILLAPPLICABILITY>
                    <ISVATPRINCIPALACCOUNT>No</ISVATPRINCIPALACCOUNT>
                    <VCHSTATUSISVCHNUMUSED>No</VCHSTATUSISVCHNUMUSED>
                    <VCHGSTSTATUSISINCLUDED>No</VCHGSTSTATUSISINCLUDED>
                    <VCHGSTSTATUSISUNCERTAIN>No</VCHGSTSTATUSISUNCERTAIN>
                    <VCHGSTSTATUSISEXCLUDED>No</VCHGSTSTATUSISEXCLUDED>
                    <VCHGSTSTATUSISAPPLICABLE>No</VCHGSTSTATUSISAPPLICABLE>
                    <VCHGSTSTATUSISGSTR2BRECONCILED>No</VCHGSTSTATUSISGSTR2BRECONCILED>
                    <VCHGSTSTATUSISGSTR2BONLYINPORTAL>No</VCHGSTSTATUSISGSTR2BONLYINPORTAL>
                    <VCHGSTSTATUSISGSTR2BONLYINBOOKS>No</VCHGSTSTATUSISGSTR2BONLYINBOOKS>
                    <VCHGSTSTATUSISGSTR2BMISMATCH>No</VCHGSTSTATUSISGSTR2BMISMATCH>
                    <VCHGSTSTATUSISGSTR2BINDIFFPERIOD>No</VCHGSTSTATUSISGSTR2BINDIFFPERIOD>
                    <VCHGSTSTATUSISRETEFFDATEOVERRDN>No</VCHGSTSTATUSISRETEFFDATEOVERRDN>
                    <VCHGSTSTATUSISOVERRDN>No</VCHGSTSTATUSISOVERRDN>
                    <VCHGSTSTATUSISSTATINDIFFDATE>No</VCHGSTSTATUSISSTATINDIFFDATE>
                    <VCHGSTSTATUSISRETINDIFFDATE>No</VCHGSTSTATUSISRETINDIFFDATE>
                    <VCHGSTSTATUSMAINSECTIONEXCLUDED>No</VCHGSTSTATUSMAINSECTIONEXCLUDED>
                    <VCHGSTSTATUSISBRANCHTRANSFEROUT>No</VCHGSTSTATUSISBRANCHTRANSFEROUT>
                    <VCHGSTSTATUSISSYSTEMSUMMARY>No</VCHGSTSTATUSISSYSTEMSUMMARY>
                    <VCHSTATUSISUNREGISTEREDRCM>No</VCHSTATUSISUNREGISTEREDRCM>
                    <VCHSTATUSISOPTIONAL>No</VCHSTATUSISOPTIONAL>
                    <VCHSTATUSISCANCELLED>No</VCHSTATUSISCANCELLED>
                    <VCHSTATUSISDELETED>No</VCHSTATUSISDELETED>
                    <VCHSTATUSISOPENINGBALANCE>No</VCHSTATUSISOPENINGBALANCE>
                    <VCHSTATUSISFETCHEDONLY>No</VCHSTATUSISFETCHEDONLY>
                    <VCHGSTSTATUSISOPTIONALUNCERTAIN>No</VCHGSTSTATUSISOPTIONALUNCERTAIN>
                    <VCHSTATUSISREACCEPTFORHSNDONE>No</VCHSTATUSISREACCEPTFORHSNDONE>
                    <PAYMENTLINKHASMULTIREF>No</PAYMENTLINKHASMULTIREF>
                    <ISSHIPPINGWITHINSTATE>No</ISSHIPPINGWITHINSTATE>
                    <ISOVERSEASTOURISTTRANS>No</ISOVERSEASTOURISTTRANS>
                    <ISDESIGNATEDZONEPARTY>No</ISDESIGNATEDZONEPARTY>
                    <HASCASHFLOW>No</HASCASHFLOW>
                    <ISPOSTDATED>No</ISPOSTDATED>
                    <USETRACKINGNUMBER>Yes</USETRACKINGNUMBER>
                    <ISINVOICE>Yes</ISINVOICE>
                    <MFGJOURNAL>No</MFGJOURNAL>
                    <HASDISCOUNTS>No</HASDISCOUNTS>
                    <ASPAYSLIP>No</ASPAYSLIP>
                    <ISCOSTCENTRE>No</ISCOSTCENTRE>
                    <ISSTXNONREALIZEDVCH>No</ISSTXNONREALIZEDVCH>
                    <ISEXCISEMANUFACTURERON>No</ISEXCISEMANUFACTURERON>
                    <ISBLANKCHEQUE>No</ISBLANKCHEQUE>
                    <ISVOID>No</ISVOID>
                    <ORDERLINESTATUS>No</ORDERLINESTATUS>
                    <VATISAGNSTCANCSALES>No</VATISAGNSTCANCSALES>
                    <VATISPURCEXEMPTED>No</VATISPURCEXEMPTED>
                    <ISVATRESTAXINVOICE>No</ISVATRESTAXINVOICE>
                    <VATISASSESABLECALCVCH>No</VATISASSESABLECALCVCH>
                    <ISVATDUTYPAID>Yes</ISVATDUTYPAID>
                    <ISDELIVERYSAMEASCONSIGNEE>No</ISDELIVERYSAMEASCONSIGNEE>
                    <ISDISPATCHSAMEASCONSIGNOR>No</ISDISPATCHSAMEASCONSIGNOR>
                    <ISDELETEDVCHRETAINED>No</ISDELETEDVCHRETAINED>
                    <VCHONLYADDLINFOUPDATED>No</VCHONLYADDLINFOUPDATED>
                    <CHANGEVCHMODE>No</CHANGEVCHMODE>
                    <RESETIRNQRCODE>No</RESETIRNQRCODE>
                    <ALTERID>627123</ALTERID>
                    <MASTERID>338004</MASTERID>
                    <VOUCHERKEY>196872710914438</VOUCHERKEY>
                    <VOUCHERRETAINKEY>${count + 1}</VOUCHERRETAINKEY>
                    <VOUCHERNUMBERSERIES>Default</VOUCHERNUMBERSERIES>
                    <UPDATEDDATETIME>${moment().format("YYYYMMDDHHmmss")}</UPDATEDDATETIME>
                    <EWAYBILLDETAILS.LIST> </EWAYBILLDETAILS.LIST>
                    <EXCLUDEDTAXATIONS.LIST> </EXCLUDEDTAXATIONS.LIST>
                    <OLDAUDITENTRIES.LIST> </OLDAUDITENTRIES.LIST>
                    <ACCOUNTAUDITENTRIES.LIST> </ACCOUNTAUDITENTRIES.LIST>
                    <AUDITENTRIES.LIST> </AUDITENTRIES.LIST>
                    <DUTYHEADDETAILS.LIST> </DUTYHEADDETAILS.LIST>
                    <GSTADVADJDETAILS.LIST> </GSTADVADJDETAILS.LIST>
                    <CONTRITRANS.LIST> </CONTRITRANS.LIST>
                    <EWAYBILLERRORLIST.LIST> </EWAYBILLERRORLIST.LIST>
                    <IRNERRORLIST.LIST> </IRNERRORLIST.LIST>
                    <HARYANAVAT.LIST> </HARYANAVAT.LIST>
                    <SUPPLEMENTARYDUTYHEADDETAILS.LIST> </SUPPLEMENTARYDUTYHEADDETAILS.LIST>
                    <INVOICEDELNOTES.LIST> </INVOICEDELNOTES.LIST>
                    <INVOICEORDERLIST.LIST> </INVOICEORDERLIST.LIST>
                    <INVOICEINDENTLIST.LIST> </INVOICEINDENTLIST.LIST>
                    <ATTENDANCEENTRIES.LIST> </ATTENDANCEENTRIES.LIST>
                    <ORIGINVOICEDETAILS.LIST> </ORIGINVOICEDETAILS.LIST>
                    <INVOICEEXPORTLIST.LIST> </INVOICEEXPORTLIST.LIST>
                    <LEDGERENTRIES.LIST> </LEDGERENTRIES.LIST>
                    ${inventoryEntryIn}
                    ${inventoryEntriesOutXML}
                    <GST.LIST> </GST.LIST>
                    <STKJRNLADDLCOSTDETAILS.LIST> </STKJRNLADDLCOSTDETAILS.LIST>
                    <PAYROLLMODEOFPAYMENT.LIST> </PAYROLLMODEOFPAYMENT.LIST>
                    <ATTDRECORDS.LIST> </ATTDRECORDS.LIST>
                    <GSTEWAYCONSIGNORADDRESS.LIST> </GSTEWAYCONSIGNORADDRESS.LIST>
                    <GSTEWAYCONSIGNEEADDRESS.LIST> </GSTEWAYCONSIGNEEADDRESS.LIST>
                    <TEMPGSTRATEDETAILS.LIST> </TEMPGSTRATEDETAILS.LIST>
                    <TEMPGSTADVADJUSTED.LIST> </TEMPGSTADVADJUSTED.LIST>
                    <GSTBUYERADDRESS.LIST> </GSTBUYERADDRESS.LIST>
                    <GSTCONSIGNEEADDRESS.LIST> </GSTCONSIGNEEADDRESS.LIST>
                    <UDF:MAC_VCHAUTHORISATION.LIST DESC="\`Mac_VchAuthorisation\`" ISLIST="YES" TYPE="Logical" INDEX="40104">
                      <UDF:MAC_VCHAUTHORISATION DESC="\`Mac_VchAuthorisation\`">Yes</UDF:MAC_VCHAUTHORISATION>
                    </UDF:MAC_VCHAUTHORISATION.LIST>
                    <UDF:VCHMACHINEDATE.LIST DESC="\`VchMachineDate\`" ISLIST="YES" TYPE="Date" INDEX="3828">
                      <UDF:VCHMACHINEDATE DESC="\`VchMachineDate\`">${moment().format("YYYYMMDD")}</UDF:VCHMACHINEDATE>
                    </UDF:VCHMACHINEDATE.LIST>
                    <UDF:HBSENTEREDBY.LIST DESC="\`HBSEnteredBy\`" ISLIST="YES" TYPE="String" INDEX="2235">
                      <UDF:HBSENTEREDBY DESC="\`HBSEnteredBy\`">sachin.koli</UDF:HBSENTEREDBY>
                    </UDF:HBSENTEREDBY.LIST>
                    <UDF:HBSENTEREDON.LIST DESC="\`HBSEnteredOn\`" ISLIST="YES" TYPE="String" INDEX="2236">
                      <UDF:HBSENTEREDON DESC="\`HBSEnteredOn\`">${moment().format("D-MMM-YY HH:mm")}</UDF:HBSENTEREDON>
                    </UDF:HBSENTEREDON.LIST>
                    <UDF:HBSCREATIONINVHISTORY.LIST DESC="\`HBSCreationInvHistory\`" ISLIST="YES" TYPE="String" INDEX="2240">
                      <UDF:HBSCREATIONINVHISTORY DESC="\`HBSCreationInvHistory\`">${inventoryHistory}</UDF:HBSCREATIONINVHISTORY>
                    </UDF:HBSCREATIONINVHISTORY.LIST>
                    <UDF:CREATEDBY.LIST DESC="\`Created By\`" ISLIST="YES" TYPE="String" INDEX="8883">
                      <UDF:CREATEDBY DESC="\`Created By\`">sachin.koli</UDF:CREATEDBY>
                    </UDF:CREATEDBY.LIST>
                    <UDF:MAC_VCHPREPAREDBY.LIST DESC="\`Mac_VchPreparedBy\`" ISLIST="YES" TYPE="String" INDEX="40066">
                      <UDF:MAC_VCHPREPAREDBY DESC="\`Mac_VchPreparedBy\`">sachin.koli</UDF:MAC_VCHPREPAREDBY>
                    </UDF:MAC_VCHPREPAREDBY.LIST>
                    <UDF:MAC_VCHPREPARETIME.LIST DESC="\`Mac_VchPrepareTime\`" ISLIST="YES" TYPE="String" INDEX="40067">
                      <UDF:MAC_VCHPREPARETIME DESC="\`Mac_VchPrepareTime\`">${moment().format("DD-MM-YY [at] HH:mm A")}</UDF:MAC_VCHPREPARETIME>
                    </UDF:MAC_VCHPREPARETIME.LIST>
                    <UDF:MAC_VCHAUTHORISEDBY.LIST DESC="\`Mac_VchAuthorisedBy\`" ISLIST="YES" TYPE="String" INDEX="40070">
                      <UDF:MAC_VCHAUTHORISEDBY DESC="\`Mac_VchAuthorisedBy\`">hariom</UDF:MAC_VCHAUTHORISEDBY>
                    </UDF:MAC_VCHAUTHORISEDBY.LIST>
                    <UDF:MAC_VCHAUTHORISEDBY_TIME.LIST DESC="\`Mac_VchAuthorisedBy_Time\`" ISLIST="YES" TYPE="String" INDEX="40071">
                      <UDF:MAC_VCHAUTHORISEDBY_TIME DESC="\`Mac_VchAuthorisedBy_Time\`">${moment().format("DD-MM-YY [at] HH:mm A")}</UDF:MAC_VCHAUTHORISEDBY_TIME>
                    </UDF:MAC_VCHAUTHORISEDBY_TIME.LIST>
                    <UDF:MAC_NARRATION1.LIST DESC="\`Mac_Narration1\`" ISLIST="YES" TYPE="String" INDEX="40076">
                      <UDF:MAC_NARRATION1 DESC="\`Mac_Narration1\`">${narration}</UDF:MAC_NARRATION1>
                    </UDF:MAC_NARRATION1.LIST>
                  </VOUCHER>
                </TALLYMESSAGE>
                <TALLYMESSAGE xmlns:UDF="TallyUDF">
                  <COMPANY>
                    <REMOTECMPINFO.LIST MERGE="Yes">
                      <NAME>d8d94e8c-ad22-40d9-b88e-8e570bac417c</NAME>
                      <REMOTECMPNAME>Riot Labz Private Limited - (from 1-Apr-25)</REMOTECMPNAME>
                      <REMOTECMPSTATE>Uttar Pradesh</REMOTECMPSTATE>
                    </REMOTECMPINFO.LIST>
                  </COMPANY>
                </TALLYMESSAGE>
              </REQUESTDATA>
            </IMPORTDATA>
          </BODY>
        </ENVELOPE>`;

      count++;
      const xmlFileName = `${transactionId.replace(/[^a-zA-Z0-9]/g, "_")}.xml`;
      const filePath = `${tempDir}${xmlFileName}`;
      files.push({
        name: xmlFileName,
        path: filePath,
      });

      const formattedXML = xmlFormatter(xmlData.replace(/`/g, "`"));
      fs.writeFileSync(filePath, formattedXML);
    }
    if (count === 0) {
      console.warn("No valid components processed for XML generation");
      await otherDB.query("UPDATE `user_files_req` SET `status` = 'failed' WHERE `user_id`= :uid AND req_code = :req_code AND req_date = :req_date", {
        replacements: { uid, req_code: expression, req_date: searchDate },
        type: otherDB.QueryTypes.UPDATE,
      });
      emit_notifications(notificationId);
      // NEW: Clean up temporary directory if it exists
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir, { recursive: true });
      }
      return;
    }
    // NEW: Create ZIP file with unique name
    const zipFileName = `${fileName}.zip`;
    const zipFilePath = `./files/xml/${zipFileName}`;
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver("zip", { zlib: { level: 9 } }); // CHANGED: Use compression level 9 for better archiving

    // NEW: Handle ZIP file creation events
    output.on("close", async () => {
      // NEW: Clean up temporary XML files and directory
      files.forEach((file) => fs.unlinkSync(file.path));
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir, { recursive: true });
      }
      // CHANGED: Update database with ZIP file details
      await otherDB.query("UPDATE `user_files_req` SET `status` = 'complete', `other_data` = :other WHERE `user_id`= :uid AND `req_code` = :req_code AND req_date = :req_date", {
        replacements: {
          uid,
          req_code: expression,
          req_date: searchDate,
          other: JSON.stringify({
            fileName: zipFileName,
            fileUrl: zipFilePath,
            fileBuffer: "N/A",
          }),
        },
        type: otherDB.QueryTypes.UPDATE,
      });
      emit_notifications(notificationId);
      // CHANGED: Send ZIP file via email with descriptive filename
      let user = await invtDB.query("SELECT `Email_ID`,`user_name` from `admin_login` WHERE `CustID`= :CustID", {
        replacements: { CustID: uid },
        type: invtDB.QueryTypes.SELECT,
      });
      if (!user.length) {
        console.error(`No user found for CustID: ${uid}`);
        // NEW: Clean up ZIP file if email sending fails
        if (fs.existsSync(zipFilePath)) {
          fs.unlinkSync(zipFilePath);
        }
        return;
      }
      let userEmail = user[0].Email_ID;
      let attachment = [
        {
          filename: `XML_SFG_INWARD_${zipFileName}`,
          content: fs.readFileSync(zipFilePath),
        },
      ];
      helper.sendMail(
        userEmail,
        "",
        expression + " transaction [File Ready for download] Ref:" + helper.randomNumber(99999, 999999),
        htmlTemplate(user[0].user_name, new Date(), "SFG INWARD in ZIP", `${process.env.SOCKET_API_URL}/${zipFilePath}`),
        attachment
      );
    });

    // NEW: Handle ZIP file errors
    archive.on("error", async (err) => {
      console.error("Error creating ZIP file:", err);
      await otherDB.query("UPDATE `user_files_req` SET `status` = 'failed' WHERE `user_id`= :uid AND `req_code` = :req_code AND req_date = :req_date", {
        replacements: { uid, req_code: expression, req_date: searchDate },
        type: otherDB.QueryTypes.UPDATE,
      });
      emit_notifications(notificationId);
      // NEW: Clean up temporary files and ZIP file on error
      files.forEach((file) => fs.existsSync(file.path) && fs.unlinkSync(file.path));
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir, { recursive: true });
      }
      if (fs.existsSync(zipFilePath)) {
        fs.unlinkSync(zipFilePath);
      }
    });
    // NEW: Pipe archive data to the output stream
    archive.pipe(output);
    // NEW: Add each XML file to the ZIP
    files.forEach((f) => {
      archive.file(f.path, { name: f.name });
    });
    // NEW: Finalize the ZIP file
    archive.finalize();
  } catch (err) {
    console.error("SFG Inward XML Error:", err);
    await otherDB.query("UPDATE `user_files_req` SET `status` = 'failed' WHERE `reactNotificationId`= :uid AND `req_code` = :expression", {
      replacements: { expression, uid: notificationId },
      type: otherDB.QueryTypes.UPDATE,
    });
    emit_notifications(notificationId);
    const tempDir = "./files/xml/temp/";
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir, { recursive: true });
    }
  }
};
