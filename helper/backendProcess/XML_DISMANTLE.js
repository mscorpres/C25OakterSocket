const moment = require("moment");
const fs = require("fs");
const xmlFormatter = require("xml-formatter");
const { invtDB, otherDB } = require("../../config/db/connection");
const helper = require("../helper");
const { htmlTemplate } = require("./EmailTemplate/fileDownload");
const archiver = require("archiver");
const Validator = require("validatorjs");

exports.fg_dismantleXML = async (data, uid, emit_notifications, expression, fileName, notificationId, socket, io, branch) => {
  try {
    const { date: searchDate } = JSON.parse(data.otherdata);
    if (!/([0-9]{2})-([0-9]{2})-([0-9]{4})/.test(searchDate)) {
      throw new Error("Invalid date format");
    }

    const formattedDate = moment(searchDate, "DD-MM-YYYY").format("YYYY-MM-DD");

    let results = await invtDB.query(
      `SELECT rm_location.*, rm_location.insert_date, rm_location.reversal_txn_id, rm_location.fg_rtn_refid,
              components.c_part_no, components.c_name, components.component_key, units.units_name,
              admin_login.user_name
       FROM rm_location
       LEFT JOIN fg_return ON fg_return.fg_return_txn = rm_location.reversal_txn_id
       LEFT JOIN components ON rm_location.components_id = components.component_key
       LEFT JOIN units ON components.c_uom = units.units_id
       LEFT JOIN admin_login ON rm_location.insert_by = admin_login.CustID
       WHERE rm_location.in_module = 'IN-FGRETURN'
       AND DATE_FORMAT(rm_location.insert_date, '%Y-%m-%d') = :date
       AND rm_location.company_branch = :branch
       AND rm_location.components_id IS NOT NULL
       AND rm_location.qty > 0
       ORDER BY rm_location.fg_rtn_refid, rm_location.insert_date DESC`,
      {
        replacements: { date: formattedDate, branch },
        type: invtDB.QueryTypes.SELECT,
      }
    );

    if (results.length === 0) {
      console.warn(`No records found for date ${formattedDate}, branch ${branch}`);
      await otherDB.query("UPDATE `user_files_req` SET `status` = 'failed' WHERE `user_id`= :uid AND req_code = :req_code AND req_date = :req_date", {
        replacements: { uid, req_code: expression, req_date: searchDate },
        type: otherDB.QueryTypes.UPDATE,
      });
      emit_notifications(notificationId);
      return;
    }

    io.to(uid).emit("download_start_detail", {
      title: "XML FG Dismantling",
      details: searchDate,
      notificationId: notificationId,
      status: "pending",
      detailStatus: true,
      total: false,
      type: "file",
    });

    const tempDir = "./files/xml/temp3/";
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const files = [];
    let count = 0;

    const groupedResults = results.reduce((acc, item) => {
      const key = item.fg_rtn_refid;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(item);
      return acc;
    }, {});

    console.log(`Generating XML files for ${Object.keys(groupedResults).length} unique references`);

    for (const [rtnRefId, group] of Object.entries(groupedResults)) {
      let inventoryEntriesIn = "";
      let insertDate = group[0].insert_date;
      let userName = group[0].user_name || "sachin.koli";
      let locationId = group[0].location_id || "GDWP001_A21";
      let reversalTxnId = group[0].reversal_txn_id;

      for (const item of group) {
        const last_purchase = await require("../utils").getWeightedPurchaseRate(item.component_key, moment(formattedDate, "YYYY-MM-DD").format("YYYY-MM-DD HH:mm:ss"));
        const qty = item.qty || 0;

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
            <RATE>${last_purchase}/${item.units_name || "Unit"}</RATE>
            <AMOUNT>-${helper.number(qty * last_purchase)}</AMOUNT>
            <ACTUALQTY>${qty} ${item.units_name || "Unit"}</ACTUALQTY>
            <BILLEDQTY>${qty} ${item.units_name || "Unit"}</BILLEDQTY>
            <BATCHALLOCATIONS.LIST>
              <GODOWNNAME>${locationId}</GODOWNNAME>
              <BATCHNAME>Primary Batch</BATCHNAME>
              <DESTINATIONGODOWNNAME>${locationId}</DESTINATIONGODOWNNAME>
              <INDENTNO>Not Applicable</INDENTNO>
              <ORDERNO>Not Applicable</ORDERNO>
              <TRACKINGNUMBER>Not Applicable</TRACKINGNUMBER>
              <DYNAMICCSTISCLEARED>No</DYNAMICCSTISCLEARED>
              <AMOUNT>-${helper.number(qty * last_purchase)}</AMOUNT>
              <ACTUALQTY>${qty} ${item.units_name || "Unit"}</ACTUALQTY>
              <BILLEDQTY>${qty} ${item.units_name || "Unit"}</BILLEDQTY>
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
      }

      if (inventoryEntriesIn === "") {
        console.warn(`No valid items for rtnRefId: ${rtnRefId}`);
        continue;
      }

      count++;
      const randCode = helper.randomNumber(99999, 999999);
      const xmlFileName = `${rtnRefId.replaceAll("/", "_")}_${reversalTxnId.replaceAll("/", "_")}.xml`;

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
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER REMOTEID="d8d94e8c-ad22-40d9-b88e-8e570bac417c-000${randCode}" VCHKEY="d8d94e8c-ad22-40d9-b88e-8e570bac417c-0000b310:000006a8-${randCode}" VCHTYPE="Stock Journal" ACTION="Create" OBJVIEW="Consumption Voucher View">
      <OLDAUDITENTRYIDS.LIST TYPE="Number">
       <OLDAUDITENTRYIDS>-1</OLDAUDITENTRYIDS>
      </OLDAUDITENTRYIDS.LIST>
      <ALTEREDON>${moment().format("YYYYMMDD")}</ALTEREDON>
      <DATE>${moment(insertDate).format("YYYYMMDD")}</DATE>
      <VCHSTATUSDATE>${moment(insertDate).format("YYYYMMDD")}</VCHSTATUSDATE>
      <GUID>d8d94e8c-ad22-40d9-b88e-8e570bac417c-000${randCode}</GUID>
      <NARRATION>Being Material added from the production floor Date-${moment(insertDate).format("DD-MM-YYYY")} Ref: ${rtnRefId}</NARRATION>
      <ENTEREDBY>${userName}</ENTEREDBY>
      <ALTEREDBY>${userName}</ALTEREDBY>
      <OBJECTUPDATEACTION>Alter</OBJECTUPDATEACTION>
      <GSTREGISTRATION>Not Applicable</GSTREGISTRATION>
      <VOUCHERTYPENAME>Stock Journal</VOUCHERTYPENAME>
      <VOUCHERNUMBER>${reversalTxnId}/${rtnRefId}</VOUCHERNUMBER>
      <NUMBERINGSTYLE>Automatic (Manual Override)</NUMBERINGSTYLE>
      <CSTFORMISSUETYPE>Not Applicable</CSTFORMISSUETYPE>
      <CSTFORMRECVTYPE>Not Applicable</CSTFORMRECVTYPE>
      <FBTPAYMENTTYPE>Default</FBTPAYMENTTYPE>
      <PERSISTEDVIEW>Consumption Voucher View</PERSISTEDVIEW>
      <VCHSTATUSTAXADJUSTMENT>Default</VCHSTATUSTAXADJUSTMENT>
      <VCHSTATUSVOUCHERTYPE>Stock Journal</VCHSTATUSVOUCHERTYPE>
      <VCHGSTCLASS>Not Applicable</VCHGSTCLASS>
      <VCHENTRYMODE>Use for Stock Journal</VCHENTRYMODE>
      <VOUCHERTYPEORIGNAME>Stock Journal</VOUCHERTYPEORIGNAME>
      <DESTINATIONGODOWN>${locationId}</DESTINATIONGODOWN>
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
      <ALTERID>626946</ALTERID>
      <MASTERID>338965</MASTERID>
      <VOUCHERKEY>196881300850344</VOUCHERKEY>
      <VOUCHERRETAINKEY>${count}</VOUCHERRETAINKEY>
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
      <INVENTORYENTRIESIN.LIST>
       ${inventoryEntriesIn}
      </INVENTORYENTRIESIN.LIST>
      <INVENTORYENTRIESOUT.LIST> </INVENTORYENTRIESOUT.LIST>
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
       <UDF:VCHMACHINEDATE DESC="\`VchMachineDate\`">${moment(insertDate).format("YYYYMMDD")}</UDF:VCHMACHINEDATE>
      </UDF:VCHMACHINEDATE.LIST>
      <UDF:HBSENTEREDBY.LIST DESC="\`HBSEnteredBy\`" ISLIST="YES" TYPE="String" INDEX="2235">
       <UDF:HBSENTEREDBY DESC="\`HBSEnteredBy\`">${userName}</UDF:HBSENTEREDBY>
      </UDF:HBSENTEREDBY.LIST>
      <UDF:HBSENTEREDON.LIST DESC="\`HBSEnteredOn\`" ISLIST="YES" TYPE="String" INDEX="2236">
       <UDF:HBSENTEREDON DESC="\`HBSEnteredOn\`">${moment().format("D-MMM-YY HH:mm")}</UDF:HBSENTEREDON>
      </UDF:HBSENTEREDON.LIST>
      <UDF:CREATEDBY.LIST DESC="\`Created By\`" ISLIST="YES" TYPE="String" INDEX="8883">
       <UDF:CREATEDBY DESC="\`Created By\`">${userName}</UDF:CREATEDBY>
      </UDF:CREATEDBY.LIST>
     </VOUCHER>
    </TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <COMPANY>
      <REMOTECMPINFO.LIST MERGE="Yes">
       <NAME>ec615b4b-8ed4-4821-a7aa-d8424c778c25-664999</NAME>
       <REMOTECMPNAME>Riot Invoice Sync</REMOTECMPNAME>
       <REMOTECMPSTATE>Uttar Pradesh</REMOTECMPSTATE>
      </REMOTECMPINFO.LIST>
      <REMOTECMPINFO.LIST MERGE="Yes">
       <NAME>ec615b4b-8ed4-4821-a7aa-d8424c778c25-789198</NAME>
       <REMOTECMPNAME>Riot Invoice Sync</REMOTECMPNAME>
       <REMOTECMPSTATE>Uttar Pradesh</REMOTECMPSTATE>
      </REMOTECMPINFO.LIST>
      <REMOTECMPINFO.LIST MERGE="Yes">
       <NAME>ec615b4b-8ed4-4821-a7aa-d8424c778c25-321707</NAME>
       <REMOTECMPNAME>Riot Invoice Sync</REMOTECMPNAME>
       <REMOTECMPSTATE>Uttar Pradesh</REMOTECMPSTATE>
      </REMOTECMPINFO.LIST>
      <REMOTECMPINFO.LIST MERGE="Yes">
       <NAME>ec615b4b-8ed4-4821-a7aa-d8424c778c25</NAME>
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

      const filePath = `${tempDir}${xmlFileName}`;
      console.log(`Writing XML file: ${filePath}`);
      const formattedXML = xmlFormatter(xmlData.replace(/`/g, "`"));
      fs.writeFileSync(filePath, formattedXML);
      if (fs.existsSync(filePath)) {
        files.push({
          name: xmlFileName,
          path: filePath,
        });
        console.log(`Successfully added XML file: ${xmlFileName}`);
      } else {
        console.warn(`Failed to verify existence of file: ${filePath}`);
      }
    }

    console.log(`Preparing to zip ${files.length} XML files`);

    if (count === 0) {
      console.warn("No valid references processed for XML generation");
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

    const zipFileName = `${fileName}.zip`;
    const zipFilePath = `./files/xml/${zipFileName}`;
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('entry', (entry) => {
      console.log(`Added file to ZIP: ${entry.name}`);
    });

    output.on('close', async () => {
      console.log(`ZIP file created: ${zipFilePath}, size: ${archive.pointer()} bytes`);
      files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
          console.log(`Deleted temporary file: ${file.path}`);
        }
      });
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir, { recursive: true });
        console.log(`Deleted temporary directory: ${tempDir}`);
      }

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

      let user = await invtDB.query("SELECT `Email_ID`,`user_name` from `admin_login` WHERE `CustID`= :CustID", {
        replacements: { CustID: uid },
        type: invtDB.QueryTypes.SELECT,
      });
      if (!user.length) {
        console.error(`No user found for CustID: ${uid}`);
        if (fs.existsSync(zipFilePath)) {
          fs.unlinkSync(zipFilePath);
          console.log(`Deleted ZIP file due to no user: ${zipFilePath}`);
        }
        return;
      }
      let userEmail = user[0].Email_ID;
      let attachment = [
        {
          filename: "XML report of FG Dismantling",
          content: fs.readFileSync(zipFilePath),
        },
      ];
      helper.sendMail(
        userEmail,
        "",
        expression + " transaction [File Ready for download] Ref:" + helper.randomNumber(99999, 999999),
        htmlTemplate(user[0].user_name, new Date(), "FG Dismantling in XML", `${process.env.SOCKET_API_URL}/${zipFilePath}`),
        attachment
      );
    });

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
      files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
          console.log(`Deleted temporary file in error handler: ${file.path}`);
        }
      });
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir, { recursive: true });
        console.log(`Deleted temporary directory in error handler: ${tempDir}`);
      }
      if (fs.existsSync(zipFilePath)) {
        fs.unlinkSync(zipFilePath);
        console.log(`Deleted ZIP file in error handler: ${zipFilePath}`);
      }
    });

    if (files.length === 0) {
      console.warn("No XML files to zip");
      await otherDB.query("UPDATE `user_files_req` SET `status` = 'failed' WHERE `user_id`= :uid AND `req_code` = :req_code AND req_date = :req_date", {
        replacements: { uid, req_code: expression, req_date: searchDate },
        type: otherDB.QueryTypes.UPDATE,
      });
      emit_notifications(notificationId);
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir, { recursive: true });
        console.log(`Deleted temporary directory due to no files: ${tempDir}`);
      }
      return;
    }

    archive.pipe(output);
    files.forEach((f) => {
      if (fs.existsSync(f.path)) {
        archive.file(f.path, { name: f.name });
        console.log(`Queued file for ZIP: ${f.name}`);
      } else {
        console.warn(`Skipping non-existent file for ZIP: ${f.path}`);
      }
    });
    archive.finalize();
  } catch (err) {
    console.error("FG Dismantling XML Error:", err);
    await otherDB.query("UPDATE `user_files_req` SET `status` = 'failed' WHERE `reactNotificationId`= :uid AND `req_code` = :expression", {
      replacements: { expression, uid: notificationId },
      type: otherDB.QueryTypes.UPDATE,
    });
    emit_notifications(notificationId);
    const tempDir = "./files/xml/temp3/";
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir, { recursive: true });
      console.log(`Deleted temporary directory in catch block: ${tempDir}`);
    }
  }
};