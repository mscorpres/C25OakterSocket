const moment = require("moment");
const fs = require("fs");
require("dotenv").config();

const { otherDB, invtDB } = require("./../../config/db/connection");
const helper = require("../../helper/helper");
const { htmlTemplate } = require("./EmailTemplate/fileDownload");
const { encode } = require("html-entities");
const xmlFormatter = require("xml-formatter");
const Validator = require("validatorjs");

exports.sf024_rej021_XML = async (data, uid, emit_notifications, expression, fileName, notificationId, socket, io, branch) => {
  try {
    // Validate input
    const searchDate = JSON.parse(data.otherdata).date;
    if (!/([0-9]{2})-([0-9]{2})-([0-9]{4})/.test(searchDate)) {
      throw new Error("Invalid date format");
    }
    const formattedDate = moment(searchDate, "DD-MM-YYYY").format("YYYY-MM-DD");

    // Query for items transferred from SF024 to Rej021
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
      "AND rm_location.trans_type = 'TRANSFER' " +
      "AND rm_location.loc_out = '20220106105354' " +
      "AND rm_location.loc_in = '20210920102942' " +
      "ORDER BY rm_location.transfer_transaction_id, rm_location.insert_date DESC",
      {
        replacements: { date: formattedDate, branch: branch },
        type: invtDB.QueryTypes.SELECT,
      }
    );

    if (stmt1.length > 0) {
      io.to(uid).emit("download_start_detail", {
        title: "XML SF024 TO REJ021",
        details: searchDate,
        notificationId: notificationId,
        status: "pending",
        detailStatus: true,
        total: false,
        type: "file",
      });

      // Ensure the XML directory exists
      const xmlDir = './files/xml';
      if (!fs.existsSync(xmlDir)) {
        fs.mkdirSync(xmlDir, { recursive: true });
      }

      // Group records by transfer_transaction_id
      const groupedByTransaction = stmt1.reduce((acc, item) => {
        const transactionId = item.transfer_transaction_id;
        if (!acc[transactionId]) {
          acc[transactionId] = [];
        }
        acc[transactionId].push(item);
        return acc;
      }, {});

      let fileCount = 0;
      const totalTransactions = Object.keys(groupedByTransaction).length;
      const createdFiles = [];

      // Process each transaction group and create separate XML files
      for (const [transactionId, transactionItems] of Object.entries(groupedByTransaction)) {
        fileCount++;
        
        // Group items by c_part_no within this transaction and sum qty
        const groupedItems = transactionItems.reduce((acc, item) => {
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

        const inventoryEntries = [];

        // Iterate over grouped items to create inventory entries for this transaction
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

          // Create INVENTORYENTRIESOUT for each c_part_no
          const inventoryEntry = `
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
              <ISINCLTAXRATEFIELDEDITED>No</ISINCLTAXRATEFIELDEDITED>
              <BATCHALLOCATIONS.LIST>
                <GODOWNNAME>GDSF024_Rejection</GODOWNNAME>
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

          inventoryEntries.push(inventoryEntry);
        }

        const inventoryEntriesXML = inventoryEntries.join("");
        const randCode = helper.randomNumber(99999, 999999);
        
        // Sanitize transaction ID to make it safe for file naming
        const sanitizedTransactionId = transactionId.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
        const transactionFileName = `${fileName}_TXN_${sanitizedTransactionId}`;

        // Create voucher for this specific transaction
        const voucher = `
          <TALLYMESSAGE xmlns:UDF="TallyUDF">
            <VOUCHER REMOTEID="d8d94e8c-ad22-40d9-b88e-8e570bac417c-00000000-${randCode}" VCHKEY="d8d94e8c-ad22-40d9-b88e-8e570bac417c-0000b2f8:000004a7-${randCode}" VCHTYPE="Consumption - QCF" ACTION="Create" OBJVIEW="Consumption Voucher View">
              <OLDAUDITENTRYIDS.LIST TYPE="Number">
                <OLDAUDITENTRYIDS>-1</OLDAUDITENTRYIDS>
              </OLDAUDITENTRYIDS.LIST>
              <ALTEREDON>${moment(searchDate, "DD-MM-YYYY").format("YYYYMMDD")}</ALTEREDON>
              <VCHSTATUSDATE>${moment(searchDate, "DD-MM-YYYY").format("YYYYMMDD")}</VCHSTATUSDATE>
              <DATE>${moment(searchDate, "DD-MM-YYYY").format("YYYYMMDD")}</DATE>
              <GUID>d8d94e8c-ad22-40d9-b88e-8e570bac417c-00000000-${randCode}</GUID>
              <NARRATION>${transactionItems[0].any_remark}</NARRATION>
              <ENTEREDBY>hariom</ENTEREDBY>
              <ALTEREDBY>hariom</ALTEREDBY>
              <OBJECTUPDATEACTION>Create</OBJECTUPDATEACTION>
              <GSTREGISTRATION>&#4; Not Applicable</GSTREGISTRATION>
              <VOUCHERTYPENAME>Consumption - QCF</VOUCHERTYPENAME>
              <VOUCHERNUMBER>SF/REJ021/${moment(searchDate, "DD-MM-YYYY").format("DDMMYY")}-${fileCount}</VOUCHERNUMBER>
              <CMPGSTSTATE>&#4; Not Applicable</CMPGSTSTATE>
              <NUMBERINGSTYLE>Automatic (Manual Override)</NUMBERINGSTYLE>
              <CSTFORMISSUETYPE>&#4; Not Applicable</CSTFORMISSUETYPE>
              <CSTFORMRECVTYPE>&#4; Not Applicable</CSTFORMRECVTYPE>
              <FBTPAYMENTTYPE>Default</FBTPAYMENTTYPE>
              <PERSISTEDVIEW>Consumption Voucher View</PERSISTEDVIEW>
              <VCHSTATUSTAXADJUSTMENT>Default</VCHSTATUSTAXADJUSTMENT>
              <VCHSTATUSVOUCHERTYPE>Consumption - QCF</VCHSTATUSVOUCHERTYPE>
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
              <EFFECTIVEDATE>${moment(searchDate, "DD-MM-YYYY").format("YYYYMMDD")}</EFFECTIVEDATE>
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
              ${inventoryEntriesXML}
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
              <ALTERID>0</ALTERID>
              <MASTERID>0</MASTERID>
              <VOUCHERKEY>196778221634727</VOUCHERKEY>
              <VOUCHERRETAINKEY>0</VOUCHERRETAINKEY>
              <VOUCHERNUMBERSERIES>Default</VOUCHERNUMBERSERIES>
              <UPDATEDDATETIME>${moment(searchDate, "DD-MM-YYYY").format("YYYYMMDDHHmmss")}</UPDATEDDATETIME>
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
            <UDF:HBSHISTORYAGG.LIST DESC="\`HBSHistoryAgg\`" INDEX="2211">
              <UDF:HBSALTEREDBY.LIST DESC="\`HBSAlteredBy\`" ISLIST="YES" TYPE="String" INDEX="2237">
                <UDF:HBSALTEREDBY DESC="\`HBSAlteredBy\`">hariom</UDF:HBSALTEREDBY>
              </UDF:HBSALTEREDBY.LIST>
              <UDF:HBSALTEREDON.LIST DESC="\`HBSAlteredOn\`" ISLIST="YES" TYPE="String" INDEX="2238">
                <UDF:HBSALTEREDON DESC="\`HBSAlteredOn\`">${moment(searchDate, "DD-MM-YYYY").format("DD-MMM-YY HH:mm")}</UDF:HBSALTEREDON>
              </UDF:HBSALTEREDON.LIST>
              <UDF:HBSALTERATIONINVHISTORY.LIST DESC="\`HBSAlterationInvHistory\`" ISLIST="YES" TYPE="String" INDEX="2239">
                <UDF:HBSALTERATIONINVHISTORY DESC="\`HBSAlterationInvHistory\`">Transfer from SF024 to Rej021</UDF:HBSALTERATIONINVHISTORY>
              </UDF:HBSALTERATIONINVHISTORY.LIST>
              <UDF:HBSREASON.LIST DESC="\`HBSReason\`" ISLIST="YES" TYPE="String" INDEX="2241">
                <UDF:HBSREASON DESC="\`HBSReason\`">.</UDF:HBSREASON>
              </UDF:HBSREASON.LIST>
              <UDF:HBSSTATUS.LIST DESC="\`HBSStatus\`" ISLIST="YES" TYPE="String" INDEX="2545">
                <UDF:HBSSTATUS DESC="\`HBSStatus\`">Created</UDF:HBSSTATUS>
              </UDF:HBSSTATUS.LIST>
            </UDF:HBSHISTORYAGG.LIST>
            <UDF:HBSMOVEDTORECYCLE.LIST DESC="\`HBSMovedToRecycle\`" ISLIST="YES" TYPE="Logical" INDEX="5556">
              <UDF:HBSMOVEDTORECYCLE DESC="\`HBSMovedToRecycle\`">No</UDF:HBSMOVEDTORECYCLE>
            </UDF:HBSMOVEDTORECYCLE.LIST>
            <UDF:VCHMACHINEDATE.LIST DESC="\`VchMachineDate\`" ISLIST="YES" TYPE="Date" INDEX="3828">
              <UDF:VCHMACHINEDATE DESC="\`VchMachineDate\`">${moment(searchDate, "DD-MM-YYYY").format("YYYYMMDD")}</UDF:VCHMACHINEDATE>
            </UDF:VCHMACHINEDATE.LIST>
            <UDF:CHANGEDDATE.LIST DESC="\`ChangedDate\`" ISLIST="YES" TYPE="Date" INDEX="8885">
              <UDF:CHANGEDDATE DESC="\`ChangedDate\`">${moment(searchDate, "DD-MM-YYYY").format("YYYYMMDD")}</UDF:CHANGEDDATE>
            </UDF:CHANGEDDATE.LIST>
            <UDF:HBSENTEREDBY.LIST DESC="\`HBSEnteredBy\`" ISLIST="YES" TYPE="String" INDEX="2235">
              <UDF:HBSENTEREDBY DESC="\`HBSEnteredBy\`">hariom</UDF:HBSENTEREDBY>
            </UDF:HBSENTEREDBY.LIST>
            <UDF:HBSENTEREDON.LIST DESC="\`HBSEnteredOn\`" ISLIST="YES" TYPE="String" INDEX="2236">
              <UDF:HBSENTEREDON DESC="\`HBSEnteredOn\`">${moment(searchDate, "DD-MM-YYYY").format("DD-MMM-YY HH:mm")}</UDF:HBSENTEREDON>
            </UDF:HBSENTEREDON.LIST>
            <UDF:CREATEDBY.LIST DESC="\`Created By\`" ISLIST="YES" TYPE="String" INDEX="8883">
              <UDF:CREATEDBY DESC="\`Created By\`">hariom</UDF:CREATEDBY>
            </UDF:CREATEDBY.LIST>
            <UDF:CHANGEDBY.LIST DESC="\`ChangedBy\`" ISLIST="YES" TYPE="String" INDEX="8884">
              <UDF:CHANGEDBY DESC="\`ChangedBy\`">hariom</UDF:CHANGEDBY>
            </UDF:CHANGEDBY.LIST>
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
                      <NAME>ec615b4b-8ed4-4821-a7aa-d8424c778c25-${helper.randomNumber(99999, 999999)}</NAME>
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

        // Create individual XML file for this transaction
        const transactionFilePath = `./files/xml/${transactionFileName}.xml`;
        const xmlDataWithBackticks = xmlData.replace(/&grave;/g, "`");
        const formattedXML = xmlFormatter(xmlDataWithBackticks);

        // Ensure directory exists before writing file
        const dirPath = transactionFilePath.substring(0, transactionFilePath.lastIndexOf('/'));
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }

        // Write individual XML file
        fs.writeFileSync(transactionFilePath, formattedXML);
        createdFiles.push(transactionFilePath);

        // Emit progress update
        if (notificationId) {
          const progress = Math.round((fileCount / totalTransactions) * 100);
          io.to(uid).emit("download_progress", {
            notificationId: notificationId,
            progress: progress,
            message: `Created XML for transaction ${sanitizedTransactionId} (${fileCount}/${totalTransactions})`
          });
        }
      }

      // Create ZIP file containing all XML files
      const archiver = require('archiver');
      const zipFileName = `SF24-REJ021-${moment(searchDate, "DD-MM-YYYY").format("YYYYMMDD")}`;
      const zipFilePath = `./files/xml/${zipFileName}.zip`;
      
      // Create a file to stream archive data to
      const output = fs.createWriteStream(zipFilePath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // Sets the compression level
      });

      // Listen for all archive data to be written
      await new Promise((resolve, reject) => {
        output.on('close', () => {
          console.log(`ZIP file created successfully: ${archive.pointer()} total bytes`);
          resolve();
        });
        output.on('error', (err) => {
          console.error('Error creating ZIP file:', err);
          reject(err);
        });
        archive.on('error', (err) => {
          console.error('Archive error:', err);
          reject(err);
        });

        // Pipe archive data to the file
        archive.pipe(output);

        // Add all created XML files to ZIP
        createdFiles.forEach(filePath => {
          const fileName = filePath.split('/').pop();
          archive.file(filePath, { name: fileName });
        });

        // Finalize the archive
        archive.finalize();
      });

      // Clean up individual XML files (optional - you can keep them if needed)
      createdFiles.forEach(filePath => {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.log(`Could not delete ${filePath}:`, err.message);
        }
      });

      // Update database with ZIP file information
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
              totalTransactions: totalTransactions,
              createdFiles: createdFiles.length
            }),
          },
          type: otherDB.QueryTypes.UPDATE,
        }
      );
      emit_notifications(notificationId);

      // Send email notification with ZIP file
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
          filename: `${zipFileName}.zip`,
          content: fs.readFileSync(zipFilePath),
        },
      ];
      helper.sendMail(
        userEmail,
        "",
        `${expression} transaction [ZIP File Ready for download] - ${totalTransactions} transactions Ref:${helper.randomNumber(99999, 999999)}`,
        htmlTemplate(user[0].user_name, new Date(), `SF024 to Rej021 XML - ${totalTransactions} transactions`, `${process.env.SOCKET_API_URL}/${zipFilePath}`),
        attachment
      );
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