const moment = require("moment");
const helper = require("../../../helper/helper");
exports.xml_ven_code = function (data, randomNumber) {
  const header = `<ENVELOPE>
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
                    <VOUCHER REMOTEID="d8d94e8c-ad22-40d9-b88e-8e570bac417c-${randomNumber}" VCHKEY="d8d94e8c-ad22-40d9-b88e-8e570bac417c-0000b1a0:000001c0" VCHTYPE="Consumption - M3S" ACTION="Create" OBJVIEW="Consumption Voucher View">
                        <OLDAUDITENTRYIDS.LIST TYPE="Number">
                            <OLDAUDITENTRYIDS>-1</OLDAUDITENTRYIDS>
                        </OLDAUDITENTRYIDS.LIST>
                        <ALTEREDON>20240711</ALTEREDON>
                        <DATE>${moment(data[0].doc_date, "YYYY-MM-DD").format("YYYYMMDD")}</DATE>
                        <VCHSTATUSDATE>${moment(data[0].doc_date, "YYYY-MM-DD").format("YYYYMMDD")}</VCHSTATUSDATE>
                        <GUID>d8d94e8c-ad22-40d9-b88e-8e570bac417c-${randomNumber}</GUID>
                        <ENTEREDBY>${data[0].create_by}</ENTEREDBY>
                        <OBJECTUPDATEACTION>Alter</OBJECTUPDATEACTION>
                        <GSTREGISTRATION>&#4; Not Applicable</GSTREGISTRATION>
                        <VOUCHERTYPENAME>Consumption - M3S</VOUCHERTYPENAME>
                        <VOUCHERNUMBER>${moment(data[0].doc_date, "YYYY-MM-DD").format("YYYYMMDD")}-${helper.randomNumber(99, 999)}</VOUCHERNUMBER>
                        <NUMBERINGSTYLE>Automatic (Manual Override)</NUMBERINGSTYLE>
                        <CSTFORMISSUETYPE>&#4; Not Applicable</CSTFORMISSUETYPE>
                        <CSTFORMRECVTYPE>&#4; Not Applicable</CSTFORMRECVTYPE>
                        <FBTPAYMENTTYPE>Default</FBTPAYMENTTYPE>
                        <PERSISTEDVIEW>Consumption Voucher View</PERSISTEDVIEW>
                        <VCHSTATUSTAXADJUSTMENT>Default</VCHSTATUSTAXADJUSTMENT>
                        <VCHSTATUSVOUCHERTYPE>Consumption - M3S</VCHSTATUSVOUCHERTYPE>
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
                        <EFFECTIVEDATE>${moment(data[0].doc_date, "YYYY-MM-DD").format("YYYYMMDD")}</EFFECTIVEDATE>
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
                        <ALTERID> 499634</ALTERID>
                        <MASTERID> 282379</MASTERID>
                        <VOUCHERKEY>195300752884160</VOUCHERKEY>
                        <VOUCHERRETAINKEY>189</VOUCHERRETAINKEY>
                        <VOUCHERNUMBERSERIES>Default</VOUCHERNUMBERSERIES>
                        <UPDATEDDATETIME>20240711142905000</UPDATEDDATETIME>
                        <EWAYBILLDETAILS.LIST>      </EWAYBILLDETAILS.LIST>
                        <EXCLUDEDTAXATIONS.LIST>      </EXCLUDEDTAXATIONS.LIST>
                        <OLDAUDITENTRIES.LIST>      </OLDAUDITENTRIES.LIST>
                        <ACCOUNTAUDITENTRIES.LIST>      </ACCOUNTAUDITENTRIES.LIST>
                        <AUDITENTRIES.LIST>      </AUDITENTRIES.LIST>
                        <DUTYHEADDETAILS.LIST>      </DUTYHEADDETAILS.LIST>
                        <GSTADVADJDETAILS.LIST>      </GSTADVADJDETAILS.LIST>
                        <CONTRITRANS.LIST>      </CONTRITRANS.LIST>
                        <EWAYBILLERRORLIST.LIST>      </EWAYBILLERRORLIST.LIST>
                        <IRNERRORLIST.LIST>      </IRNERRORLIST.LIST>
                        <HARYANAVAT.LIST>      </HARYANAVAT.LIST>
                        <SUPPLEMENTARYDUTYHEADDETAILS.LIST>      </SUPPLEMENTARYDUTYHEADDETAILS.LIST>
                        <INVOICEDELNOTES.LIST>      </INVOICEDELNOTES.LIST>
                        <INVOICEORDERLIST.LIST>      </INVOICEORDERLIST.LIST>
                        <INVOICEINDENTLIST.LIST>      </INVOICEINDENTLIST.LIST>
                        <ATTENDANCEENTRIES.LIST>      </ATTENDANCEENTRIES.LIST>
                        <ORIGINVOICEDETAILS.LIST>      </ORIGINVOICEDETAILS.LIST>
                        <INVOICEEXPORTLIST.LIST>      </INVOICEEXPORTLIST.LIST>
                        <INVENTORYENTRIESIN.LIST>      </INVENTORYENTRIESIN.LIST>`;

  let body = "";
  data.map((item) => {
    body += ` <INVENTORYENTRIESOUT.LIST>
                            <STOCKITEMNAME>${item.part_no}</STOCKITEMNAME>
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
                            <RATE>${item.rate}</RATE>
                            <AMOUNT>${item.rate * item.qty}</AMOUNT>
                            <ACTUALQTY> ${item.qty}</ACTUALQTY>
                            <BILLEDQTY> ${item.qty}</BILLEDQTY>
                            <BATCHALLOCATIONS.LIST>
                                <GODOWNNAME>GDJW050_M3S Mobility</GODOWNNAME>
                                <BATCHNAME>Primary Batch</BATCHNAME>
                                <INDENTNO>&#4; Not Applicable</INDENTNO>
                                <ORDERNO>&#4; Not Applicable</ORDERNO>
                                <TRACKINGNUMBER>&#4; Not Applicable</TRACKINGNUMBER>
                                <DYNAMICCSTISCLEARED>No</DYNAMICCSTISCLEARED>
                                <AMOUNT>${item.rate * item.qty}</AMOUNT>
                                <ACTUALQTY> ${item.qty}</ACTUALQTY>
                                <BILLEDQTY> ${item.qty}</BILLEDQTY>
                                <ADDITIONALDETAILS.LIST>        </ADDITIONALDETAILS.LIST>
                                <VOUCHERCOMPONENTLIST.LIST>        </VOUCHERCOMPONENTLIST.LIST>
                            </BATCHALLOCATIONS.LIST>
                            <DUTYHEADDETAILS.LIST>       </DUTYHEADDETAILS.LIST>
                            <RATEDETAILS.LIST>       </RATEDETAILS.LIST>
                            <SUPPLEMENTARYDUTYHEADDETAILS.LIST>       </SUPPLEMENTARYDUTYHEADDETAILS.LIST>
                            <TAXOBJECTALLOCATIONS.LIST>       </TAXOBJECTALLOCATIONS.LIST>
                            <COSTTRACKALLOCATIONS.LIST>       </COSTTRACKALLOCATIONS.LIST>
                            <REFVOUCHERDETAILS.LIST>       </REFVOUCHERDETAILS.LIST>
                            <EXCISEALLOCATIONS.LIST>       </EXCISEALLOCATIONS.LIST>
                            <EXPENSEALLOCATIONS.LIST>       </EXPENSEALLOCATIONS.LIST>
                        </INVENTORYENTRIESOUT.LIST>
        `;
  });

  const footer = `<GST.LIST>      </GST.LIST>
                        <STKJRNLADDLCOSTDETAILS.LIST>      </STKJRNLADDLCOSTDETAILS.LIST>
                        <PAYROLLMODEOFPAYMENT.LIST>      </PAYROLLMODEOFPAYMENT.LIST>
                        <ATTDRECORDS.LIST>      </ATTDRECORDS.LIST>
                        <GSTEWAYCONSIGNORADDRESS.LIST>      </GSTEWAYCONSIGNORADDRESS.LIST>
                        <GSTEWAYCONSIGNEEADDRESS.LIST>      </GSTEWAYCONSIGNEEADDRESS.LIST>
                        <TEMPGSTRATEDETAILS.LIST>      </TEMPGSTRATEDETAILS.LIST>
                        <TEMPGSTADVADJUSTED.LIST>      </TEMPGSTADVADJUSTED.LIST>
                        <UDF:HBSHISTORYAGG.LIST DESC="HBSHistoryAgg" INDEX="2211">
                            <UDF:HBSALTEREDBY.LIST DESC="HBSAlteredBy" ISLIST="YES" TYPE="String" INDEX="2237">
                                <UDF:HBSALTEREDBY DESC="HBSAlteredBy">Mahendra</UDF:HBSALTEREDBY>
                            </UDF:HBSALTEREDBY.LIST>
                            <UDF:HBSALTEREDON.LIST DESC="HBSAlteredOn" ISLIST="YES" TYPE="String" INDEX="2238">
                                <UDF:HBSALTEREDON DESC="HBSAlteredOn">11-Jul-24 14:28</UDF:HBSALTEREDON>
                            </UDF:HBSALTEREDON.LIST>
                            <UDF:HBSALTERATIONINVHISTORY.LIST DESC="HBSAlterationInvHistory" ISLIST="YES" TYPE="String" INDEX="2239">
                                <UDF:HBSALTERATIONINVHISTORY DESC="HBSAlterationInvHistory">Paytm Refurb Device At M3S :- 30,260.00 Nos @ 104.00/Nos = 31,47,040.00, Paytm Refurb Device At M3S :- 1,32,050.00 Nos @ 104.00/Nos = 1,37,33,200.00</UDF:HBSALTERATIONINVHISTORY>
                            </UDF:HBSALTERATIONINVHISTORY.LIST>
                            <UDF:HBSREASON.LIST DESC="HBSReason" ISLIST="YES" TYPE="String" INDEX="2241">
                                <UDF:HBSREASON DESC="HBSReason">.</UDF:HBSREASON>
                            </UDF:HBSREASON.LIST>
                            <UDF:HBSSTATUS.LIST DESC="HBSStatus" ISLIST="YES" TYPE="String" INDEX="2545">
                                <UDF:HBSSTATUS DESC="HBSStatus">Altered</UDF:HBSSTATUS>
                            </UDF:HBSSTATUS.LIST>
                        </UDF:HBSHISTORYAGG.LIST>
                        <UDF:VCHMACHINEDATE.LIST DESC="VchMachineDate" ISLIST="YES" TYPE="Date" INDEX="3828">
                            <UDF:VCHMACHINEDATE DESC="VchMachineDate">20240711</UDF:VCHMACHINEDATE>
                        </UDF:VCHMACHINEDATE.LIST>
                        <UDF:CHANGEDDATE.LIST DESC="ChangedDate" ISLIST="YES" TYPE="Date" INDEX="8885">
                            <UDF:CHANGEDDATE DESC="ChangedDate">20240711</UDF:CHANGEDDATE>
                        </UDF:CHANGEDDATE.LIST>
                        <UDF:HBSENTEREDBY.LIST DESC="HBSEnteredBy" ISLIST="YES" TYPE="String" INDEX="2235">
                            <UDF:HBSENTEREDBY DESC="HBSEnteredBy">${data[0].create_by}</UDF:HBSENTEREDBY>
                        </UDF:HBSENTEREDBY.LIST>
                        <UDF:HBSENTEREDON.LIST DESC="HBSEnteredOn" ISLIST="YES" TYPE="String" INDEX="2236">
                            <UDF:HBSENTEREDON DESC="HBSEnteredOn">10-Jul-24 18:01</UDF:HBSENTEREDON>
                        </UDF:HBSENTEREDON.LIST>
                        <UDF:HBSCREATIONINVHISTORY.LIST DESC="HBSCreationInvHistory" ISLIST="YES" TYPE="String" INDEX="2240">
                            <UDF:HBSCREATIONINVHISTORY DESC="HBSCreationInvHistory">Paytm Refurb Device At M3S :- 23,520.00 Nos @ 104.00/Nos = 24,46,080.00, Paytm Refurb Device At M3S :- 30,260.00 Nos @ 104.00/Nos = 31,47,040.00, Paytm Refurb Device At M3S :- 1,32,050.00 Nos @ 23.10/Nos = 30,50,637.00</UDF:HBSCREATIONINVHISTORY>
                        </UDF:HBSCREATIONINVHISTORY.LIST>
                        <UDF:CREATEDBY.LIST DESC="Created By" ISLIST="YES" TYPE="String" INDEX="8883">
                            <UDF:CREATEDBY DESC="Created By">${data[0].create_by}</UDF:CREATEDBY>
                        </UDF:CREATEDBY.LIST>
                        <UDF:CHANGEDBY.LIST DESC="ChangedBy" ISLIST="YES" TYPE="String" INDEX="8884">
                            <UDF:CHANGEDBY DESC="ChangedBy">Mahendra</UDF:CHANGEDBY>
                        </UDF:CHANGEDBY.LIST>
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
</ENVELOPE>`;

  return header + body + footer;
};
