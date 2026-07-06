const moment = require("moment");
const fs = require("fs");
require("dotenv").config();

const { otherDB, invtDB } = require("./../../config/db/connection");
const helper = require("../../helper/helper");
const { htmlTemplate } = require("./EmailTemplate/fileDownload");
const { encode } = require("html-entities");
const xmlFormatter = require("xml-formatter");
const Validator = require("validatorjs");

exports.reject_sf_XML = async (data, uid, emit_notifications, expression, fileName, notificationId, socket, io, branch) => {
  try {
    // Validate input
    const searchDate = JSON.parse(data.otherdata).date;
    if (!/([0-9]{2})-([0-9]{2})-([0-9]{4})/.test(searchDate)) {
      throw new Error("Invalid date format");
    }
    const formattedDate = moment(searchDate, "DD-MM-YYYY").format("YYYY-MM-DD");

    // Query for items transferred from SF024 to production floor
    let stmt1 = await invtDB.query(
      "SELECT rm_location.*, components.c_name, components.component_key, components.c_part_no, units.units_name, admin_login.user_name, location_main.loc_name AS loc_in_name, loc2.loc_name AS loc_out_name " +
      "FROM rm_location " +
      "LEFT JOIN components ON rm_location.components_id = components.component_key " +
      "LEFT JOIN units ON components.c_uom = units.units_id " +
      "LEFT JOIN admin_login ON rm_location.insert_by = admin_login.CustID " +
      "LEFT JOIN location_main ON rm_location.loc_in = location_main.location_key " +
      "LEFT JOIN location_main AS loc2 ON rm_location.loc_out = loc2.location_key " +
      "WHERE components.c_type = 'R' AND components.c_is_enabled = 'Y' " +
      "AND DATE_FORMAT(rm_location.insert_date, '%Y-%m-%d') = :date " +
      "AND rm_location.company_branch = :branch " +
      "AND rm_location.trans_type LIKE '%TRANSFER%' " +
      "AND rm_location.loc_out = '1762327014444' " +
      "AND rm_location.loc_in != '1762327014444' " +
      "AND rm_location.loc_in != '1762327049191' " +
      "ORDER BY rm_location.insert_date DESC",
      {
        replacements: { date: formattedDate, branch: branch },
        type: invtDB.QueryTypes.SELECT,
      }
    );

    if (stmt1.length > 0) {
      io.to(uid).emit("download_start_detail", {
        title: "XML REJECTION STORE TO PRODUCTION FLOOR",
        details: searchDate,
        notificationId: notificationId,
        status: "pending",
        detailStatus: true,
        total: false,
        type: "file",
      });

      // Group records by c_part_no and sum qty
      const groupedItems = stmt1.reduce((acc, item) => {
        if (!acc[item.c_part_no]) {
          acc[item.c_part_no] = {
            ...item,
            qty: helper.number(item.qty),
          };
        } else {
          acc[item.c_part_no].qty += helper.number(item.qty);
        }
        return acc;
      }, {});

      const inventoryEntries_1 = [];
      const inventoryEntries_2 = [];

      // Iterate over grouped items to create inventory entries
      for (const c_part_no in groupedItems) {
        const item = groupedItems[c_part_no];

        // Get weighted purchase rate
        const last_purchase = await require("../../helper/utils").getWeightedPurchaseRate(
          item.component_key,
          moment(item.insert_date).tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss")
        );

        const amount = helper.number(item.qty * helper.number(last_purchase));

        // Escape special characters
        const escapedPartNo = encode(item.c_part_no);
        const escapedUnitsName = encode(item.units_name);

        // INVENTORYENTRIESIN for SF024 (Rejection)
        const inventoryEntry_1 = `
          <INVENTORYENTRIESIN.LIST>
            <STOCKITEMNAME>${escapedPartNo}</STOCKITEMNAME>
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
            <RATE>${last_purchase}/${escapedUnitsName}</RATE>
            <AMOUNT>-${amount}</AMOUNT>
            <ACTUALQTY> ${item.qty} ${escapedUnitsName}</ACTUALQTY>
            <BILLEDQTY> ${item.qty} ${escapedUnitsName}</BILLEDQTY>
            <BATCHALLOCATIONS.LIST>
              <GODOWNNAME>GDWP001_Alwar</GODOWNNAME>
              <BATCHNAME>Primary Batch</BATCHNAME>
              <INDENTNO>&#4; Not Applicable</INDENTNO>
              <ORDERNO>&#4; Not Applicable</ORDERNO>
              <TRACKINGNUMBER>&#4; Not Applicable</TRACKINGNUMBER>
              <DYNAMICCSTISCLEARED>No</DYNAMICCSTISCLEARED>
              <AMOUNT>-${amount}</AMOUNT>
              <ACTUALQTY> ${item.qty} ${escapedUnitsName}</ACTUALQTY>
              <BILLEDQTY> ${item.qty} ${escapedUnitsName}</BILLEDQTY>
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

        // INVENTORYENTRIESOUT for source location
        const inventoryEntry_2 = `
          <INVENTORYENTRIESOUT.LIST>
            <STOCKITEMNAME>${escapedPartNo}</STOCKITEMNAME>
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
            <RATE>${last_purchase}/${escapedUnitsName}</RATE>
            <AMOUNT>${amount}</AMOUNT>
            <ACTUALQTY> ${item.qty} ${escapedUnitsName}</ACTUALQTY>
            <BILLEDQTY> ${item.qty} ${escapedUnitsName}</BILLEDQTY>
            <BATCHALLOCATIONS.LIST>
              <GODOWNNAME>GDSF024_Rejection_Alwar</GODOWNNAME>
              <BATCHNAME>Primary Batch</BATCHNAME>
              <INDENTNO>&#4; Not Applicable</INDENTNO>
              <ORDERNO>&#4; Not Applicable</ORDERNO>
              <TRACKINGNUMBER>&#4; Not Applicable</TRACKINGNUMBER>
              <DYNAMICCSTISCLEARED>No</DYNAMICCSTISCLEARED>
              <AMOUNT>${amount}</AMOUNT>
              <ACTUALQTY> ${item.qty} ${escapedUnitsName}</ACTUALQTY>
              <BILLEDQTY> ${item.qty} ${escapedUnitsName}</BILLEDQTY>
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

        inventoryEntries_1.push(inventoryEntry_1);
        inventoryEntries_2.push(inventoryEntry_2);
      }

      const inventoryEntriesXML_1 = inventoryEntries_1.join("");
      const inventoryEntriesXML_2 = inventoryEntries_2.join("");
      const randCode = helper.randomNumber(99999, 999999);

      // Create a single voucher with all inventory entries
      const voucher = `
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER REMOTEID="d8d94e8c-ad22-40d9-b88e-8e570bac417c-00052bef-${randCode}" VCHKEY="d8d94e8c-ad22-40d9-b88e-8e570bac417c-0000b310:0000069c-${randCode}" VCHTYPE="Inter Godown Trfr-SF" ACTION="Create" OBJVIEW="Consumption Voucher View">
            <OLDAUDITENTRYIDS.LIST TYPE="Number">
              <OLDAUDITENTRYIDS>-1</OLDAUDITENTRYIDS>
            </OLDAUDITENTRYIDS.LIST>
            <DATE>${moment(searchDate, "DD-MM-YYYY").format("YYYYMMDD")}</DATE>
            <VCHSTATUSDATE>${moment(searchDate, "DD-MM-YYYY").format("YYYYMMDD")}</VCHSTATUSDATE>
            <GUID>d8d94e8c-ad22-40d9-b88e-8e570bac417c-00052bef-${randCode}</GUID>
            <NARRATION>Being material transfer from Rejection store to Production floor dated ${moment(searchDate, "DD-MM-YYYY").format("DD-MM-YYYY")}</NARRATION>
            <ENTEREDBY>sachin.koli</ENTEREDBY>
            <OBJECTUPDATEACTION>Create</OBJECTUPDATEACTION>
            <CLASSNAME>InterGodown</CLASSNAME>
            <GSTREGISTRATION>&#4; Not Applicable</GSTREGISTRATION>
            <VOUCHERTYPENAME>Inter Godown Trfr-SF</VOUCHERTYPENAME>
            <VOUCHERNUMBER>REJ/SF${moment(searchDate, "DD-MM-YYYY").format("DDMMYY")}-1</VOUCHERNUMBER>
            <NUMBERINGSTYLE>Automatic (Manual Override)</NUMBERINGSTYLE>
            <CSTFORMISSUETYPE>&#4; Not Applicable</CSTFORMISSUETYPE>
            <CSTFORMRECVTYPE>&#4; Not Applicable</CSTFORMRECVTYPE>
            <PERSISTEDVIEW>Consumption Voucher View</PERSISTEDVIEW>
            <VCHSTATUSTAXADJUSTMENT>Default</VCHSTATUSTAXADJUSTMENT>
            <VCHSTATUSVOUCHERTYPE>Inter Godown Trfr-SF</VCHSTATUSVOUCHERTYPE>
            <VCHGSTCLASS>&#4; Not Applicable</VCHGSTCLASS>
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
            <EFFECTIVEDATE>${moment(searchDate, "DD-MM-YYYY").format("YYYYMMDD")}</EFFECTIVEDATE>
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
            <CHANGEVCHMODE>No</CHANGEVCHMODE>
            <RESETIRNQRCODE>No</RESETIRNQRCODE>
            <ALTERID>626872</ALTERID>
            <MASTERID>338927</MASTERID>
            <VOUCHERKEY>196881300850332</VOUCHERKEY>
            <VOUCHERRETAINKEY>1</VOUCHERRETAINKEY>
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
            ${inventoryEntriesXML_1}
            ${inventoryEntriesXML_2}
            <GST.LIST> </GST.LIST>
            <PAYROLLMODEOFPAYMENT.LIST> </PAYROLLMODEOFPAYMENT.LIST>
            <ATTDRECORDS.LIST> </ATTDRECORDS.LIST>
            <GSTEWAYCONSIGNORADDRESS.LIST> </GSTEWAYCONSIGNORADDRESS.LIST>
            <GSTEWAYCONSIGNEEADDRESS.LIST> </GSTEWAYCONSIGNEEADDRESS.LIST>
            <TEMPGSTRATEDETAILS.LIST> </TEMPGSTRATEDETAILS.LIST>
            <TEMPGSTADVADJUSTED.LIST> </TEMPGSTADVADJUSTED.LIST>
            <UDF:VCHMACHINEDATE.LIST DESC="\`VchMachineDate\`" ISLIST="YES" TYPE="Date" INDEX="3828">
              <UDF:VCHMACHINEDATE DESC="\`VchMachineDate\`">${moment(searchDate, "DD-MM-YYYY").format("YYYYMMDD")}</UDF:VCHMACHINEDATE>
            </UDF:VCHMACHINEDATE.LIST>
            <UDF:HBSENTEREDBY.LIST DESC="\`HBSEnteredBy\`" ISLIST="YES" TYPE="String" INDEX="2235">
              <UDF:HBSENTEREDBY DESC="\`HBSEnteredBy\`">sachin.koli</UDF:HBSENTEREDBY>
            </UDF:HBSENTEREDBY.LIST>
            <UDF:HBSENTEREDON.LIST DESC="\`HBSEnteredOn\`" ISLIST="YES" TYPE="String" INDEX="2236">
              <UDF:HBSENTEREDON DESC="\`HBSEnteredOn\`">${moment(searchDate, "DD-MM-YYYY").format("DD-MMM-YY HH:mm")}</UDF:HBSENTEREDON>
            </UDF:HBSENTEREDON.LIST>
            <UDF:CREATEDBY.LIST DESC="\`Created By\`" ISLIST="YES" TYPE="String" INDEX="8883">
              <UDF:CREATEDBY DESC="\`Created By\`">sachin.koli</UDF:CREATEDBY>
            </UDF:CREATEDBY.LIST>
          </VOUCHER>
        </TALLYMESSAGE>`;

      // Combine voucher into the final XML
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

      const filePath = `./files/xml/${fileName}.xml`;
      const xmlDataWithBackticks = xmlData.replace(/&grave;/g, "`");
      const formattedXML = xmlFormatter(xmlDataWithBackticks);

      fs.writeFile(filePath, formattedXML, async (err) => {
        if (err) {
          throw new Error("Failed to create the XML file.");
        }
        let stmt = await otherDB.query(
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
        let userEmail = user[0].Email_ID;
        let attachment = [
          {
            filename: "XML report of Rejection to Production",
            content: fs.readFileSync(filePath),
          },
        ];
        helper.sendMail(
          userEmail,
          "",
          `${expression} transaction [File Ready for download] Ref:${helper.randomNumber(99999, 999999)}`,
          htmlTemplate(user[0].user_name, new Date(), "Rejection to Production in XML", `${process.env.SOCKET_API_URL}/${filePath}`),
          attachment
        );
      });
    } else {
      throw new Error("No data found");
    }
  } catch (err) {
    console.log("**************************error********************", err);
    let stmt = await otherDB.query(
      "UPDATE `user_files_req` SET `status` = 'failed' WHERE `reactNotificationId`= :uid AND `req_code` = :expression",
      {
        replacements: { expression: expression, uid: notificationId },
        type: otherDB.QueryTypes.UPDATE,
      }
    );
    emit_notifications(notificationId);
  }
};