const moment = require("moment");
const fs = require("fs");
require("dotenv").config();

const { otherDB, invtDB } = require("./../../config/db/connection");
const helper = require("../../helper/helper");
const { htmlTemplate } = require("./EmailTemplate/fileDownload");
const { encode, decode } = require("html-entities");
const xmlFormatter = require("xml-formatter");
const Validator = require("validatorjs");
const archiver = require("archiver");

exports.rm_consXML = async (date, uid, emit_notifications, expression, fileName, notificationId, socket, io, branch) => {
  // Query for RM to CONSUMPTION location only
  try {
    let stmt1 = await invtDB.query(
      "SELECT components.c_name, `components`.`component_key`, components.c_part_no ,units.units_name, location_main.loc_name, admin_login.user_name , rm_location.insert_date, rm_location.trans_type, rm_location.in_vendor_name, rm_location.out_transaction_id, rm_location.any_remark, rm_location.jw_challan_id, rm_location.qty, loc2.loc_name AS `loc_out` FROM `rm_location` LEFT JOIN `components` ON `rm_location`.`components_id` = `components`.`component_key` LEFT JOIN `units` ON `components`.`c_uom` = `units`.`units_id` LEFT JOIN `location_main` ON `rm_location`.`loc_in` = `location_main`.`location_key`  LEFT JOIN `location_main` as loc2 ON `rm_location`.`loc_out` = `loc2`.`location_key`  LEFT JOIN `admin_login` ON rm_location.insert_by = admin_login.CustID WHERE `components`.`c_type` = 'R' AND `components`.`c_is_enabled` = 'Y' AND DATE_FORMAT( `rm_location`.`insert_date`, '%Y-%m-%d' ) = :date AND `rm_location`.`trans_type` IN('ISSUE') AND rm_location.company_branch = :branch AND FIND_IN_SET( location_main.location_key, (SELECT locations FROM location_allotted WHERE loc_all_key = '202391921334723') ) ORDER BY `rm_location`.`insert_date` DESC",
      {
        replacements: { date: moment(date, "DD-MM-YYYY").format("YYYY-MM-DD"), branch: branch },
        type: invtDB.QueryTypes.SELECT,
      }
    );

    // console.log("stmt1", stmt1.length);

    // return;

    if (stmt1.length > 0) {
      io.to(uid).emit("download_start_detail", {
        title: "XML RM TO CONS",
        details: date,
        notificationId: notificationId,
        status: "pending",
        detailStatus: true,
        total: false,
        type: "file",
      });

      // Build ONE voucher containing ALL items of the selected date
      const inventoryEntries_1 = [];

      for (let i = 0; i < stmt1.length; i++) {
        let modified_location_in, modified_location_out;

        modified_location_in = stmt1[i].loc_in;
        modified_location_out = stmt1[i].loc_out;

        // AVEREAGE RATE
        const last_purchase = await require("../../helper/utils").getWeightedPurchaseRate(
          stmt1[i].component_key,
          moment(date, "DD-MM-YYYY").endOf('day').format("YYYY-MM-DD HH:mm:ss")
        );

        const inventoryEntry_1 = `
                    <INVENTORYENTRIESOUT.LIST>
                        <STOCKITEMNAME>${stmt1[i].c_part_no}</STOCKITEMNAME>
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
                        <RATE>${last_purchase}</RATE>
                        <AMOUNT>${helper.number(helper.number(stmt1[i].qty) * helper.number(last_purchase))}</AMOUNT>
                        <ACTUALQTY> ${helper.number(stmt1[i].qty)}</ACTUALQTY>
                        <BILLEDQTY> ${helper.number(stmt1[i].qty)}</BILLEDQTY>
                        <BATCHALLOCATIONS.LIST>
                            <GODOWNNAME>RM001_Alwar</GODOWNNAME>
                            <BATCHNAME>Primary Batch</BATCHNAME>
                            <INDENTNO>&#4; Not Applicable</INDENTNO>
                            <ORDERNO>&#4; Not Applicable</ORDERNO>
                            <TRACKINGNUMBER>&#4; Not Applicable</TRACKINGNUMBER>
                            <DYNAMICCSTISCLEARED>No</DYNAMICCSTISCLEARED>
                            <AMOUNT>${helper.number(helper.number(stmt1[i].qty) * helper.number(last_purchase))}</AMOUNT>
                            <ACTUALQTY> ${helper.number(stmt1[i].qty)}</ACTUALQTY>
                            <BILLEDQTY> ${helper.number(stmt1[i].qty)}</BILLEDQTY>
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
      }

      const inventoryEntriesXML_1 = inventoryEntries_1.join("");
      const randCode = helper.randomNumber(99999, 999999);

      // Use the same voucher number for all items of that date
      const voucherDate = moment(stmt1[0].insert_date).format("YYYYMMDD");
      const voucherNumber = `CONS${moment(stmt1[0].insert_date).format("DDMMYY")}`;

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
                                    <SVCURRENTCOMPANY>Riot Labz Private Limited - (from 1-Apr-2023)</SVCURRENTCOMPANY>
                                </STATICVARIABLES>
                            </REQUESTDESC>
                            <REQUESTDATA>
                                <TALLYMESSAGE xmlns:UDF="TallyUDF">
                                    <VOUCHER REMOTEID="d8d94e8c-ad22-40d9-b88e-8e570bac417c-0003b10f-${randCode}"
                                        VCHKEY="d8d94e8c-ad22-40d9-b88e-8e570bac417c-0000b08f:${randCode}"
                                        VCHTYPE="Consumption" ACTION="Create" OBJVIEW="Consumption Voucher View">
                                        <OLDAUDITENTRYIDS.LIST TYPE="Number">
                                            <OLDAUDITENTRYIDS>-1</OLDAUDITENTRYIDS>
                                        </OLDAUDITENTRYIDS.LIST>
                                        <ALTEREDON>${voucherDate}</ALTEREDON>
                                        <DATE>${voucherDate}</DATE>
                                        <VCHSTATUSDATE>${voucherDate}</VCHSTATUSDATE>
                                        <GUID>d8d94e8c-ad22-40d9-b88e-8e570bac417c-0003b10f-${randCode}</GUID>
                                        <NARRATION>${stmt1[0].any_remark}</NARRATION>
                                        <ENTEREDBY>sachin.koli</ENTEREDBY>
                                        <OBJECTUPDATEACTION>Alter</OBJECTUPDATEACTION>
                                        <GSTREGISTRATION>&#4; Not Applicable</GSTREGISTRATION>
                                        <VOUCHERTYPENAME>Consumption</VOUCHERTYPENAME>
                                        <VOUCHERNUMBER>${voucherNumber}</VOUCHERNUMBER>
                                        <NUMBERINGSTYLE>Automatic (Manual Override)</NUMBERINGSTYLE>
                                        <CSTFORMISSUETYPE>&#4; Not Applicable</CSTFORMISSUETYPE>
                                        <CSTFORMRECVTYPE>&#4; Not Applicable</CSTFORMRECVTYPE>
                                        <FBTPAYMENTTYPE>Default</FBTPAYMENTTYPE>
                                        <PERSISTEDVIEW>Consumption Voucher View</PERSISTEDVIEW>
                                        <VCHSTATUSTAXADJUSTMENT>Default</VCHSTATUSTAXADJUSTMENT>
                                        <VCHSTATUSVOUCHERTYPE>Consumption</VCHSTATUSVOUCHERTYPE>
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
                                        <ALTERID> 401447</ALTERID>
                                        <MASTERID> 241935</MASTERID>
                                        <VOUCHERKEY>194128226812128</VOUCHERKEY>
                                        <VOUCHERRETAINKEY>4117</VOUCHERRETAINKEY>
                                        <VOUCHERNUMBERSERIES>Default</VOUCHERNUMBERSERIES>
                                        <UPDATEDDATETIME>20231004112522000</UPDATEDDATETIME>
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
                                        <INVENTORYENTRIESIN.LIST> </INVENTORYENTRIESIN.LIST>
                                        ${inventoryEntriesXML_1}
                                        <GST.LIST> </GST.LIST>
                                        <PAYROLLMODEOFPAYMENT.LIST> </PAYROLLMODEOFPAYMENT.LIST>
                                        <ATTDRECORDS.LIST> </ATTDRECORDS.LIST>
                                        <GSTEWAYCONSIGNORADDRESS.LIST> </GSTEWAYCONSIGNORADDRESS.LIST>
                                        <GSTEWAYCONSIGNEEADDRESS.LIST> </GSTEWAYCONSIGNEEADDRESS.LIST>
                                        <TEMPGSTRATEDETAILS.LIST> </TEMPGSTRATEDETAILS.LIST>
                                        <TEMPGSTADVADJUSTED.LIST> </TEMPGSTADVADJUSTED.LIST>
                                    </VOUCHER>
                                </TALLYMESSAGE>
                                <TALLYMESSAGE xmlns:UDF="TallyUDF">
                                    <COMPANY>
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
                                            <REMOTECMPNAME>Riot Labz Private Limited - (from 1-Apr-2023)</REMOTECMPNAME>
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
                                            <REMOTECMPNAME>Riot Labz Private Limited - (from 1-Apr-2023)</REMOTECMPNAME>
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
                </ENVELOPE>
                `;

      // Create only ONE XML file containing the single voucher with all items
      let files = [];
      const xmlFileName = fileName + ".xml";
      const singleXmlPath = "./files/xml/" + xmlFileName;
      const xmlDataWithBackticks = xmlData.replace(/&grave;/g, "`");
      const formattedXML = xmlFormatter(xmlDataWithBackticks);
      fs.writeFileSync(singleXmlPath, formattedXML, "utf8");

      files.push({
        name: xmlFileName,
        path: singleXmlPath,
      });

      //START
      const filePath = "./files/xml/" + fileName + ".zip";
      const zipFileName = fs.createWriteStream(filePath);
      const output = zipFileName;
      const archive = archiver("zip", { store: true });
      archive.on("error", (err) => {
        throw err;
      });
      archive.pipe(output);

      files.forEach((f) => {
        archive.append(fs.createReadStream(f.path), { name: f.name });
      });

      archive.finalize();

      let stmt = await otherDB.query("UPDATE `user_files_req` SET `status` = 'complete', `other_data` = :other WHERE `user_id`= :uid AND `req_code` = :req_code AND req_date = :req_date", {
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
      });
      emit_notifications(notificationId);
      // SEND USER MAILDONE
      let user = await invtDB.query("SELECT `Email_ID`,`user_name` from `admin_login` WHERE `CustID`= :CustID", {
        replacements: {
          CustID: uid,
        },
        type: invtDB.QueryTypes.SELECT,
      });
      let userEmail = user[0].Email_ID;
      let attachment = [
        {
          filename: "XML report of RM to CONSUMPTION.zip",
          content: fs.readFileSync(filePath),
        },
      ];

      // return;
      helper.sendMail(
        userEmail,
        "",
        expression + " transaction [File Ready for download] Ref:" + helper.randomNumber(99999, 999999),
        htmlTemplate(user[0].user_name, new Date(), "RM to CONSUMPTION in XML", `${process.env.SOCKET_API_URL}/${filePath}`),
        attachment
      );
      //END MAIL
    }
  } catch (err) {
    console.log("**************************error********************", err);
    let stmt = await otherDB.query("UPDATE `user_files_req` SET `status` = 'failed' WHERE `reactNotificationId`= :uid AND `req_code` = :expression", {
      replacements: {
        expression: expression,
        uid: notificationId,
      },
      type: otherDB.QueryTypes.UPDATE,
    });
    emit_notifications(notificationId);
  }
};
