const moment = require("moment");
const fs = require("fs");
const xmlFormatter = require("xml-formatter");
const { invtDB, otherDB } = require("./../../config/db/connection");
const helper = require("../../helper/helper");
const { htmlTemplate } = require("./EmailTemplate/fileDownload");
const archiver = require("archiver");

const getVendorGodown = async (vendor_id) => {
  try {
    if (!vendor_id || vendor_id === "--") {
      console.warn(`Invalid vendor_id: ${vendor_id}`);
      return `Godown Not Set For Vendor${vendor_id || "Unknown"}`;
    }
    const result = await otherDB.query("SELECT * FROM tbl_vendor_godown WHERE vendor = :vendor_id", {
      replacements: { vendor_id },
      type: otherDB.QueryTypes.SELECT,
    });

    if (result.length > 0) {
      return result[0].wh_name;
    }
    console.warn(`No godown found for vendor_id: ${vendor_id}`);
    return `Godown Not Set For Vendor${vendor_id}`;
  } catch (error) {
    console.error(`Error in getVendorGodown for vendor_id ${vendor_id}:`, error);
    return `Godown Not Set For Vendor${vendor_id}`;
  }
};

exports.rm_returnXML = async (data, uid, emit_notifications, expression, fileName, notificationId, socket, io, branch) => {
  try {
    const searchDate = JSON.parse(data.otherdata).date;
    if (!/([0-9]{2})-([0-9]{2})-([0-9]{4})/.test(searchDate)) {
      throw new Error("Invalid date format");
    }

    const formattedDate = moment(searchDate, "DD-MM-YYYY").format("YYYY-MM-DD");

    // Query INWARD transactions with trans_mode = 'return' based on date and branch
    let results = await invtDB.query(
      `SELECT DISTINCT rm_location.*, rm_location.insert_date, rm_location.in_transaction_id AS min_no, 
              components.c_part_no, components.c_name, components.component_key, units.units_name, 
              admin_login.user_name
       FROM rm_location 
       LEFT JOIN components ON rm_location.components_id = components.component_key 
       LEFT JOIN units ON components.c_uom = units.units_id 
       LEFT JOIN admin_login ON rm_location.insert_by = admin_login.CustID 
       WHERE components.c_type = 'R' 
       AND components.c_is_enabled = 'Y' 
       AND DATE_FORMAT(rm_location.insert_date,'%Y-%m-%d') = :date 
       AND rm_location.trans_type = 'INWARD' 
       AND rm_location.trans_mode = 'return' 
       AND rm_location.company_branch = :branch 
       AND rm_location.vendor_type = 'j01'
       AND rm_location.components_id IS NOT NULL
       ORDER BY rm_location.in_transaction_id, rm_location.insert_date DESC`,
      {
        replacements: { date: formattedDate, branch },
        type: invtDB.QueryTypes.SELECT,
      }
    );

    if (results.length === 0) {
      console.warn(`No records found for date ${formattedDate} and branch ${branch}`);
      await otherDB.query(
        "UPDATE `user_files_req` SET `status` = 'failed' WHERE `user_id`= :uid AND req_code = :req_code AND req_date = :req_date",
        {
          replacements: { uid, req_code: expression, req_date: searchDate },
          type: otherDB.QueryTypes.UPDATE,
        }
      );
      emit_notifications(notificationId);
      return;
    }

    io.to(uid).emit("download_start_detail", {
      title: "XML RM Return",
      details: searchDate,
      notificationId: notificationId,
      status: "pending",
      detailStatus: true,
      total: false,
      type: "file",
    });

    // Group results by in_transaction_id
    const groupedResults = results.reduce((acc, item) => {
      const minNo = item.min_no;
      if (!acc[minNo]) {
        acc[minNo] = [];
      }
      acc[minNo].push(item);
      return acc;
    }, {});

    // Create a temporary directory for XML files if it doesn't exist
    const tempDir = "./files/xml/temp2/";
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const files = [];
    let count = 0;

    for (const [transactionId, items] of Object.entries(groupedResults)) {
      let inventoryEntriesIn = "";
      let inventoryEntriesOut = "";
      let narration = "";
      let invoiceNumber = "N/A";
      let ewayBill = "N/A";
      let woInvoiceDate = null;
      let insertDate = null;
      let userName = "sachin.koli";
      let vendorName = "N/A";
      
      // Pick the first valid min_ewaybill for the transaction group
      const validEwayBill = items.find(item => item.min_ewaybill && item.min_ewaybill !== "--")?.min_ewaybill || "N/A";
      ewayBill = validEwayBill;

      for (const item of items) {
        // Validate component data
        if (!item.components_id || !item.c_part_no || !item.c_name) {
          console.warn(`Skipping item due to missing component data: ${JSON.stringify(item)}`);
          continue;
        }

        // Fetch vendor name
        if (item.in_vendor_name && item.in_vendor_name !== "--") {
          const stmt_vendorName = await invtDB.query(
            "SELECT `ven_name` FROM `ven_basic_detail` WHERE `ven_register_id` = :vendor",
            {
              replacements: { vendor: item.in_vendor_name },
              type: invtDB.QueryTypes.SELECT,
            }
          );
          if (stmt_vendorName.length > 0) {
            vendorName = stmt_vendorName[0].ven_name;
          } else {
            console.warn(`No vendor name found for vendor_id: ${item.in_vendor_name}`);
          }
        } else {
          console.warn(`Invalid or missing in_vendor_name: ${item.in_vendor_name}`);
        }

        const currency = (item.currency_type === "--" || item.currency_type === "" || item.currency_type === "364907247") ? "INR" : "USD";
        const inQty = (parseInt(item.qty) || 0) + (parseInt(item.other_qty) || 0);
        const hsncode = (item.in_hsn_code && item.in_hsn_code !== "--") ? item.in_hsn_code : "--";
        invoiceNumber = item.in_invoice_id !== "--" ? item.in_invoice_id : "N/A";
        const rate = item.in_po_rate || 0;
        woInvoiceDate = item.in_wo_invoice_date || item.insert_date;
        insertDate = item.insert_date;
        userName = item.user_name || "sachin.koli";

        // Log component and godown details for debugging
        console.log(`Processing component: ${item.c_part_no}, Qty: ${inQty}, Rate: ${rate}, Destination: GDRM0021-A-21 Noida, Source: ${await getVendorGodown(item.in_vendor_name)}`);

        // Construct inventory history for UDF
        const inventoryHistory = `${item.c_part_no || "Unknown"} :- ${inQty} ${item.units_name || "Unit"} @ ${rate}/${item.units_name || "Unit"} = ${helper.number(inQty * rate)}`;

        // INWARD entry
        inventoryEntriesIn += `
          <INVENTORYENTRIESIN.LIST>
            <STOCKITEMNAME>${item.c_part_no || "Unknown"}</STOCKITEMNAME>
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
            <RATE>${rate}/${item.units_name || "Unit"}</RATE>
            <AMOUNT>-${helper.number(inQty * rate)}</AMOUNT>
            <ACTUALQTY>${inQty} ${item.units_name || "Unit"}</ACTUALQTY>
            <BILLEDQTY>${inQty} ${item.units_name || "Unit"}</BILLEDQTY>
            <BATCHALLOCATIONS.LIST>
              <GODOWNNAME>GDRM0021-A-21 Noida</GODOWNNAME>
              <BATCHNAME>Primary Batch</BATCHNAME>
              <DESTINATIONGODOWNNAME>GDRM0021-A-21 Noida</DESTINATIONGODOWNNAME>
              <INDENTNO>Not Applicable</INDENTNO>
              <ORDERNO>Not Applicable</ORDERNO>
              <TRACKINGNUMBER>Not Applicable</TRACKINGNUMBER>
              <DYNAMICCSTISCLEARED>No</DYNAMICCSTISCLEARED>
              <AMOUNT>-${helper.number(inQty * rate)}</AMOUNT>
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

        // OUTWARD entry
        const sourceGodown = await getVendorGodown(item.in_vendor_name);
        inventoryEntriesOut += `
          <INVENTORYENTRIESOUT.LIST>
            <STOCKITEMNAME>${item.c_part_no || "Unknown"}</STOCKITEMNAME>
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
            <RATE>${rate}/${item.units_name || "Unit"}</RATE>
            <AMOUNT>${helper.number(inQty * rate)}</AMOUNT>
            <ACTUALQTY>${inQty} ${item.units_name || "Unit"}</ACTUALQTY>
            <BILLEDQTY>${inQty} ${item.units_name || "Unit"}</BILLEDQTY>
            <BATCHALLOCATIONS.LIST>
              <GODOWNNAME>${sourceGodown}</GODOWNNAME>
              <BATCHNAME>Primary Batch</BATCHNAME>
              <INDENTNO>Not Applicable</INDENTNO>
              <ORDERNO>Not Applicable</ORDERNO>
              <TRACKINGNUMBER>Not Applicable</TRACKINGNUMBER>
              <DYNAMICCSTISCLEARED>No</DYNAMICCSTISCLEARED>
              <AMOUNT>${helper.number(inQty * rate)}</AMOUNT>
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
          </INVENTORYENTRIESOUT.LIST>`;

      
        narration += `Being ${item.c_part_no || "Unknown"} Received After Job Work From ${vendorName} Against Challan No-${invoiceNumber} Date-${moment(woInvoiceDate).format("DD-MM-YYYY")}; `;
      }

      
      if (ewayBill !== "N/A") {
        narration += `Eway Bill No-${ewayBill}; `;
      }

      if (inventoryEntriesIn === "" || inventoryEntriesOut === "") {
        console.warn(`No valid components for transactionId: ${transactionId}`);
        continue;
      }

      const randCode = helper.randomNumber(99999, 999999);
      const inventoryHistory = items.map(item => {
        const inQty = (parseInt(item.qty) || 0) + (parseInt(item.other_qty) || 0);
        const rate = item.in_po_rate || 0;
        return `${item.c_part_no || "Unknown"} :- ${inQty} ${item.units_name || "Unit"} @ ${rate}/${item.units_name || "Unit"} = ${helper.number(inQty * rate)}`;
      }).join("; ");

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
                  <VOUCHER REMOTEID="d8d94e8c-ad22-40d9-b88e-8e570bac417c-00052876-${randCode}" VCHKEY="d8d94e8c-ad22-40d9-b88e-8e570bac417c-0000b310:00000444-${randCode}" VCHTYPE="Stock Journal" ACTION="Create" OBJVIEW="Consumption Voucher View">
                    <OLDAUDITENTRYIDS.LIST TYPE="Number">
                      <OLDAUDITENTRYIDS>-1</OLDAUDITENTRYIDS>
                    </OLDAUDITENTRYIDS.LIST>
                    <DATE>${moment(insertDate).format("YYYYMMDD")}</DATE>
                    <REFERENCEDATE>${moment(woInvoiceDate).format("YYYYMMDD")}</REFERENCEDATE>
                    <VCHSTATUSDATE>${moment(insertDate).format("YYYYMMDD")}</VCHSTATUSDATE>
                    <GUID>d8d94e8c-ad22-40d9-b88e-8e570bac417c-00052876-${randCode}</GUID>
                    <NARRATION>${narration}</NARRATION>
                    <ENTEREDBY>${userName}</ENTEREDBY>
                    <OBJECTUPDATEACTION>Create</OBJECTUPDATEACTION>
                    <GSTREGISTRATION>Not Applicable</GSTREGISTRATION>
                    <VOUCHERTYPENAME>Stock Journal</VOUCHERTYPENAME>
                    <VOUCHERNUMBER>${transactionId}</VOUCHERNUMBER>
                    <REFERENCE>${invoiceNumber}</REFERENCE>
                    <NUMBERINGSTYLE>Automatic (Manual Override)</NUMBERINGSTYLE>
                    <CSTFORMISSUETYPE>Not Applicable</CSTFORMISSUETYPE>
                    <CSTFORMRECVTYPE>Not Applicable</CSTFORMRECVTYPE>
                    <PERSISTEDVIEW>Consumption Voucher View</PERSISTEDVIEW>
                    <VCHSTATUSTAXADJUSTMENT>Default</VCHSTATUSTAXADJUSTMENT>
                    <VCHSTATUSVOUCHERTYPE>Stock Journal</VCHSTATUSVOUCHERTYPE>
                    <VCHGSTCLASS>Not Applicable</VCHGSTCLASS>
                    <VCHENTRYMODE>Use for Stock Journal</VCHENTRYMODE>
                    <DESTINATIONGODOWN>GDRM0021-A-21 Noida</DESTINATIONGODOWN>
                    <DIFFACTUALQTY>No</DIFFACTUALQTY>
                    <ISMSTFROMSYNC>No</ISMSTFROMSYNC>
                    <ISDELETED>No</ISDELETED>
                    <ISSECURITYONWHENENTERED>Yes</ISSECURITYONWHENENTERED>
                    <ASORIGINAL>No</ASORIGINAL>
                    <AUDITED>No</AUDITED>
                    <ISCOMMONPARTY>No</ISCOMMONPARTY>
                    <FORJOBCOSTING>No</FORJOBCOSTING>
                    <ISOPTIONAL>No</ISOPTIONAL>
                    <EFFECTIVEDATE>${moment(insertDate).format("YYYYMMDD")}</EFFECTIVEDATE>
                    <USEFOREXCISE>No</USEFOREXCISE>
                    <ISFORJOBWORKIN>No</ISFORJOBWORKIN>
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
                    <USETRACKINGNUMBER>No</USETRACKINGNUMBER>
                    <ISINVOICE>No</ISINVOICE>
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
                    <ALTERID>625345</ALTERID>
                    <MASTERID>338038</MASTERID>
                    <VOUCHERKEY>196881300849732</VOUCHERKEY>
                    <VOUCHERRETAINKEY>${count + 1}</VOUCHERRETAINKEY>
                    <VOUCHERNUMBERSERIES>Default</VOUCHERNUMBERSERIES>
                    <UPDATEDDATETIME>${moment().format("YYYYMMDDHHmmss")}</UPDATEDDATETIME>
                    <EWAYBILLDETAILS.LIST>
                      <EWAYBILLNUMBER>${ewayBill}</EWAYBILLNUMBER>
                      <EWAYBILLDATE>${moment(woInvoiceDate).format("YYYYMMDD")}</EWAYBILLDATE>
                    </EWAYBILLDETAILS.LIST>
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
                    <INVENTORYENTRIESIN.LIST>
                      ${inventoryEntriesIn}
                    </INVENTORYENTRIESIN.LIST>
                    <INVENTORYENTRIESOUT.LIST>
                      ${inventoryEntriesOut}
                    </INVENTORYENTRIESOUT.LIST>
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
                      <UDF:HBSENTEREDBY DESC="\`HBSEnteredBy\`">${userName}</UDF:HBSENTEREDBY>
                    </UDF:HBSENTEREDBY.LIST>
                    <UDF:HBSENTEREDON.LIST DESC="\`HBSEnteredOn\`" ISLIST="YES" TYPE="String" INDEX="2236">
                      <UDF:HBSENTEREDON DESC="\`HBSEnteredOn\`">${moment().format("D-MMM-YY HH:mm")}</UDF:HBSENTEREDON>
                    </UDF:HBSENTEREDON.LIST>
                    <UDF:HBSCREATIONINVHISTORY.LIST DESC="\`HBSCreationInvHistory\`" ISLIST="YES" TYPE="String" INDEX="2240">
                      <UDF:HBSCREATIONINVHISTORY DESC="\`HBSCreationInvHistory\`">${inventoryHistory}</UDF:HBSCREATIONINVHISTORY>
                    </UDF:HBSCREATIONINVHISTORY.LIST>
                    <UDF:CREATEDBY.LIST DESC="\`Created By\`" ISLIST="YES" TYPE="String" INDEX="8883">
                      <UDF:CREATEDBY DESC="\`Created By\`">${userName}</UDF:CREATEDBY>
                    </UDF:CREATEDBY.LIST>
                    <UDF:MAC_VCHPREPAREDBY.LIST DESC="\`Mac_VchPreparedBy\`" ISLIST="YES" TYPE="String" INDEX="40066">
                      <UDF:MAC_VCHPREPAREDBY DESC="\`Mac_VchPreparedBy\`">${userName}</UDF:MAC_VCHPREPAREDBY>
                    </UDF:MAC_VCHPREPAREDBY.LIST>
                    <UDF:MAC_VCHPREPARETIME.LIST DESC="\`Mac_VchPrepareTime\`" ISLIST="YES" TYPE="String" INDEX="40067">
                      <UDF:MAC_VCHPREPARETIME DESC="\`Mac_VchPrepareTime\`">${moment().format("DD-MM-YY [at] HH:mm A")}</UDF:MAC_VCHPREPARETIME>
                    </UDF:MAC_VCHPREPARETIME.LIST>
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
      //  Sanitize transactionId for safer filename and use helper.getUniqueNumber for uniqueness
      const xmlFileName = `${transactionId.replace(/[^a-zA-Z0-9]/g, '_')}.xml`;
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
      await otherDB.query(
        "UPDATE `user_files_req` SET `status` = 'failed' WHERE `user_id`= :uid AND req_code = :req_code AND req_date = :req_date",
        {
          replacements: { uid, req_code: expression, req_date: searchDate },
          type: otherDB.QueryTypes.UPDATE,
        }
      );
      emit_notifications(notificationId);
      //Clean up temporary directory if it exists
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir, { recursive: true });
      }
      return;
    }

    //Create ZIP file with unique name
    const zipFileName = `${fileName}.zip`;
    const zipFilePath = `./files/xml/${zipFileName}`;
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    // NEW: Handle ZIP file creation events
    output.on('close', async () => {
      // NEW: Clean up temporary XML files and directory
      files.forEach(file => fs.unlinkSync(file.path));
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir, { recursive: true });
      }

      // CHANGED: Update database with ZIP file details
      await otherDB.query(
        "UPDATE `user_files_req` SET `status` = 'complete', `other_data` = :other WHERE `user_id`= :uid AND `req_code` = :req_code AND req_date = :req_date",
        {
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
        }
      );
      emit_notifications(notificationId);

      // CHANGED: Send ZIP file via email with descriptive filename
      let user = await invtDB.query(
        "SELECT `Email_ID`,`user_name` from `admin_login` WHERE `CustID`= :CustID",
        {
          replacements: { CustID: uid },
          type: invtDB.QueryTypes.SELECT,
        }
      );
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
          filename: `XML_RM_Return_${zipFileName}`,
          content: fs.readFileSync(zipFilePath),
        },
      ];
      helper.sendMail(
        userEmail,
        "",
        expression + " transaction [File Ready for download] Ref:" + helper.randomNumber(99999, 999999),
        htmlTemplate(user[0].user_name, new Date(), "RM Return in ZIP", `${process.env.SOCKET_API_URL}/${zipFilePath}`),
        attachment
      );
    });

    // NEW: Handle ZIP file errors
    archive.on('error', async (err) => {
      console.error("Error creating ZIP file:", err);
      await otherDB.query(
        "UPDATE `user_files_req` SET `status` = 'failed' WHERE `user_id`= :uid AND `req_code` = :req_code AND req_date = :req_date",
        {
          replacements: { uid, req_code: expression, req_date: searchDate },
          type: otherDB.QueryTypes.UPDATE,
        }
      );
      emit_notifications(notificationId);
      // Clean up temporary files and ZIP file on error
      files.forEach(file => fs.existsSync(file.path) && fs.unlinkSync(file.path));
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir, { recursive: true });
      }
      if (fs.existsSync(zipFilePath)) {
        fs.unlinkSync(zipFilePath);
      }
    });

    //Pipe archive data to the output stream
    archive.pipe(output);
    // Add each XML file to the ZIP
    files.forEach((f) => {
      archive.file(f.path, { name: f.name });
    });
    //Finalize the ZIP file
    archive.finalize();

  } catch (err) {
    console.error("RM Return XML Error:", err);
    await otherDB.query(
      "UPDATE `user_files_req` SET `status` = 'failed' WHERE `reactNotificationId`= :uid AND `req_code` = :expression",
      {
        replacements: { expression, uid: notificationId },
        type: otherDB.QueryTypes.UPDATE,
      }
    );
    emit_notifications(notificationId);
    //Clean up temporary files and directory on error
    const tempDir = "./files/xml/temp2/";
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir, { recursive: true });
    }
  }
};