const moment = require("moment");

exports.xml_rm_jw_header = function (data, randcode) {
  return `
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
                    <VOUCHER REMOTEID="d8d94e8c-ad22-40d9-b88e-8e570bac417c-${randcode}"
                        VCHKEY="d8d94e8c-ad22-40d9-b88e-8e570bac417c-0000b0a8:${randcode}"
                        VCHTYPE="InterGodownTrfr" ACTION="Create" OBJVIEW="Consumption Voucher View">
                        <OLDAUDITENTRYIDS.LIST TYPE="Number">
                            <OLDAUDITENTRYIDS>-1</OLDAUDITENTRYIDS>
                        </OLDAUDITENTRYIDS.LIST>
                        <DATE>${moment(data.challan_insert_dt).format("YYYYMMDD")}</DATE>
                        <VCHSTATUSDATE>${moment(data.challan_insert_dt).format("YYYYMMDD")}</VCHSTATUSDATE>
                        <GUID>d8d94e8c-ad22-40d9-b88e-8e570bac417c-${randcode}</GUID>
                        <NARRATION>${data.any_remark !== undefined ? data.any_remark : "N/A"}</NARRATION>
                        <ENTEREDBY>sachin.koli</ENTEREDBY>
                        <OBJECTUPDATEACTION>Create</OBJECTUPDATEACTION>
                        <CLASSNAME>InterGodown</CLASSNAME>
                        <GSTREGISTRATION>&#4; Not Applicable</GSTREGISTRATION>
                        <VOUCHERTYPENAME>InterGodownTrfr</VOUCHERTYPENAME>
                        <VOUCHERNUMBER>${data.challan_no}</VOUCHERNUMBER>
                        <NUMBERINGSTYLE>Automatic (Manual Override)</NUMBERINGSTYLE>
                        <CSTFORMISSUETYPE>&#4; Not Applicable</CSTFORMISSUETYPE>
                        <CSTFORMRECVTYPE>&#4; Not Applicable</CSTFORMRECVTYPE>
                        <FBTPAYMENTTYPE>Default</FBTPAYMENTTYPE>
                        <PERSISTEDVIEW>Consumption Voucher View</PERSISTEDVIEW>
                        <VCHSTATUSTAXADJUSTMENT>Default</VCHSTATUSTAXADJUSTMENT>
                        <VCHSTATUSVOUCHERTYPE>InterGodownTrfr</VCHSTATUSVOUCHERTYPE>
                        <VCHGSTCLASS>&#4; Not Applicable</VCHGSTCLASS>
                        <DESTINATIONGODOWN>${data.vendorGodown}</DESTINATIONGODOWN>
                        <DIFFACTUALQTY>No</DIFFACTUALQTY>
                        <ISMSTFROMSYNC>No</ISMSTFROMSYNC>
                        <ISDELETED>No</ISDELETED>
                        <ISSECURITYONWHENENTERED>Yes</ISSECURITYONWHENENTERED>
                        <ASORIGINAL>No</ASORIGINAL>
                        <AUDITED>No</AUDITED>
                        <ISCOMMONPARTY>No</ISCOMMONPARTY>
                        <FORJOBCOSTING>No</FORJOBCOSTING>
                        <ISOPTIONAL>No</ISOPTIONAL>
                        <EFFECTIVEDATE>${moment(data.challan_insert_dt).format("YYYYMMDD")}</EFFECTIVEDATE>
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
                        <ALTERID> 410186</ALTERID>
                        <MASTERID> 244519</MASTERID>
                        <VOUCHERKEY>194235600994400</VOUCHERKEY>
                        <VOUCHERRETAINKEY>4181</VOUCHERRETAINKEY>
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
	`;
};

exports.xml_rm_jw_footer = function (data, randcode) {
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
                            <NAME>ec615b4b-8ed4-4821-a7aa-d8424c778c25</NAME>
                            <REMOTECMPNAME>Riot Invoice Sync</REMOTECMPNAME>
                            <REMOTECMPSTATE>Uttar Pradesh</REMOTECMPSTATE>
                        </REMOTECMPINFO.LIST>
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
};
