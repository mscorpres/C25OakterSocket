const moment = require("moment");
const xlsx = require("xlsx");
const { invtDB, otherDB } = require("../../config/db/connection")

const helper = require("../../helper/helper");
const jwt = require("jsonwebtoken");
const Validator = require("validatorjs");
const fs = require("fs");

function byDate(a, b) {
  let d1 = new Date(moment(a.DATE, "DD-MM-YYYY"));
  let d2 = new Date(moment(b.DATE, "DD-MM-YYYY"));
  return d2 - d1;
}

async function fetchHsnCodes(componentIds) {
  const hsnMap = new Map();
  if (!componentIds.length) return hsnMap;

  const rows = await invtDB.query(
    `SELECT r.components_id, r.in_hsn_code
     FROM rm_location r
     INNER JOIN (
       SELECT components_id, MAX(ID) AS max_id
       FROM rm_location
       WHERE components_id IN (:componentIds)
         AND in_hsn_code != '--'
         AND in_hsn_code != ''
       GROUP BY components_id
     ) latest ON r.ID = latest.max_id`,
    {
      replacements: { componentIds },
      type: invtDB.QueryTypes.SELECT,
    },
  );

  rows.forEach((r) => hsnMap.set(r.components_id, r.in_hsn_code));
  return hsnMap;
}

async function fetchRequestedBy(pairs) {
  const requestMap = new Map();
  if (!pairs.length) return requestMap;

  const rows = await invtDB.query(
    `SELECT mr.approval_transaction, mr.components_key, al.user_name
     FROM material_request mr
     LEFT JOIN admin_login al ON al.CustID = mr.inserted_by
     WHERE (mr.approval_transaction, mr.components_key) IN (
       ${pairs.map(() => "(?, ?)").join(",")}
     )`,
    {
      replacements: pairs.flatMap((p) => [
        p.out_transaction_id,
        p.components_id,
      ]),
      type: invtDB.QueryTypes.SELECT,
    },
  );

  rows.forEach((r) => {
    requestMap.set(`${r.approval_transaction}_${r.components_key}`, r.user_name);
  });
  return requestMap;
}

exports.tran_out = async (
  date,
  uid,
  emit_notifications,
  notificationId,
  socket,
  io,
  branch,
) => {
  const validation = new Validator({ date: date }, { date: "required" });

  if (validation.fails()) {
    return { code: 500, msg: "Please Select Date" };
  }

  let req_date = date;
  let token_res = await verifyToken(`${socket.handshake.auth.token}`);
  let user_id = token_res.crn_id;

  try {
    const dateMatch = date.match(/([0-9]{2}-[0-9]{2}-[0-9]{4})/g);
    if (!dateMatch || dateMatch.length !== 2) {
      return { code: 500, msg: "Invalid Date Format" };
    }

    const date1 = moment(dateMatch[0], "DD-MM-YYYY").format("YYYY-MM-DD");
    const date2 = moment(dateMatch[1], "DD-MM-YYYY").format("YYYY-MM-DD");

    io.to(user_id).emit("download_start_detail", {
      title: "Transaction OUT",
      details: dateMatch,
      notificationId: notificationId,
      status: "pending",
      detailStatus: true,
      total: false,
      type: "file",
    });

    const finalResult = await invtDB.query(
      `SELECT
         rl.ID,
         rl.qty,
         rl.in_po_rate,
         rl.components_id,
         rl.in_vendor_name,
         rl.out_transaction_id,
         rl.jw_transaction_id,
         rl.jw_challan_id,
         rl.any_remark,
         rl.rejection_any_remark,
         rl.insert_date,
         c.c_name,
         c.c_part_no,
         c.c_new_part_no,
         u.units_name,
         lm_in.loc_name AS loc_in_name,
         lm_out.loc_name AS loc_out_name,
         al.user_name,
         vb.ven_name
       FROM rm_location rl
       LEFT JOIN components c ON rl.components_id = c.component_key
       LEFT JOIN units u ON c.c_uom = u.units_id
       LEFT JOIN location_main lm_in ON rl.loc_in = lm_in.location_key
       LEFT JOIN location_main lm_out ON rl.loc_out = lm_out.location_key
       LEFT JOIN admin_login al ON rl.insert_by = al.CustID
       LEFT JOIN ven_basic_detail vb ON vb.ven_register_id = rl.in_vendor_name
       WHERE c.c_type = 'R'
         AND c.c_is_enabled = 'Y'
         AND DATE_FORMAT(rl.insert_date, '%Y-%m-%d') BETWEEN :date1 AND :date2
         AND rl.trans_type IN ('ISSUE', 'JOBWORK', 'CONSUMPTION')
         AND (
               rl.trans_type <> 'TRANSFER'
               OR rl.trans_mode = 'return'
             )
         AND (
               rl.trans_type <> 'CONSUMPTION'
               OR (
                    rl.jw_transaction_id != '--'
                    AND rl.trans_mode = 'default'
                  )
             )
       ORDER BY rl.insert_date DESC`,
      {
        replacements: { date1: date1, date2: date2, branch: branch },
        type: invtDB.QueryTypes.SELECT,
      },
    );

    if (finalResult.length == 0) {
      return { code: 500, message: "Transaction not found", status: "error" };
    }

    const componentIds = [
      ...new Set(finalResult.map((r) => r.components_id).filter(Boolean)),
    ];

    const requestPairs = [
      ...new Map(
        finalResult
          .filter(
            (r) =>
              r.out_transaction_id !== "" &&
              r.out_transaction_id !== "--" &&
              r.out_transaction_id != null,
          )
          .map((r) => [
            `${r.out_transaction_id}_${r.components_id}`,
            {
              out_transaction_id: r.out_transaction_id,
              components_id: r.components_id,
            },
          ]),
      ).values(),
    ];

    const [hsnMap, requestMap] = await Promise.all([
      fetchHsnCodes(componentIds),
      fetchRequestedBy(requestPairs),
    ]);

    const result = finalResult.map((item) => {
      const vendor =
        item.in_vendor_name === "--"
          ? "--"
          : `${item.ven_name} / ${item.in_vendor_name}`;

      return {
        DATE: moment(item.insert_date).format("DD-MM-YYYY"),
        COMPONENT: item.c_name,
        PART: item.c_part_no,
        CAT_PART_CODE: item.c_new_part_no,
        HSN: hsnMap.get(item.components_id) ?? "--",
        FROMLOCATION: item.loc_out_name ?? "--",
        TOLOCATION: item.loc_in_name ?? "--",
        OUTQTY: `${item.qty}`,
        UNIT: item.units_name,
        RATE: item.in_po_rate ?? "--",
        TRANSACTION: item.out_transaction_id,
        VENDOR: vendor,
        JWORDER_CHALLANNO: `${item.jw_challan_id} / ${item.jw_transaction_id}`,
        REQUESTED_BY:
          requestMap.get(`${item.out_transaction_id}_${item.components_id}`) ||
          "--",
        ADDED_BY: item.user_name,
        COMMENT:
          item.any_remark == null ? item.rejection_any_remark : item.any_remark,
      };
    });

    result.sort(byDate);

    const worksheet = xlsx.utils.json_to_sheet(result);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Transaction OUT");

    let randKey = Math.floor(Math.random() * (999 - 100 + 1)) + 100;
    let fileGenarateName = "./files/excel/TRANOUT" + randKey + ".xlsx";

    xlsx.writeFile(workbook, fileGenarateName);

    await otherDB.query(
      "UPDATE `user_files_req` SET `status` = 'complete', `other_data` = :other WHERE `user_id`= :uid AND `req_code` = 'TRANOUT' AND req_date = :req_date",
      {
        replacements: {
          uid: uid,
          req_date: req_date,
          other: JSON.stringify({
            fileName: `TRANOUT${randKey}.xlsx`,
            fileUrl: fileGenarateName,
          }),
        },
        type: otherDB.QueryTypes.UPDATE,
      },
    );

    emit_notifications(notificationId);

    // SEND USER MAIL
    let user = await invtDB.query(
      "SELECT `Email_ID`,`user_name` from `admin_login` WHERE `CustID`= :CustID",
      {
        replacements: { CustID: uid },
        type: invtDB.QueryTypes.SELECT,
      },
    );
    let userEmail = user[0].Email_ID;
    let attachment = [
      {
        filename: "TRANSACTION OUT REPORT",
        content: fs.readFileSync(fileGenarateName),
      },
    ];
    await helper.sendMail(
      userEmail,
      "",
      "TRANSACTION OUT REPORT [File Ready for download] Ref:" +
        helper.randomNumber(99999, 999999),
      "Trans OUT",
      attachment,
    );
    //END MAIL

    return { code: 200, message: "File Generated Successfully" };
  } catch (err) {
    console.error("Error in tran_out:", err);
    await otherDB.query(
      "UPDATE `user_files_req` SET `status` = 'failed' WHERE `reactNotificationId`= :uid AND `req_code` = 'TRANOUT' AND req_date = :req_date",
      {
        replacements: {
          uid: notificationId,
          req_date: req_date,
        },
        type: otherDB.QueryTypes.UPDATE,
      },
    );
    emit_notifications(notificationId);
    return { code: 500, msg: err.message || "Report generation failed" };
  }
};

function verifyToken(token) {
  return new Promise((resolve, reject) => {
    if (!token) {
      return reject(new Error("No token provided"));
    }

    let cleanToken = token.startsWith("Bearer ") ? token.slice(7) : token;

    jwt.verify(cleanToken, process.env.TOKEN_SECRET, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded);
      }
    });
  });
}
