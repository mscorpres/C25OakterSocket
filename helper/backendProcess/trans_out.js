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

exports.tran_out = async (date, uid, emit_notifications, notificationId, socket, io, branch) => {
  const validation = new Validator({ date }, { date: "required" });

  if (validation.fails()) {
    return { code: 500, msg: "Please Select Date" };
  }

  const token_res = await verifyToken(`${socket.handshake.auth.token}`);
  const user_id = token_res.crn_id;
  const req_date = date;

  try {
    // Works for "12-07-2026-09-10-2026" and "12-07-2026 - 09-10-2026"
    const dateMatch = date.match(/\d{2}-\d{2}-\d{4}/g);
    if (!dateMatch || dateMatch.length !== 2) {
      return { code: 500, msg: "Invalid Date Format" };
    }

    const date1 = moment(dateMatch[0], "DD-MM-YYYY").format("YYYY-MM-DD");
    const date2 = moment(dateMatch[1], "DD-MM-YYYY").format("YYYY-MM-DD");

    io.to(user_id).emit("download_start_detail", {
      title: "Transaction OUT",
      details: dateMatch,
      notificationId,
      status: "pending",
      detailStatus: true,
      total: false,
      type: "file",
    });

    // ---------- MAIN QUERY ----------
    const finalResult = await invtDB.query(
      `
      SELECT
        c.c_name,
        c.c_part_no,
        c.c_new_part_no,
        u.units_name,
        lm.loc_name,
        loc2.loc_name AS loc_out,
        al.user_name,
        rl.insert_date,
        rl.trans_type,
        rl.trans_mode,
        rl.components_id,
        rl.in_vendor_name,
        rl.out_transaction_id,
        rl.jw_transaction_id,
        rl.jw_challan_id,
        rl.qty,
        rl.in_po_rate,
        rl.any_remark,
        rl.rejection_any_remark,
        rl.in_hsn_code,
        vb.ven_name,
        vb.ven_register_id
      FROM rm_location rl
      LEFT JOIN components c ON rl.components_id = c.component_key
      LEFT JOIN units u ON c.c_uom = u.units_id
      LEFT JOIN location_main lm ON rl.loc_in = lm.location_key
      LEFT JOIN location_main loc2 ON rl.loc_out = loc2.location_key
      LEFT JOIN admin_login al ON rl.insert_by = al.CustID
      LEFT JOIN ven_basic_detail vb ON vb.ven_register_id = rl.in_vendor_name
      WHERE
        c.c_type = 'R'
        AND c.c_is_enabled = 'Y'
        AND rl.company_branch = :branch
        AND DATE_FORMAT(rl.insert_date, '%Y-%m-%d') BETWEEN :date1 AND :date2
        AND rl.trans_type IN ('ISSUE','JOBWORK','CONSUMPTION')
        AND (rl.trans_type <> 'TRANSFER' OR rl.trans_mode = 'return')
        AND (
              rl.trans_type <> 'CONSUMPTION'
              OR (rl.jw_transaction_id != '--' AND rl.trans_mode = 'default')
            )
      ORDER BY rl.insert_date DESC
      `,
      {
        replacements: { date1, date2, branch },
        type: invtDB.QueryTypes.SELECT,
      }
    );

    if (!finalResult.length) {
      return { code: 500, message: "Transaction not found", status: "error" };
    }

    const isValid = (v) => v !== null && v !== undefined && v !== "" && v !== "--";

    // ---------- 1) LATEST HSN PER COMPONENT (replaces stmt3) ----------
    const componentIds = [...new Set(finalResult.map((r) => r.components_id))];
    const hsnMap = new Map();

    if (componentIds.length) {
      const hsnRows = await invtDB.query(
        `
        SELECT r.components_id, r.in_hsn_code
        FROM rm_location r
        INNER JOIN (
          SELECT components_id, MAX(ID) AS max_id
          FROM rm_location
          WHERE components_id IN (:ids)
            AND in_hsn_code != '--'
            AND in_hsn_code != ''
          GROUP BY components_id
        ) m ON r.ID = m.max_id
        `,
        { replacements: { ids: componentIds }, type: invtDB.QueryTypes.SELECT }
      );
      hsnRows.forEach((r) => hsnMap.set(String(r.components_id), r.in_hsn_code));
    }

    // ---------- 2) LATEST INWARD RATE PER COMPONENT (replaces stmt4) ----------
    // Only needed for rows without a valid jw_transaction_id
    const rateComponentIds = [
      ...new Set(
        finalResult
          .filter((r) => !isValid(r.jw_transaction_id))
          .map((r) => r.components_id)
      ),
    ];
    const rateMap = new Map();

    if (rateComponentIds.length) {
      const rateRows = await invtDB.query(
        `
        SELECT r.components_id, r.in_po_rate
        FROM rm_location r
        INNER JOIN (
          SELECT components_id, MAX(ID) AS max_id
          FROM rm_location
          WHERE components_id IN (:ids)
            AND in_po_rate != '--'
            AND in_po_rate != ''
            AND trans_type = 'INWARD'
            AND company_branch = :branch
          GROUP BY components_id
        ) m ON r.ID = m.max_id
        `,
        {
          replacements: { ids: rateComponentIds, branch },
          type: invtDB.QueryTypes.SELECT,
        }
      );
      rateRows.forEach((r) => rateMap.set(String(r.components_id), r.in_po_rate));
    }

    // ---------- 3) REQUESTED BY (replaces stmt6) ----------
    const uniquePairs = [
      ...new Map(
        finalResult
          .filter((r) => isValid(r.out_transaction_id))
          .map((r) => [
            `${r.out_transaction_id}_${r.components_id}`,
            { out_transaction_id: r.out_transaction_id, components_id: r.components_id },
          ])
      ).values(),
    ];

    const requestMap = new Map();

    if (uniquePairs.length) {
      const requestData = await invtDB.query(
        `
        SELECT mr.approval_transaction, mr.components_key, al.user_name AS requested_by_user
        FROM material_request mr
        LEFT JOIN admin_login al ON al.CustID = mr.inserted_by
        WHERE (mr.approval_transaction, mr.components_key) IN (
          ${uniquePairs.map(() => "(?, ?)").join(",")}
        )
        `,
        {
          replacements: uniquePairs.flatMap((p) => [p.out_transaction_id, p.components_id]),
          type: invtDB.QueryTypes.SELECT,
        }
      );

      requestData.forEach((r) => {
        const key = `${r.approval_transaction}_${r.components_key}`;
        if (!requestMap.has(key)) requestMap.set(key, r.requested_by_user); // first match, like original
      });
    }

    // ---------- BUILD ROWS ----------
    const result = finalResult.map((item) => {
      // HSN
      const hsn_code = hsnMap.get(String(item.components_id));

      // VENDOR
      const vendor =
        item.in_vendor_name == "--"
          ? "--"
          : `${item.ven_name} / ${item.in_vendor_name}`;

      // RATE
      let rate;
      if (isValid(item.jw_transaction_id)) {
        rate = item.in_po_rate;
      } else {
        rate = rateMap.get(String(item.components_id)) ?? "--";
      }

      // REQUESTED BY
      const requested_by = isValid(item.out_transaction_id)
        ? requestMap.get(`${item.out_transaction_id}_${item.components_id}`) ?? "--"
        : "--";

      return {
        DATE: moment(item.insert_date).format("DD-MM-YYYY"),
        COMPONENT: item.c_name,
        PART: item.c_part_no,
        CAT_PART_CODE: item.c_new_part_no,
        HSN: hsn_code,
        FROMLOCATION: item.loc_out ?? "--",
        TOLOCATION: item.loc_name,
        OUTQTY: `${item.qty}`,
        UNIT: item.units_name,
        RATE: rate,
        TRANSACTION: item.out_transaction_id,
        VENDOR: vendor,
        JWORDER_CHALLANNO: item.jw_challan_id + " / " + item.jw_transaction_id,
        REQUESTED_BY: requested_by,
        ADDED_BY: item.user_name,
        COMMENT: item.any_remark == null ? item.rejection_any_remark : item.any_remark,
      };
    });

    result.sort(byDate);

    // ---------- EXCEL ----------
    const worksheet = xlsx.utils.json_to_sheet(result);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Transaction OUT");

    const randKey = Math.floor(Math.random() * 900) + 100;
    const fileGenarateName = `./files/excel/TRANOUT${randKey}.xlsx`;

    xlsx.writeFile(workbook, fileGenarateName);

    await otherDB.query(
      `
      UPDATE user_files_req
      SET status = 'complete', other_data = :other
      WHERE user_id = :uid AND req_code = 'TRANOUT' AND req_date = :req_date
      `,
      {
        replacements: {
          uid,
          req_date,
          other: JSON.stringify({
            fileName: `TRANOUT${randKey}.xlsx`,
            fileUrl: fileGenarateName,
          }),
        },
        type: otherDB.QueryTypes.UPDATE,
      }
    );

    emit_notifications(notificationId);

    // ---------- SEND USER MAIL ----------
    const user = await invtDB.query(
      "SELECT `Email_ID`, `user_name` FROM `admin_login` WHERE `CustID` = :CustID",
      { replacements: { CustID: uid }, type: invtDB.QueryTypes.SELECT }
    );

    if (user.length && user[0].Email_ID) {
      const attachment = [
        {
          filename: `TRANOUT${randKey}.xlsx`,
          content: fs.readFileSync(fileGenarateName),
        },
      ];
      await helper.sendMail(
        user[0].Email_ID,
        "",
        "TRANSACTION OUT REPORT [File Ready for download] Ref:" + helper.randomNumber(99999, 999999),
        "Trans OUT",
        attachment
      );
    }

    return { code: 200, message: "File Generated Successfully" };
  } catch (err) {
    console.error("tran_out error:", err);
    await otherDB.query(
      `
      UPDATE user_files_req
      SET status = 'failed'
      WHERE reactNotificationId = :nid AND req_code = 'TRANOUT' AND req_date = :req_date
      `,
      {
        replacements: { nid: notificationId, req_date },
        type: otherDB.QueryTypes.UPDATE,
      }
    );
    emit_notifications(notificationId);
  }
};


function verifyToken(token) {
  return new Promise((resolve, reject) => {
    if (!token) {
      return reject(new Error("No token provided"));
    }

    let cleanToken = token.startsWith("Bearer ")
      ? token.slice(7)
      : token;

    jwt.verify(cleanToken, process.env.TOKEN_SECRET, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded);
      }
    });
  });
}
