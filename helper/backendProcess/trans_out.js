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



exports.tran_out = async (
  date,
  uid,
  emit_notifications,
  notificationId,
  socket,
  io,
  branch
) => {
  const validation = new Validator({ date }, { date: "required" });

  if (validation.fails()) {
    return { code: 500, msg: "Please Select Date" };
  }

  let token_res = await verifyToken(`${socket.handshake.auth.token}`);
  let user_id = token_res.crn_id;
  let req_date = date;

  try {
    const dateMatch = date.match(/(\d{2}-\d{2}-\d{4})/g);
    if (!dateMatch || dateMatch.length !== 2) {
      return { code: 500, msg: "Invalid Date Format" };
    }

    const date1 = moment(dateMatch[0], "DD-MM-YYYY").format("YYYY-MM-DD");
    const date2 = moment(dateMatch[1], "DD-MM-YYYY").format("YYYY-MM-DD");

    io.to(user_id).emit("download_start_detail", {
      title: "Transaction OUT",
      details: date,
      notificationId,
      status: "pending",
      detailStatus: true,
      total: false,
      type: "file",
    });

    const finalResult = await invtDB.query(
      `
      SELECT 
        rl.ID,
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
        rl.exchange_rate,
        rl.any_remark,
        rl.rejection_any_remark,
        rl.in_hsn_code,
        vb.ven_name,
        vb.ven_register_id

      FROM rm_location rl

      LEFT JOIN components c 
        ON rl.components_id = c.component_key

      LEFT JOIN units u 
        ON c.c_uom = u.units_id

      LEFT JOIN location_main lm 
        ON rl.loc_in = lm.location_key

      LEFT JOIN location_main loc2 
        ON rl.loc_out = loc2.location_key

      LEFT JOIN admin_login al 
        ON rl.insert_by = al.CustID

      LEFT JOIN ven_basic_detail vb 
        ON vb.ven_register_id = rl.in_vendor_name

      WHERE 
        c.c_type = 'R'
        AND c.c_is_enabled = 'Y'
        AND rl.company_branch = :branch
        AND DATE_FORMAT(rl.insert_date, '%Y-%m-%d') BETWEEN :date1 AND :date2
        AND rl.trans_type IN ('ISSUE','JOBWORK','CONSUMPTION')

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

      ORDER BY rl.insert_date DESC
      `,
      {
        replacements: { date1, date2, branch },
        type: invtDB.QueryTypes.SELECT,
      }
    );

    if (!finalResult.length) {
      return { code: 500, message: "Transaction not found" };
    }

    // ==========================================
    // 1. Fetch Requested By logic
    // ==========================================
    const txnPairs = finalResult.map((r) => ({
      out_transaction_id: r.out_transaction_id,
      components_id: r.components_id,
    }));

    const uniquePairs = [
      ...new Map(
        txnPairs.map((item) => [
          `${item.out_transaction_id}_${item.components_id}`,
          item,
        ])
      ).values(),
    ];

    let requestMap = new Map();

    if (uniquePairs.length) {
      const requestData = await invtDB.query(
        `
        SELECT 
          mr.approval_transaction,
          mr.components_key,
          al.user_name
        FROM material_request mr
        LEFT JOIN admin_login al 
          ON al.CustID = mr.inserted_by
        WHERE (mr.approval_transaction, mr.components_key) IN (
          ${uniquePairs.map(() => "(?, ?)").join(",")}
        )
        `,
        {
          replacements: uniquePairs.flatMap((obj) => [
            obj.out_transaction_id,
            obj.components_id,
          ]),
          type: invtDB.QueryTypes.SELECT,
        }
      );

      requestData.forEach((r) => {
        requestMap.set(
          `${r.approval_transaction}_${r.components_key}`,
          r.user_name
        );
      });
    }

    // ==========================================
    // 2. Map the Final Output Result with WVR logic
    // ==========================================
    const result = await Promise.all(
      finalResult.map(async (item) => {
        const vendor =
          item.in_vendor_name === "--"
            ? "--"
            : `${item.ven_name ?? "--"} / ${item.in_vendor_name}`;

        const reqKey = `${item.out_transaction_id}_${item.components_id}`;
        const requestedBy = requestMap.get(reqKey) || "--";

        // Apply Q1 Rate Logic (Weighted Purchase Rate / Jobwork Rate)
        let rate = "--";
        
        if (item.trans_type === "JOBWORK" || (item.jw_transaction_id && item.jw_transaction_id !== "--" && item.jw_transaction_id !== "")) {
          // q1 logic applied for JOBWORK: use in_po_rate 
          let po_rate = parseFloat(item.in_po_rate) || 0;
          let exchange = parseFloat(item.exchange_rate) || 1;
          rate = (po_rate * exchange).toFixed(4);
        } else {
          // CONSUMPTION or ISSUE -> Calculate WVR
          try {
            const wvr = await require("../../utils/newAvgRate").newWeightedAverageRate(
              item.components_id,
              moment(item.insert_date).format("YYYY-MM-DD HH:mm:ss"),
              item.ID
            );
            rate = Number(wvr).toFixed(4);
          } catch (err) {
            console.error(`WVR calculation failed for ID ${item.ID}:`, err.message);
            rate = "0.0000";
          }
        }

        return {
          DATE: moment(item.insert_date).format("DD-MM-YYYY"),
          COMPONENT: item.c_name,
          PART: item.c_part_no,
          CAT_PART_CODE: item.c_new_part_no,
          HSN: item.in_hsn_code ?? "--",
          FROMLOCATION: item.loc_out ?? "--",
          TOLOCATION: item.loc_name ?? "--",
          OUTQTY: `${item.qty}`,
          UNIT: item.units_name,
          RATE: rate,
          TRANSACTION: item.out_transaction_id ?? "--",
          VENDOR: vendor,
          JWORDER_CHALLANNO: `${item.jw_challan_id ?? "--"} / ${item.jw_transaction_id ?? "--"}`,
          REQUESTED_BY: requestedBy,
          ADDED_BY: item.user_name,
          COMMENT:
            item.any_remark == null
              ? item.rejection_any_remark
              : item.any_remark,
        };
      })
    );

    const worksheet = xlsx.utils.json_to_sheet(result);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Transaction OUT");

    const randKey = Math.floor(Math.random() * 900) + 100;
    const filePath = `./files/excel/TRANOUT${randKey}.xlsx`;

    xlsx.writeFile(workbook, filePath);

    await otherDB.query(
      `
      UPDATE user_files_req 
      SET status = 'complete',
          other_data = :other
      WHERE user_id = :uid
        AND req_code = 'TRANOUT'
        AND req_date = :req_date
      `,
      {
        replacements: {
          uid,
          req_date,
          other: JSON.stringify({
            fileName: `TRANOUT${randKey}.xlsx`,
            fileUrl: filePath,
          }),
        },
        type: otherDB.QueryTypes.UPDATE,
      }
    );

    emit_notifications(notificationId);

    return { code: 200, message: "File Generated Successfully" };
  } catch (err) {
    console.error(err);
    await otherDB.query(
      `
      UPDATE user_files_req 
      SET status = 'failed'
      WHERE reactNotificationId = :nid
        AND req_code = 'TRANOUT'
        AND req_date = :req_date
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
