const moment = require("moment");
const fs = require("fs");
require("dotenv").config();
const { otherDB, invtDB } = require("./../../config/db/connection");
const helper = require("../../helper/helper");
const { htmlTemplate } = require("./EmailTemplate/fileDownload");
const { encode } = require("html-entities");
const xmlFormatter = require("xml-formatter");
const Validator = require("validatorjs");

exports.rm_rejXML = async (date, uid, emit_notifications, expression, fileName, notificationId, socket, io, branch) => {
  try {
    // Validate date format
    if (!/([0-9]{2})-([0-9]{2})-([0-9]{4})/.test(date)) {
      throw new Error("Invalid date format. Expected DD-MM-YYYY.");
    }
    const formattedDate = moment(date, "DD-MM-YYYY").format("YYYY-MM-DD");

    // Query for RM to REJ transactions
    const results = await invtDB.query(
      `SELECT components.c_name, components.c_part_no, components.c_new_part_no, units.units_name, 
              location_main.loc_name, admin_login.user_name, rm_location.insert_date, rm_location.trans_type, 
              rm_location.components_id, rm_location.in_vendor_name, rm_location.out_transaction_id, 
              rm_location.jw_transaction_id, rm_location.jw_challan_id, rm_location.qty, loc2.loc_name AS loc_out 
       FROM rm_location 
       LEFT JOIN components ON rm_location.components_id = components.component_key 
       LEFT JOIN units ON components.c_uom = units.units_id 
       LEFT JOIN location_main ON rm_location.loc_in = location_main.location_key 
       LEFT JOIN location_main AS loc2 ON rm_location.loc_out = loc2.location_key 
       LEFT JOIN admin_login ON rm_location.insert_by = admin_login.CustID 
       WHERE components.c_type = 'R' 
       AND components.c_is_enabled = 'Y' 
       AND DATE_FORMAT(rm_location.insert_date, '%Y-%m-%d') = :date 
       AND rm_location.trans_type IN ('ISSUE', 'JOBWORK', 'REJECTION', 'TRANSFER') 
       AND rm_location.company_branch = :branch 
       AND rm_location.loc_in IN ('1762327014444', '1771842321658') 
       AND rm_location.loc_out NOT IN ('1762327014444', '1762327049191') 
       ORDER BY rm_location.insert_date DESC`,
      {
        replacements: { date: formattedDate, branch: branch },
        type: invtDB.QueryTypes.SELECT,
      }
    );

    if (results.length === 0) {
      console.warn(`No records found for date ${formattedDate} and branch ${branch}`);
      await otherDB.query(
        "UPDATE `user_files_req` SET `status` = 'failed' WHERE `user_id`= :uid AND `req_code` = :req_code AND req_date = :req_date",
        {
          replacements: { uid, req_code: expression, req_date: date },
          type: otherDB.QueryTypes.UPDATE,
        }
      );
      emit_notifications(notificationId);
      return;
    }

    io.to(uid).emit("download_start_detail", {
      title: "XML RM TO REJ",
      details: date,
      notificationId: notificationId,
      status: "pending",
      detailStatus: true,
      total: false,
      type: "file",
    });

    let inventoryEntriesIn = "";
    let inventoryEntriesOut = "";
    const userName = "sachin.koli" 
    const insertDate = results[0].insert_date;

    // Validate and process inventory entries
    for (const item of results) {
      const validator = new Validator(
        {
          c_part_no: item.c_part_no,
          units_name: item.units_name,
          qty: item.qty,
          components_id: item.components_id,
        },
        {
          c_part_no: "required|string|min:1",
          units_name: "required|string|min:1",
          qty: "required|numeric|min:0.0001",
          components_id: "required|string",
        }
      );

      if (validator.fails()) {
        console.warn(`Skipping invalid item: ${JSON.stringify(item)} - Errors: ${JSON.stringify(validator.errors.all())}`);
        continue;
      }

      const qty = parseFloat(item.qty);
      const rate = await require("../../helper/utils").getWeightedPurchaseRate(
        item.components_id,
        moment(insertDate).format("YYYY-MM-DD HH:mm:ss")
      );

      if (isNaN(rate) || rate <= 0) {
        console.warn(`Invalid rate for component ${item.c_part_no}: ${rate}`);
        continue;
      }

      // INVENTORYENTRIESIN
      inventoryEntriesIn += `
        <INVENTORYENTRIESIN.LIST>
          <STOCKITEMNAME>${encode(item.c_part_no)}</STOCKITEMNAME>
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
          <RATE>${helper.number(rate)}/${encode(item.units_name)}</RATE>
          <AMOUNT>-${helper.number(qty * rate)}</AMOUNT>
          <ACTUALQTY>${helper.number(qty)} ${encode(item.units_name)}</ACTUALQTY>
          <BILLEDQTY>${helper.number(qty)} ${encode(item.units_name)}</BILLEDQTY>
          <BATCHALLOCATIONS.LIST>
            <GODOWNNAME>GDSF024_Rejection_Alwar</GODOWNNAME>
            <BATCHNAME>Primary Batch</BATCHNAME>
            <INDENTNO>&#4; Not Applicable</INDENTNO>
            <ORDERNO>&#4; Not Applicable</ORDERNO>
            <TRACKINGNUMBER>&#4; Not Applicable</TRACKINGNUMBER>
            <DYNAMICCSTISCLEARED>No</DYNAMICCSTISCLEARED>
            <AMOUNT>-${helper.number(qty * rate)}</AMOUNT>
            <ACTUALQTY>${helper.number(qty)} ${encode(item.units_name)}</ACTUALQTY>
            <BILLEDQTY>${helper.number(qty)} ${encode(item.units_name)}</BILLEDQTY>
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

      // INVENTORYENTRIESOUT
      inventoryEntriesOut += `
        <INVENTORYENTRIESOUT.LIST>
          <STOCKITEMNAME>${encode(item.c_part_no)}</STOCKITEMNAME>
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
          <RATE>${helper.number(rate)}/${encode(item.units_name)}</RATE>
          <AMOUNT>${helper.number(qty * rate)}</AMOUNT>
          <ACTUALQTY>${helper.number(qty)} ${encode(item.units_name)}</ACTUALQTY>
          <BILLEDQTY>${helper.number(qty)} ${encode(item.units_name)}</BILLEDQTY>
          <BATCHALLOCATIONS.LIST>
            <GODOWNNAME>RM001_Alwar</GODOWNNAME>
            <BATCHNAME>Primary Batch</BATCHNAME>
            <INDENTNO>&#4; Not Applicable</INDENTNO>
            <ORDERNO>&#4; Not Applicable</ORDERNO>
            <TRACKINGNUMBER>&#4; Not Applicable</TRACKINGNUMBER>
            <DYNAMICCSTISCLEARED>No</DYNAMICCSTISCLEARED>
            <AMOUNT>${helper.number(qty * rate)}</AMOUNT>
            <ACTUALQTY>${helper.number(qty)} ${encode(item.units_name)}</ACTUALQTY>
            <BILLEDQTY>${helper.number(qty)} ${encode(item.units_name)}</BILLEDQTY>
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

    if (!inventoryEntriesIn || !inventoryEntriesOut) {
      console.warn(`No valid components processed for XML generation on date ${formattedDate}`);
      await otherDB.query(
        "UPDATE `user_files_req` SET `status` = 'failed' WHERE `user_id`= :uid AND `req_code` = :req_code AND req_date = :req_date",
        {
          replacements: { uid, req_code: expression, req_date: date },
          type: otherDB.QueryTypes.UPDATE,
        }
      );
      emit_notifications(notificationId);
      return;
    }

    const randCode = helper.randomNumber(99999, 999999);
    const voucherNumber = `${moment(insertDate).format("DDMMYY")}-${randCode}`;
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
                <VOUCHER REMOTEID="d8d94e8c-ad22-40d9-b88e-8e570bac417c-000${randCode}" VCHKEY="d8d94e8c-ad22-40d9-b88e-8e570bac417c-0000b32b:000001e8-${randCode}" VCHTYPE="Inter Godown Trfr-SF" ACTION="Create" OBJVIEW="Consumption Voucher View">
                  <OLDAUDITENTRYIDS.LIST TYPE="Number">
                    <OLDAUDITENTRYIDS>-1</OLDAUDITENTRYIDS>
                  </OLDAUDITENTRYIDS.LIST>
                  <ALTEREDON>${moment().format("YYYYMMDD")}</ALTEREDON>
                  <DATE>${moment(insertDate).format("YYYYMMDD")}</DATE>
                  <VCHSTATUSDATE>${moment(insertDate).format("YYYYMMDD")}</VCHSTATUSDATE>
                  <GUID>d8d94e8c-ad22-40d9-b88e-8e570bac417c-000${randCode}</GUID>
                  <NARRATION>Being material transfer from Production floor to Rejection store dated ${moment(insertDate).format("DD-MM-YYYY")}</NARRATION>
                  <ENTEREDBY>${userName}</ENTEREDBY>
                  <ALTEREDBY>hariom</ALTEREDBY>
                  <TYPEOFUPDATEACTIVITY>Import</TYPEOFUPDATEACTIVITY>
                  <OBJECTUPDATEACTION/>
                  <CLASSNAME>InterGodown</CLASSNAME>
                  <GSTREGISTRATION>&#4; Not Applicable</GSTREGISTRATION>
                  <VOUCHERTYPENAME>Inter Godown Trfr-SF</VOUCHERTYPENAME>
                  <VOUCHERNUMBER>RM/REJ/${voucherNumber}</VOUCHERNUMBER>
                  <NUMBERINGSTYLE>Automatic (Manual Override)</NUMBERINGSTYLE>
                  <CSTFORMISSUETYPE>&#4; Not Applicable</CSTFORMISSUETYPE>
                  <CSTFORMRECVTYPE>&#4; Not Applicable</CSTFORMRECVTYPE>
                  <FBTPAYMENTTYPE>Default</FBTPAYMENTTYPE>
                  <PERSISTEDVIEW>Consumption Voucher View</PERSISTEDVIEW>
                  <VCHSTATUSTAXADJUSTMENT>Default</VCHSTATUSTAXADJUSTMENT>
                  <VCHSTATUSVOUCHERTYPE>Inter Godown Trfr-SF</VCHSTATUSVOUCHERTYPE>
                  <VCHGSTCLASS>&#4; Not Applicable</VCHGSTCLASS>
                  <VOUCHERTYPEORIGNAME>Inter Godown Trfr-SF</VOUCHERTYPEORIGNAME>
                  <DESTINATIONGODOWN>GDSF024_Rejection_Alwar</DESTINATIONGODOWN>
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
                  <USEFORGODOWNTRANSFER>Yes</USEFORGODOWNTRANSFER>
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
                  <ALTERID>632074</ALTERID>
                  <MASTERID>341697</MASTERID>
                  <VOUCHERKEY>196997264966120</VOUCHERKEY>
                  <VOUCHERRETAINKEY>1545</VOUCHERRETAINKEY>
                  <VOUCHERNUMBERSERIES>Default</VOUCHERNUMBERSERIES>
                  <UPDATEDDATETIME>${moment().format("YYYYMMDDHHmmss000")}</UPDATEDDATETIME>
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
                  <UDF:VCHMACHINEDATE.LIST DESC="\`VchMachineDate\`" ISLIST="YES" TYPE="Date" INDEX="3828">
                    <UDF:VCHMACHINEDATE DESC="\`VchMachineDate\`">${moment(insertDate).format("YYYYMMDD")}</UDF:VCHMACHINEDATE>
                  </UDF:VCHMACHINEDATE.LIST>
                  <UDF:HBSENTEREDBY.LIST DESC="\`HBSEnteredBy\`" ISLIST="YES" TYPE="String" INDEX="2235">
                    <UDF:HBSENTEREDBY DESC="\`HBSEnteredBy\`">${userName}</UDF:HBSENTEREDBY>
                  </UDF:HBSENTEREDBY.LIST>
                  <UDF:HBSENTEREDON.LIST DESC="\`HBSEnteredOn\`" ISLIST="YES" TYPE="String" INDEX="2236">
                    <UDF:HBSENTEREDON DESC="\`HBSEnteredOn\`">${moment(insertDate).tz("Asia/Kolkata").format("D-MMM-YY HH:mm")}</UDF:HBSENTEREDON>
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
    const xmlDataWithBackticks = xmlData.replace(/&grave;/g, "`");

    // Write unformatted XML for debugging
    fs.writeFileSync(`./files/xml/${fileName}_raw.xml`, xmlDataWithBackticks);

    // Attempt to format XML
    let formattedXML;
    try {
      formattedXML = xmlFormatter(xmlDataWithBackticks, { collapseContent: true });
    } catch (formatErr) {
      console.error(`XML Formatting Error: ${formatErr.message}`);
      console.error(`Problematic XML written to: ${filePath}_raw.xml`);
      throw new Error(`XML formatting failed: ${formatErr.message}`);
    }

    fs.writeFile(filePath, formattedXML, async (err) => {
      if (err) {
        throw new Error(`Failed to write XML file: ${err.message}`);
      }
      await otherDB.query(
        "UPDATE `user_files_req` SET `status` = 'complete', `other_data` = :other WHERE `user_id`= :uid AND `req_code` = :req_code AND req_date = :req_date",
        {
          replacements: {
            uid: uid,
            req_code: expression,
            req_date: date,
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
          filename: "XML report of RM to Rejection.xml",
          content: fs.readFileSync(filePath),
        },
      ];
      helper.sendMail(
        userEmail,
        "",
        `${expression} transaction [File Ready for download] Ref:${helper.randomNumber(99999, 999999)}`,
        htmlTemplate(user[0].user_name, new Date(), "RM to Rejection in XML", `${process.env.SOCKET_API_URL}/${filePath}`),
        attachment
      );
    });
  } catch (err) {
    console.error("**************************error********************", err);
    console.error(`Error processing XML for date: ${date}, user: ${uid}, file: ${fileName}`);
    await otherDB.query(
      "UPDATE `user_files_req` SET `status` = 'failed' WHERE `user_id`= :uid AND `req_code` = :req_code AND req_date = :req_date",
      {
        replacements: { uid, req_code: expression, req_date: date },
        type: otherDB.QueryTypes.UPDATE,
      }
    );
    emit_notifications(notificationId);
  }
};