const moment = require("moment");
const xmlFormatter = require("xml-formatter");
const { invtDB, otherDB } = require("./../../config/db/connection");
const helper = require("../../helper/helper");
const { htmlTemplate } = require("./EmailTemplate/fileDownload");
const fs = require("fs");

exports.part_conversionXML = async (data, uid, emit_notifications, expression, fileName, notificationId, socket, io, branch) => {
  try {
    const searchDate = JSON.parse(data.otherdata).date;
    if (!/([0-9]{2})-([0-9]{2})-([0-9]{4})/.test(searchDate)) {
      throw new Error("Invalid date format");
    }
    const formattedDate = moment(searchDate, "DD-MM-YYYY").format("YYYY-MM-DD");

    // Query for INWARD transactions
    const inwardResults = await invtDB.query(
      `SELECT admin_login.user_name, location_main.loc_name, rm_location.in_transaction_id, rm_location.qty, 
              components.c_part_no, components.c_new_part_no, components.c_name, components.component_key,
              units.units_name, rm_location.insert_date
       FROM rm_location
       LEFT JOIN components ON components.component_key = rm_location.components_id
       LEFT JOIN units ON units.units_id = components.c_uom
       LEFT JOIN admin_login ON admin_login.CustID = rm_location.insert_by
       LEFT JOIN location_main ON location_main.location_key = rm_location.loc_in
       WHERE rm_location.company_branch = :branch
       AND rm_location.in_module = 'PART-CONV'
       AND rm_location.trans_type = 'INWARD'
       AND DATE_FORMAT(rm_location.insert_date, '%Y-%m-%d') = :date
       ORDER BY rm_location.ID DESC`,
      {
        replacements: { date: formattedDate, branch: branch },
        type: invtDB.QueryTypes.SELECT,
      }
    );

    if (inwardResults.length === 0) {
      console.warn(`No INWARD records found for date ${formattedDate} and branch ${branch}`);
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

    // Extract transaction IDs
    const transactionIds = inwardResults.map((item) => item.in_transaction_id);

    // Query for CONSUMPTION transactions
    const consumptionResults = await invtDB.query(
      `SELECT rm_location.qty, location_main.loc_name, components.c_part_no, components.c_new_part_no, 
              components.c_name, components.component_key, units.units_name, rm_location.out_transaction_id
       FROM rm_location
       LEFT JOIN components ON components.component_key = rm_location.components_id
       LEFT JOIN units ON units.units_id = components.c_uom
       LEFT JOIN location_main ON location_main.location_key = rm_location.loc_out
       WHERE rm_location.in_module = 'PART-CONV'
       AND rm_location.trans_type = 'CONSUMPTION'
       AND rm_location.out_transaction_id IN (:transactions)
       ORDER BY rm_location.ID DESC`,
      {
        replacements: { transactions: transactionIds },
        type: invtDB.QueryTypes.SELECT,
      }
    );

    io.to(uid).emit("download_start_detail", {
      title: "XML Part Code Conversion",
      details: searchDate,
      notificationId: notificationId,
      status: "pending",
      detailStatus: true,
      total: false,
      type: "file",
    });

    let inventoryEntriesIn = "";
    let inventoryEntriesOut = "";
    const userName = "sachin.koli";
    const insertDate = inwardResults[0].insert_date;

    // Process INWARD entries
    for (const item of inwardResults) {
      const qty = item.qty || 0;
      if (qty <= 0) {
        console.warn(`Skipping INWARD item with zero or negative quantity: ${item.c_part_no}, qty: ${qty}`);
        continue;
      }
      if (!item.c_part_no || !item.c_name) {
        console.warn(`Skipping INWARD item due to missing component data: ${JSON.stringify(item)}`);
        continue;
      }

      const rate = await require("../../helper/utils").getWeightedPurchaseRate(
        item.component_key,
        moment(item.insert_date, "YYYY-MM-DD").format("YYYY-MM-DD HH:mm:ss")
      );

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
            <AMOUNT>-${helper.number(qty * rate)}</AMOUNT>
            <ACTUALQTY>${qty} ${item.units_name || "Unit"}</ACTUALQTY>
            <BILLEDQTY>${qty} ${item.units_name || "Unit"}</BILLEDQTY>
            <BATCHALLOCATIONS.LIST>
              <GODOWNNAME>GDWP001_A21</GODOWNNAME>
              <BATCHNAME>Primary Batch</BATCHNAME>
              <DESTINATIONGODOWNNAME>GDWP001_A21</DESTINATIONGODOWNNAME>
              <INDENTNO>&#4; Not Applicable</INDENTNO>
              <ORDERNO>&#4; Not Applicable</ORDERNO>
              <TRACKINGNUMBER>&#4; Not Applicable</TRACKINGNUMBER>
              <DYNAMICCSTISCLEARED>No</DYNAMICCSTISCLEARED>
              <AMOUNT>-${helper.number(qty * rate)}</AMOUNT>
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

    // Process CONSUMPTION entries
    for (const item of consumptionResults) {
      const qty = item.qty || 0;
      if (qty <= 0) {
        console.warn(`Skipping CONSUMPTION item with zero or negative quantity: ${item.c_part_no}, qty: ${qty}`);
        continue;
      }
      if (!item.c_part_no || !item.c_name) {
        console.warn(`Skipping CONSUMPTION item due to missing component data: ${JSON.stringify(item)}`);
        continue;
      }

      const rate = await require("../../helper/utils").getWeightedPurchaseRate(
        item.component_key,
        moment(inwardResults[0].insert_date, "YYYY-MM-DD").format("YYYY-MM-DD HH:mm:ss")
      );

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
            <AMOUNT>${helper.number(qty * rate)}</AMOUNT>
            <ACTUALQTY>${qty} ${item.units_name || "Unit"}</ACTUALQTY>
            <BILLEDQTY>${qty} ${item.units_name || "Unit"}</BILLEDQTY>
            <BATCHALLOCATIONS.LIST>
              <GODOWNNAME>GDWP001_A21</GODOWNNAME>
              <BATCHNAME>Primary Batch</BATCHNAME>
              <INDENTNO>&#4; Not Applicable</INDENTNO>
              <ORDERNO>&#4; Not Applicable</ORDERNO>
              <TRACKINGNUMBER>&#4; Not Applicable</TRACKINGNUMBER>
              <DYNAMICCSTISCLEARED>No</DYNAMICCSTISCLEARED>
              <AMOUNT>${helper.number(qty * rate)}</AMOUNT>
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
          </INVENTORYENTRIESOUT.LIST>`;
    }

    if (inventoryEntriesIn === "" || inventoryEntriesOut === "") {
      console.warn(`No valid components processed for XML generation on date ${formattedDate}`);
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

    const randCode = helper.randomNumber(99999, 999999);
    const voucherNumber = `CONV/${randCode}`;
    let xmlOutput = `
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
                <VOUCHER REMOTEID="d8d94e8c-ad22-40d9-b88e-8e570bac417c-000${randCode}" VCHKEY="d8d94e8c-ad22-40d9-b88e-8e570bac417c-0000b315:00000140-${randCode}" VCHTYPE="Stock Journal" ACTION="Create" OBJVIEW="Consumption Voucher View">
                  <OLDAUDITENTRYIDS.LIST TYPE="Number">
                    <OLDAUDITENTRYIDS>-1</OLDAUDITENTRYIDS>
                  </OLDAUDITENTRYIDS.LIST>
                  <DATE>${moment(insertDate).format("YYYYMMDD")}</DATE>
                  <REFERENCEDATE>${moment(insertDate).format("YYYYMMDD")}</REFERENCEDATE>
                  <VCHSTATUSDATE>${moment(insertDate).format("YYYYMMDD")}</VCHSTATUSDATE>
                  <GUID>d8d94e8c-ad22-40d9-b88e-8e570bac417c-000${randCode}</GUID>
                  <NARRATION>Part Code Conversion for date ${moment(insertDate).format("DD-MM-YYYY")}</NARRATION>
                  <ENTEREDBY>${userName}</ENTEREDBY>
                  <OBJECTUPDATEACTION>Create</OBJECTUPDATEACTION>
                  <GSTREGISTRATION>&#4; Not Applicable</GSTREGISTRATION>
                  <VOUCHERTYPENAME>Stock Journal</VOUCHERTYPENAME>
                  <VOUCHERNUMBER>${voucherNumber}</VOUCHERNUMBER>
                  <NUMBERINGSTYLE>Automatic (Manual Override)</NUMBERINGSTYLE>
                  <CSTFORMISSUETYPE>&#4; Not Applicable</CSTFORMISSUETYPE>
                  <CSTFORMRECVTYPE>&#4; Not Applicable</CSTFORMRECVTYPE>
                  <PERSISTEDVIEW>Consumption Voucher View</PERSISTEDVIEW>
                  <VCHSTATUSTAXADJUSTMENT>Default</VCHSTATUSTAXADJUSTMENT>
                  <VCHSTATUSVOUCHERTYPE>Stock Journal</VCHSTATUSVOUCHERTYPE>
                  <VCHGSTCLASS>&#4; Not Applicable</VCHGSTCLASS>
                  <VCHENTRYMODE>Use for Stock Journal</VCHENTRYMODE>
                  <DESTINATIONGODOWN>GDWP001_A21</DESTINATIONGODOWN>
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
                  <ALTERID>625376</ALTERID>
                  <MASTERID>338066</MASTERID>
                  <VOUCHERKEY>196902775685440</VOUCHERKEY>
                  <VOUCHERRETAINKEY>1</VOUCHERRETAINKEY>
                  <VOUCHERNUMBERSERIES>Default</VOUCHERNUMBERSERIES>
                  <UPDATEDDATETIME>${moment().format("YYYYMMDDHHmmss000")}</UPDATEDDATETIME>
                  <EWAYBILLDETAILS.LIST> </EWAYBILLDETAILS.LIST>
                  <EXCLUDEDTAXATIONS.LIST> </EXCLUDEDTAXATIONS.LIST>
                  <OLDAUDITENTRIES.LIST> </OLDAUDITENTRIES.LIST>
                  <ACCOUNTAUDITENTRIES.LIST> </ACCOUNTAUDITENTRIES.LIST>
                  <AUDITENTRIES.LIST> </AUDITENTRIES.LIST>
                  <DUTYHEADDETAILS.LIST> </DUTYHEADDETAILS.LIST>
                  <GSTADVADJ-DETAILS.LIST> </GSTADVADJDETAILS.LIST>
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
                  <UDF:MAC_VCHPREPAREDBY.LIST DESC="\`Mac_VchPreparedBy\`" ISLIST="YES" TYPE="String" INDEX="40066">
                    <UDF:MAC_VCHPREPAREDBY DESC="\`Mac_VchPreparedBy\`">${userName}</UDF:MAC_VCHPREPAREDBY>
                  </UDF:MAC_VCHPREPAREDBY.LIST>
                  <UDF:MAC_VCHPREPARETIME.LIST DESC="\`Mac_VchPrepareTime\`" ISLIST="YES" TYPE="String" INDEX="40067">
                    <UDF:MAC_VCHPREPARETIME DESC="\`Mac_VchPrepareTime\`">${moment().format("DD-MM-YY [at] h:mm A")}</UDF:MAC_VCHPREPARETIME>
                  </UDF:MAC_VCHPREPARETIME.LIST>
                  <UDF:MAC_NARRATION1.LIST DESC="\`Mac_Narration1\`" ISLIST="YES" TYPE="String" INDEX="40076">
                    <UDF:MAC_NARRATION1 DESC="\`Mac_Narration1\`">&#10;&#10;</UDF:MAC_NARRATION1>
                  </UDF:MAC_NARRATION1.LIST>
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

    const filePath = `./files/xml/${fileName}.xml`;
    const xmlDataWithBackticks = xmlOutput.replace(/&grave;/g, "`");
    const formattedXML = xmlFormatter(xmlDataWithBackticks);

    fs.writeFile(filePath, formattedXML, async (err) => {
      if (err) {
        throw new Error("Failed to create the XML file.");
      }
      await otherDB.query(
        "UPDATE `user_files_req` SET `status` = 'complete', `other_data` = :other WHERE `user_id`= :uid AND `req_code` = :req_code AND req_date = :req_date",
        {
          replacements: {
            uid: uid,
            req_code: expression,
            req_date: searchDate,
            other: JSON.stringify({
              fileName: fileName,
              fileUrl: filePath,
              fileBuffer: "N/A",
            }),
          },
          type: otherDB.QueryTypes.UPDATE,
        }
      );
      emit_notifications(notificationId);

      // Send email notification
      let user = await invtDB.query(
        "SELECT `Email_ID`,`user_name` FROM `admin_login` WHERE `CustID`= :CustID",
        {
          replacements: { CustID: uid },
          type: invtDB.QueryTypes.SELECT,
        }
      );
      if (!user.length) {
        console.error(`No user found for CustID: ${uid}`);
        return;
      }
      let userEmail = user[0].Email_ID;
      let attachment = [
        {
          filename: "Part_Code_Conversion.xml",
          content: fs.readFileSync(filePath),
        },
      ];
      helper.sendMail(
        userEmail,
        "",
        `${expression} transaction [File Ready for download] Ref:${helper.randomNumber(99999, 999999)}`,
        htmlTemplate(user[0].user_name, new Date(), "Part Code Conversion in XML", `${process.env.SOCKET_API_URL}/${filePath}`),
        attachment
      );
    });
  } catch (err) {
    console.log("**************************error********************", err);
    await otherDB.query(
      "UPDATE `user_files_req` SET `status` = 'failed' WHERE `user_id`= :uid AND req_code = :req_code AND req_date = :req_date",
      {
        replacements: { uid, req_code: expression, req_date: JSON.parse(data.otherdata).date },
        type: otherDB.QueryTypes.UPDATE,
      }
    );
    emit_notifications(notificationId);
  }
};