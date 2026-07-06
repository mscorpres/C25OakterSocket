const moment = require("moment");
const fs = require("fs");
const archiver = require("archiver");
require("dotenv").config();

const { otherDB, invtDB } = require("./../../config/db/connection");
const helper = require("../../helper/helper");
const { htmlTemplate } = require("./EmailTemplate/fileDownload");
const { encode } = require("html-entities");
const xmlFormatter = require("xml-formatter");
const Validator = require("validatorjs");

// Get godown name from location key
const getGodownFromLocation = async (location_key) => {
  try {
    if (!location_key || location_key === "--") {
      return "GDFG001_Alwar";
    }
    const result = await invtDB.query("SELECT loc_name FROM location_main WHERE location_key = :location_key", {
      replacements: { location_key: location_key },
      type: invtDB.QueryTypes.SELECT,
    });

    if (result.length > 0) {
      // Map location name to godown code if needed, otherwise use default
      const locName = result[0].loc_name || "";
      // You can add custom mapping logic here if needed
      // For now, return default FG godown
      return "GDFG001_Alwar";
    }

    return "GDFG001_Alwar";
  } catch (error) {
    return "GDFG001_Alwar";
  }
};

exports.fg_XML = async (data, uid, emit_notifications, expression, fileName, notificationId, socket, io, branch) => {
  try {
    // Validate input
    const searchDate = JSON.parse(data.otherdata).date;
    if (!/([0-9]{2})-([0-9]{2})-([0-9]{4})/.test(searchDate)) {
      throw new Error("Invalid date format");
    }
    const formattedDate = moment(searchDate, "DD-MM-YYYY").format("YYYY-MM-DD");

    // Query for FG OUT transactions (Consumption - FG)
    let stmt1 = await invtDB.query(
      `SELECT 
        mfg_production_3.*,
        products.p_sku,
        products.p_name,
        products.product_key,
        units.units_name,
        admin_login.user_name AS entered_by_user,
        location_main.loc_name AS godown_name
      FROM mfg_production_3 
      LEFT JOIN products ON mfg_production_3.fgout_pro_apr_sku = products.product_key
      LEFT JOIN units ON products.p_uom = units.units_id
      LEFT JOIN admin_login ON mfg_production_3.fgout_pro_apr_by = admin_login.CustID
      LEFT JOIN location_main ON mfg_production_3.fgout_pro_location_out = location_main.location_key
      WHERE mfg_production_3.type = 'OUT'
      AND DATE_FORMAT(mfg_production_3.fgout_pro_apr_fulldate, '%Y-%m-%d') = :date
      AND mfg_production_3.company_branch = :branch
      AND (mfg_production_3.fg_out_type IS NULL OR mfg_production_3.fg_out_type != 'SL001')
      ORDER BY mfg_production_3.fgout_pro_apr_fulldate DESC`,
      {
        replacements: { date: formattedDate, branch: branch },
        type: invtDB.QueryTypes.SELECT,
      }
    );

    if (stmt1.length === 0) {
      await otherDB.query("UPDATE `user_files_req` SET `status` = 'failed' WHERE `user_id`= :uid AND `req_code` = :req_code AND req_date = :req_date", {
        replacements: { uid, req_code: expression, req_date: searchDate },
        type: otherDB.QueryTypes.UPDATE,
      });
      emit_notifications(notificationId);
      return;
    }

    io.to(uid).emit("download_start_detail", {
      title: "XML FG CONSUMPTION",
      details: searchDate,
      notificationId: notificationId,
      status: "pending",
      detailStatus: true,
      total: false,
      type: "file",
    });

    // Create temp directory for XML files
    const tempDir = `./files/xml/temp/${fileName}/`;
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const files = [];
    const randCode = helper.randomNumber(99999, 999999);
    let voucherCounter = 1;

    // Process each entry separately - no grouping, each entry gets its own XML file
    for (let i = 0; i < stmt1.length; i++) {
      const item = stmt1[i];
      const inventoryEntries = [];

      // Get weighted SKU rate for this item
      const transactionDate = moment(item.fgout_pro_apr_fulldate).tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
        // Get weighted rate at transaction time
        let weightedRate = 0;
        try {
          if (item.product_key) {
            weightedRate = await require("../../helper/utils").getWeightedSKURate(item.product_key, transactionDate);
          }
        } catch (err) {
          console.error(`Error fetching weighted rate for ${item.product_key}:`, err);
        }

        // Calculate amount
        const qty = helper.number(item.fgout_approve_out_qty) || 0;
        const rate = weightedRate || 0;
        const amount = helper.number(qty * rate);

        // Get godown
        const godownName = await getGodownFromLocation(item.fgout_pro_location_out);

        // Escape special characters
        const escapedSKU = encode(item.p_sku || "");
        // const escapedUnitsName = encode(item.units_name || "Nos");

        // Format quantity with UOM
        const qtyWithUOM = ` ${qty}`;

        // Create inventory entry OUT
        const inventoryEntry = `
          <INVENTORYENTRIESOUT.LIST>
            <STOCKITEMNAME>${escapedSKU}</STOCKITEMNAME>
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
            <RATE>${rate.toFixed(2)}</RATE>
            <AMOUNT>${amount.toFixed(2)}</AMOUNT>
            <ACTUALQTY>${qtyWithUOM}</ACTUALQTY>
            <BILLEDQTY>${qtyWithUOM}</BILLEDQTY>
            <BATCHALLOCATIONS.LIST>
              <GODOWNNAME>${godownName}</GODOWNNAME>
              <BATCHNAME>Primary Batch</BATCHNAME>
              <INDENTNO>&#4; Not Applicable</INDENTNO>
              <ORDERNO>&#4; Not Applicable</ORDERNO>
              <TRACKINGNUMBER>&#4; Not Applicable</TRACKINGNUMBER>
              <DYNAMICCSTISCLEARED>No</DYNAMICCSTISCLEARED>
              <AMOUNT>${amount.toFixed(2)}</AMOUNT>
              <ACTUALQTY>${qtyWithUOM}</ACTUALQTY>
              <BILLEDQTY>${qtyWithUOM}</BILLEDQTY>
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

      inventoryEntries.push(inventoryEntry);

      const inventoryEntriesXML = inventoryEntries.join("");

      const voucherDate = moment(item.fgout_pro_apr_fulldate).format("YYYYMMDD");
      const voucherDateFormatted = moment(item.fgout_pro_apr_fulldate).format("DD-MM-YYYY");
      const enteredBy = "Hariom"
      const narration = item.fg_out_remark || `Being product consumption dated ${voucherDateFormatted} - ${item.p_sku || "FG"}`;
      // Create unique voucher number using entry ID, timestamp and counter (don't use transaction ID)
      const uniqueVoucherNumber = `FG/${moment(searchDate, "DD-MM-YYYY").format("DDMMYY")}_${item.ID || helper.randomNumber(100000, 999999)}_${moment().format("HHmmss")}_${voucherCounter}`;
      const voucherNumber = uniqueVoucherNumber;
      const guid = `d8d94e8c-ad22-40d9-b88e-8e570bac417c-${helper.randomNumber(100000, 999999)}-${randCode}-${voucherCounter}`;
      const remoteId = guid;
      const vchKey = `d8d94e8c-ad22-40d9-b88e-8e570bac417c-0000b3c7:${helper.randomNumber(1000000, 9999999)}-${randCode}-${voucherCounter}`;

      // Create voucher for this SKU
      const voucher = `
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER REMOTEID="${remoteId}" VCHKEY="${vchKey}" VCHTYPE="Consumption - FG" ACTION="Create" OBJVIEW="Consumption Voucher View">
            <OLDAUDITENTRYIDS.LIST TYPE="Number">
              <OLDAUDITENTRYIDS>-1</OLDAUDITENTRYIDS>
            </OLDAUDITENTRYIDS.LIST>
            <DATE>${voucherDate}</DATE>
            <VCHSTATUSDATE>${voucherDate}</VCHSTATUSDATE>
            <GUID>${guid}</GUID>
            <NARRATION>${encode(narration)}</NARRATION>
            <ENTEREDBY>${enteredBy}</ENTEREDBY>
            <OBJECTUPDATEACTION>Create</OBJECTUPDATEACTION>
            <VOUCHERTYPENAME>Consumption - FG</VOUCHERTYPENAME>
            <GSTREGISTRATION>&#4; Not Applicable</GSTREGISTRATION>
            <VOUCHERNUMBER>${voucherNumber}</VOUCHERNUMBER>
            <NUMBERINGSTYLE>Automatic (Manual Override)</NUMBERINGSTYLE>
            <CSTFORMISSUETYPE>&#4; Not Applicable</CSTFORMISSUETYPE>
            <CSTFORMRECVTYPE>&#4; Not Applicable</CSTFORMRECVTYPE>
            <PERSISTEDVIEW>Consumption Voucher View</PERSISTEDVIEW>
            <VCHSTATUSTAXADJUSTMENT>Default</VCHSTATUSTAXADJUSTMENT>
            <VCHSTATUSVOUCHERTYPE>Consumption - FG</VCHSTATUSVOUCHERTYPE>
            <VCHGSTCLASS>&#4; Not Applicable</VCHGSTCLASS>
            <VCHENTRYMODE>Use for Stock Journal</VCHENTRYMODE>
            <DIFFACTUALQTY>No</DIFFACTUALQTY>
            <ISMSTFROMSYNC>No</ISMSTFROMSYNC>
            <ISDELETED>No</ISDELETED>
            <ISSECURITYONWHENENTERED>Yes</ISSECURITYONWHENENTERED>
            <ASORIGINAL>No</ASORIGINAL>
            <AUDITED>No</AUDITED>
            <ISCOMMONPARTY>No</ISCOMMONPARTY>
            <FORJOBCOSTING>No</FORJOBCOSTING>
            <ISOPTIONAL>No</ISOPTIONAL>
            <EFFECTIVEDATE>${voucherDate}</EFFECTIVEDATE>
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
            <VCHSTATUSISREACCEPHSNSIXONEDONE>No</VCHSTATUSISREACCEPHSNSIXONEDONE>
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
            <ALTERID> 695559</ALTERID>
            <MASTERID> 372136</MASTERID>
            <VOUCHERKEY>197667279864880</VOUCHERKEY>
            <VOUCHERRETAINKEY>5</VOUCHERRETAINKEY>
            <VOUCHERNUMBERSERIES>Default</VOUCHERNUMBERSERIES>
            <UPDATEDDATETIME>${moment().format("YYYYMMDDHHmmssSSS")}</UPDATEDDATETIME>
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
            ${inventoryEntriesXML}
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
            <UDF:VCHMACHINEDATE.LIST DESC="\`VchMachineDate\`" ISLIST="YES" TYPE="Date" INDEX="3828">
              <UDF:VCHMACHINEDATE DESC="\`VchMachineDate\`">${voucherDate}</UDF:VCHMACHINEDATE>
            </UDF:VCHMACHINEDATE.LIST>
            <UDF:HBSENTEREDBY.LIST DESC="\`HBSEnteredBy\`" ISLIST="YES" TYPE="String" INDEX="2235">
              <UDF:HBSENTEREDBY DESC="\`HBSEnteredBy\`">${enteredBy}</UDF:HBSENTEREDBY>
            </UDF:HBSENTEREDBY.LIST>
            <UDF:HBSENTEREDON.LIST DESC="\`HBSEnteredOn\`" ISLIST="YES" TYPE="String" INDEX="2236">
              <UDF:HBSENTEREDON DESC="\`HBSEnteredOn\`">${moment(item.fgout_pro_apr_fulldate).format("DD-MMM-YY HH:mm")}</UDF:HBSENTEREDON>
            </UDF:HBSENTEREDON.LIST>
            <UDF:CREATEDBY.LIST DESC="\`Created By\`" ISLIST="YES" TYPE="String" INDEX="8883">
              <UDF:CREATEDBY DESC="\`Created By\`">${enteredBy}</UDF:CREATEDBY>
            </UDF:CREATEDBY.LIST>
          </VOUCHER>
        </TALLYMESSAGE>`;

      // Create complete XML for this entry
      const xmlData = `
        <ENVELOPE>
          <HEADER>
            <TALLYREQUEST>Import Data</TALLYREQUEST>
          </HEADER>
          <BODY>
            <IMPORTDATA>
              <REQUESTDESC>
                <REPORTNAME>Vouchers</REPORTNAME>
                <STATICVARIABLES>
                  <SVCURRENTCOMPANY>Riot Labz Private Limited - (from 1-Apr-25)</SVCURRENTCOMPANY>
                </STATICVARIABLES>
              </REQUESTDESC>
              <REQUESTDATA>
                ${voucher}
                <TALLYMESSAGE xmlns:UDF="TallyUDF">
                  <COMPANY>
                    <REMOTECMPINFO.LIST MERGE="Yes">
                      <NAME>ec615b4b-8ed4-4821-a7aa-d8424c778c25-${randCode}</NAME>
                      <REMOTECMPNAME>Riot Invoice Sync</REMOTECMPNAME>
                      <REMOTECMPSTATE>Uttar Pradesh</REMOTECMPSTATE>
                    </REMOTECMPINFO.LIST>
                    <REMOTECMPINFO.LIST MERGE="Yes">
                      <NAME>29eb3569-6eb7-4cbd-a8d6-52d28cb783fd</NAME>
                      <REMOTECMPNAME>DataRiotSYNC</REMOTECMPNAME>
                      <REMOTECMPSTATE>Uttar Pradesh</REMOTECMPSTATE>
                    </REMOTECMPINFO.LIST>
                    <REMOTECMPINFO.LIST MERGE="Yes">
                      <NAME>d8d94e8c-ad22-40d9-b88e-8e570bac417c</NAME>
                      <REMOTECMPNAME>Riot Labz Private Limited - (from 1-Apr-25)</REMOTECMPNAME>
                      <REMOTECMPSTATE>Uttar Pradesh</REMOTECMPSTATE>
                    </REMOTECMPINFO.LIST>
                    <REMOTECMPINFO.LIST MERGE="Yes">
                      <NAME>49e3b8e2-e6fe-45a6-9f2c-9c1afa6e35f2</NAME>
                      <REMOTECMPNAME>RiotUni</REMOTECMPNAME>
                      <REMOTECMPSTATE>Uttar Pradesh</REMOTECMPSTATE>
                    </REMOTECMPINFO.LIST>
                    <REMOTECMPINFO.LIST MERGE="Yes">
                      <NAME>7e089186-4416-4712-8fdd-f738aafafb54</NAME>
                      <REMOTECMPNAME>MsCorpres Automation</REMOTECMPNAME>
                      <REMOTECMPSTATE>Uttar Pradesh</REMOTECMPSTATE>
                    </REMOTECMPINFO.LIST>
                    <REMOTECMPINFO.LIST MERGE="Yes">
                      <NAME>d5a27a67-b312-42d5-9004-57001d47dac0</NAME>
                      <REMOTECMPNAME>MsCorpres Automation</REMOTECMPNAME>
                      <REMOTECMPSTATE>Uttar Pradesh</REMOTECMPSTATE>
                    </REMOTECMPINFO.LIST>
                    <REMOTECMPINFO.LIST MERGE="Yes">
                      <NAME>7e557474-baa2-4c0d-bf00-1616e21973cd</NAME>
                      <REMOTECMPNAME>Dsdad</REMOTECMPNAME>
                      <REMOTECMPSTATE>Haryana</REMOTECMPSTATE>
                    </REMOTECMPINFO.LIST>
                  </COMPANY>
                </TALLYMESSAGE>
              </REQUESTDATA>
            </IMPORTDATA>
          </BODY>
        </ENVELOPE>`;

      // Create unique filename for each entry using SKU
      const skuFileName = `${item.p_sku || item.product_key || `SKU_${voucherCounter}`}_${voucherCounter}.xml`.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${tempDir}${skuFileName}`;
      
      const xmlDataWithBackticks = xmlData.replace(/&grave;/g, "`");
      const formattedXML = xmlFormatter(xmlDataWithBackticks);
      
      fs.writeFileSync(filePath, formattedXML);
      
      files.push({
        name: skuFileName,
        path: filePath,
      });
      
      voucherCounter++;
    }

    if (files.length === 0) {
      await otherDB.query("UPDATE `user_files_req` SET `status` = 'failed' WHERE `user_id`= :uid AND `req_code` = :req_code AND req_date = :req_date", {
        replacements: { uid, req_code: expression, req_date: searchDate },
        type: otherDB.QueryTypes.UPDATE,
      });
      emit_notifications(notificationId);
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir, { recursive: true });
      }
      return;
    }

    // Create ZIP file with all XML files
    const zipFileName = `${fileName}.zip`;
    const zipFilePath = `./files/xml/${zipFileName}`;
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("error", (err) => {
      throw err;
    });

    output.on("close", async () => {
      console.log(`ZIP file created: ${archive.pointer()} total bytes`);
      
      let stmt = await otherDB.query(
        "UPDATE `user_files_req` SET `status` = 'complete', `other_data` = :other WHERE `user_id`= :uid AND `req_code` = :req_code AND req_date = :req_date",
        {
          replacements: {
            uid: uid,
            req_code: expression,
            req_date: searchDate,
            other: JSON.stringify({
              fileName: zipFileName,
              fileUrl: zipFilePath,
              fileBuffer: "N/A",
              totalFiles: files.length,
            }),
          },
          type: otherDB.QueryTypes.UPDATE,
        }
      );
      emit_notifications(notificationId);

      // Send email notification
      let user = await invtDB.query("SELECT `Email_ID`,`user_name` FROM `admin_login` WHERE `CustID`= :CustID", {
        replacements: { CustID: uid },
        type: invtDB.QueryTypes.SELECT,
      });
      let userEmail = user[0].Email_ID;
      let attachment = [
        {
          filename: "XML report of FG Consumption.zip",
          content: fs.readFileSync(zipFilePath),
        },
      ];
      helper.sendMail(
        userEmail,
        "",
        `${expression} transaction [File Ready for download] Ref:${helper.randomNumber(99999, 999999)}`,
        htmlTemplate(user[0].user_name, new Date(), "FG Consumption in XML", `${process.env.SOCKET_API_URL}/${zipFilePath}`),
        attachment
      );

      // Clean up temp directory
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir, { recursive: true });
      }
    });

    archive.pipe(output);

    // Add all XML files to ZIP
    files.forEach((file) => {
      archive.file(file.path, { name: file.name });
    });

    archive.finalize();
  } catch (err) {
    console.log("**************************error********************", err);
    let stmt = await otherDB.query("UPDATE `user_files_req` SET `status` = 'failed' WHERE `reactNotificationId`= :uid AND `req_code` = :expression", {
      replacements: { expression: expression, uid: notificationId },
      type: otherDB.QueryTypes.UPDATE,
    });
    emit_notifications(notificationId);
  }
};

