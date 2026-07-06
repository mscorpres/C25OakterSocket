const moment = require("moment");
const helper = require("../../../helper/helper");

exports.r8xml_code_header = function (data, randcode) {
  return `
    <ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Import Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <IMPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>All Masters</REPORTNAME>
                <STATICVARIABLES>
                    <SVCURRENTCOMPANY>Riot Labz Private Limited - (from 1-Apr-2023)</SVCURRENTCOMPANY>
                </STATICVARIABLES>
            </REQUESTDESC>
            <REQUESTDATA>
                <TALLYMESSAGE xmlns:UDF="TallyUDF">
                    <VOUCHER REMOTEID="d8d94e8c-ad22-40d9-b88e-8e570bac417c-0003bb35-${randcode}"
                        VCHKEY="d8d94e8c-ad22-40d9-b88e-8e570bac417c-0000b0ae:00000008-${randcode}"
                        VCHTYPE="Production" ACTION="Create"
                        OBJVIEW="Multi Consumption Voucher View">
                        <OLDAUDITENTRYIDS.LIST TYPE="Number">
                            <OLDAUDITENTRYIDS>-1</OLDAUDITENTRYIDS>
                        </OLDAUDITENTRYIDS.LIST>
                        <DATE>${moment(data.date).format("YYYYMMDD")}</DATE>
                        <REFERENCEDATE>${moment(data.date).format("YYYYMMDD")}</REFERENCEDATE>
                        <VCHSTATUSDATE>${moment(data.date).format("YYYYMMDD")}</VCHSTATUSDATE>
                        <GUID>d8d94e8c-ad22-40d9-b88e-8e570bac417c-0003bb35-${randcode}</GUID>
                        <NARRATION>${data.comment}</NARRATION>
                        <ENTEREDBY>${data.user}</ENTEREDBY>
                        <OBJECTUPDATEACTION>Create</OBJECTUPDATEACTION>
                        <GSTREGISTRATION>&#4; Not Applicable</GSTREGISTRATION>
                        <VOUCHERTYPENAME>Production</VOUCHERTYPENAME>
                        <VOUCHERNUMBER>${data.mfg_id}</VOUCHERNUMBER>
                        <REFERENCE>${data.mfg_id}</REFERENCE>
                        <NUMBERINGSTYLE>Automatic (Manual Override)</NUMBERINGSTYLE>
                        <CSTFORMISSUETYPE>&#4; Not Applicable</CSTFORMISSUETYPE>
                        <CSTFORMRECVTYPE>&#4; Not Applicable</CSTFORMRECVTYPE>
                        <PERSISTEDVIEW>Multi Consumption Voucher View</PERSISTEDVIEW>
                        <VCHSTATUSTAXADJUSTMENT>Default</VCHSTATUSTAXADJUSTMENT>
                        <VCHSTATUSVOUCHERTYPE>Production</VCHSTATUSVOUCHERTYPE>
                        <VCHGSTCLASS>&#4; Not Applicable</VCHGSTCLASS>
                        <VCHENTRYMODE>Use for Manufacturing Journal</VCHENTRYMODE>
                        <DESTINATIONGODOWN>GDFG001</DESTINATIONGODOWN>
                        <VOUCHERDESTINATIONGODOWN>GDFG001</VOUCHERDESTINATIONGODOWN>
                        <VOUCHERSOURCEGODOWN>${data.VOUCHERSOURCEGODOWN}</VOUCHERSOURCEGODOWN>
                        <DIFFACTUALQTY>No</DIFFACTUALQTY>
                        <ISMSTFROMSYNC>No</ISMSTFROMSYNC>
                        <ISDELETED>No</ISDELETED>
                        <ISSECURITYONWHENENTERED>Yes</ISSECURITYONWHENENTERED>
                        <ASORIGINAL>No</ASORIGINAL>
                        <AUDITED>No</AUDITED>
                        <ISCOMMONPARTY>No</ISCOMMONPARTY>
                        <FORJOBCOSTING>Yes</FORJOBCOSTING>
                        <ISOPTIONAL>No</ISOPTIONAL>
                        <EFFECTIVEDATE>${moment(data.date).format("YYYYMMDD")}</EFFECTIVEDATE>
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
                        <ALTERID> 410234</ALTERID>
                        <MASTERID> 244533</MASTERID>
                        <VOUCHERKEY>194261370798088</VOUCHERKEY>
                        <VOUCHERRETAINKEY>8073</VOUCHERRETAINKEY>
                        <VOUCHERNUMBERSERIES>Default</VOUCHERNUMBERSERIES>
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

                        <INVENTORYENTRIESIN.LIST>
                            <STOCKITEMNAME>${data.skucode}</STOCKITEMNAME>
                            <BOMNAME></BOMNAME>
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
                            <RATE></RATE>
                            <AMOUNT></AMOUNT>
                            <ACTUALQTY>${data.mfg_qty}</ACTUALQTY>
                            <BILLEDQTY>${data.mfg_qty}</BILLEDQTY>
                            <BATCHALLOCATIONS.LIST>
                                <GODOWNNAME>GDFG001_Alwar</GODOWNNAME>
                                <BATCHNAME>Primary Batch</BATCHNAME>
                                <INDENTNO>&#4; Not Applicable</INDENTNO>
                                <ORDERNO>&#4; Not Applicable</ORDERNO>
                                <TRACKINGNUMBER>&#4; Not Applicable</TRACKINGNUMBER>
                                <DYNAMICCSTISCLEARED>No</DYNAMICCSTISCLEARED>
                                <AMOUNT></AMOUNT>
                                <ACTUALQTY>${data.mfg_qty}</ACTUALQTY>
                                <BILLEDQTY>${data.mfg_qty}</BILLEDQTY>
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
                        </INVENTORYENTRIESIN.LIST>
    `;
}

exports.r8xml_code_body = function (data, randcode) { return `
<INVENTORYENTRIESOUT.LIST>
    <STOCKITEMNAME>${data.partcode}</STOCKITEMNAME>
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
    <RATE>${data.lastrate}</RATE>
    <AMOUNT>${helper.number(helper.number(data.cons_qty) * helper.number(data.lastrate))}</AMOUNT>
    <ACTUALQTY> ${helper.number(data.cons_qty)}</ACTUALQTY>
    <BILLEDQTY> ${helper.number(data.cons_qty)}</BILLEDQTY>
    <BATCHALLOCATIONS.LIST>
        <GODOWNNAME>${data.GODOWNNAME}</GODOWNNAME>
        <BATCHNAME>Primary Batch</BATCHNAME>
        <DESTINATIONGODOWNNAME>${data.GODOWNNAME}</DESTINATIONGODOWNNAME>
        <INDENTNO>&#4; Not Applicable</INDENTNO>
        <ORDERNO>&#4; Not Applicable</ORDERNO>
        <TRACKINGNUMBER>&#4; Not Applicable</TRACKINGNUMBER>
        <DYNAMICCSTISCLEARED>No</DYNAMICCSTISCLEARED>
        <AMOUNT>${helper.number(helper.number(data.cons_qty) * helper.number(data.lastrate))}</AMOUNT>
        <ACTUALQTY> ${helper.number(data.cons_qty)}</ACTUALQTY>
        <BILLEDQTY> ${helper.number(data.cons_qty)}</BILLEDQTY>
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
</INVENTORYENTRIESOUT.LIST>
`; }


exports.r8xml_code_footer = function () {
  return `
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
}