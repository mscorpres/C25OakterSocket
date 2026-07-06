const jwt = require("jsonwebtoken");
const { otherDB, invtDB } = require("../../../config/db/connection");
const moment = require("moment");
const { verifyToken, error_log, emit_notifications, emit_error_msg } = require("../../../helper/utils");
const helper = require("../../../helper/helper");
const XLSX = require("xlsx");


exports.jw_analysis = function (io, socket) {
    try {
        socket.on("jw_analysis", async (data) => {
            let check = await verifyToken(`${socket.handshake.auth.token}`);

            let stmt = await otherDB.query(
                "INSERT INTO user_files_req ( request_txt_label,  req_code, user_id , req_date, msg_type , status , other_data, insert_date ) VALUES ('JW Analysis', 'JW_ANALYSIS', :uid, :vendor ,'file','pending', :other, :insert_date ) ",
                {
                    replacements: {
                        uid: check.crn_id,
                        vendor: data.vendor,
                        other: JSON.stringify({}),
                        insert_date: moment().format("YYYY-MM-DD HH:mm:ss"),
                    },
                    type: otherDB.QueryTypes.INSERT,
                }
            );

            io.to(check.crn_id).emit("download_start_detail", {
                title: "JW Analysis",
                details: data.vendor,
                notificationId: data.notificationId,
                status: "pending",
                detailStatus: true,
                total: false,
                type: "file",
            });

            const jw_header_data = await invtDB.query(
                "SELECT jw_jw_transaction , product_key as skucode FROM `jw_purchase_req` LEFT JOIN `products` ON `jw_purchase_req`.`jw_po_sku` = `products`.`product_key` WHERE `jw_po_vendor_reg_id` = :venid AND `jw_purchase_req`.`jw_po_status` = 'A' ORDER BY `jw_purchase_req`.`jw_po_full_date` DESC",
                {
                    replacements: { venid: data.vendor },
                    type: invtDB.QueryTypes.SELECT,
                }
            );

            if (jw_header_data.length <= 0) {
                const stmt_close_stmt = await otherDB.query("UPDATE user_files_req SET status = 'complete' WHERE id = :id", {
                    replacements: {
                        id: stmt[0]
                    },
                    type: otherDB.QueryTypes.UPDATE
                })
            }


            const wb = XLSX.utils.book_new();

            for (let i = 0; i < jw_header_data.length; i++) {

                const sheet_data = [];

                let stmt_jwpo_req = await invtDB.query(
                    "SELECT * FROM `jw_purchase_req` LEFT JOIN `jw_bom_recipe` ON `jw_purchase_req`.`jw_po_sku` = `jw_bom_recipe`.`jw_bom_sku` LEFT JOIN `bom_recipe` ON `jw_purchase_req`.`jw_po_recipe` = `bom_recipe`.`subject_id` LEFT JOIN `products` ON `jw_bom_recipe`.`jw_bom_sku` = `products`.`product_key` LEFT JOIN `units` ON `products`.`p_uom` = `units`.`units_id` LEFT JOIN `admin_login` ON `jw_purchase_req`.`jw_po_insert_by` = `admin_login`.`CustID` LEFT JOIN `ven_basic_detail` ON `jw_purchase_req`.`jw_po_vendor_reg_id` = `ven_basic_detail`.`ven_register_id` WHERE `jw_bom_recipe`.`jw_bom_sku` = :skucode AND `jw_purchase_req`.`jw_jw_transaction` = :jw_id LIMIT 1",
                    {
                        replacements: { skucode: jw_header_data[i].skucode, jw_id: jw_header_data[i].jw_jw_transaction },
                        type: invtDB.QueryTypes.SELECT,
                    }
                );

                if (stmt_jwpo_req.length > 0) {
                    let jw_status;
                    let header = [];
                    if (stmt_jwpo_req[0].jw_po_issue_qty == "0" && stmt_jwpo_req[0].jw_po_status == "A") {
                        jw_status = "Created";
                    } else if (stmt_jwpo_req[0].jw_po_issue_qty !== "0" && stmt_jwpo_req[0].jw_po_status == "A") {
                        jw_status = "Processing...";
                    } else {
                        jw_status = "Closed";
                    }

                    let req_date = moment(stmt_jwpo_req[0].jw_po_full_date, "YYYY-MM-DD HH:mm:ss").format("DD-MM-YYYY HH:mm:ss")
                    let ordered_qty = stmt_jwpo_req[0].jw_po_order_qty + " " + stmt_jwpo_req[0].units_name;

                    let stmt_jwpo_req2 = await invtDB.query("SELECT * FROM `jw_purchase_req` WHERE `jw_po_sku` = :skucode AND `jw_jw_transaction` = :jw_id", {
                        replacements: { skucode: jw_header_data[i].skucode, jw_id: jw_header_data[i].jw_jw_transaction },
                        type: invtDB.QueryTypes.SELECT,
                    });

                    if (stmt_jwpo_req2.length > 0) {
                        let jw_order_qty = stmt_jwpo_req2[0].jw_po_order_qty;
                        let jw_tran_id = stmt_jwpo_req2[0].jw_jw_transaction;
                        let jw_issue_qty = stmt_jwpo_req2[0].jw_po_issue_qty;

                        let stmt_comp = await invtDB.query("SELECT * FROM `jw_bom_recipe` LEFT JOIN `components` ON `jw_bom_recipe`.`jw_bom_part` = `components`.`component_key` LEFT JOIN `units` ON `components`.`c_uom` = `units`.`units_id` WHERE `jw_bom_recipe`.`jw_bom_sku` = :skucode AND `jw_bom_recipe`.`jw_bom_po_trans` = :jw_id ORDER BY `components`.`c_part_no` ASC", {
                            replacements: { skucode: jw_header_data[i].skucode, jw_id: jw_header_data[i].jw_jw_transaction },
                            type: invtDB.QueryTypes.SELECT,
                        });

                        if (stmt_comp.length > 0) {
                            sheet_data.push([`SR. NO.`, `Part Code`, `Name`, `UOM`, `BOM Qty`, `BOM RATE`, `REQ QTY`, `Issue Qty`, `Short/Access`, `Consumption`, `RM RTN`, `Pending With JW`, `Outward Value`, `Consumption Value`, `RM RTN Value`]);
                            let final = [];
                            for (let j = 0; j < stmt_comp.length; j++) {
                                let stmt_total_iss = await invtDB.query("SELECT COALESCE(SUM(`qty`+`other_qty`),0 ) AS `total_issued_rm` FROM `rm_location` WHERE `jw_transaction_id` = :transaction_id AND `components_id` = :component_id AND trans_type = 'JOBWORK'", {
                                    replacements: { component_id: stmt_comp[j].component_key, transaction_id: jw_header_data[i].jw_jw_transaction },
                                    type: invtDB.QueryTypes.SELECT,
                                });
                                let total_issue_qty;
                                if (stmt_total_iss.length > 0) {
                                    total_issue_qty = stmt_total_iss[0].total_issued_rm;
                                } else {
                                    total_issue_qty = 0;
                                }

                                let stmt_total_ret = await invtDB.query("SELECT COALESCE(SUM(`qty`+`other_qty`),0 ) AS `total_returned_rm` FROM `rm_location` WHERE `trans_type` = 'INWARD' AND `in_jw_transaction_id` = :transaction_id AND `components_id` = :component_id AND trans_mode = 'return'", {
                                    replacements: { component_id: stmt_comp[j].component_key, transaction_id: jw_header_data[i].jw_jw_transaction },
                                    type: invtDB.QueryTypes.SELECT,
                                });
                                let total_rm_return_qty = 0;
                                if (stmt_total_ret.length > 0) {
                                    total_rm_return_qty = stmt_total_ret[0].total_returned_rm;
                                }

                                let stmt_total_out = await invtDB.query("SELECT COALESCE(SUM(`qty`+`other_qty`),0 ) AS `total_outward`, `in_po_rate` FROM `rm_location` WHERE `jw_transaction_id` = :transaction_id AND `components_id` = :component_id AND `trans_type` = 'JOBWORK'", {
                                    replacements: { component_id: stmt_comp[j].component_key, transaction_id: jw_header_data[i].jw_jw_transaction },
                                    type: invtDB.QueryTypes.SELECT,
                                });
                                let total_outward_value = 0;
                                if (stmt_total_out.length > 0) {
                                    total_outward_value = stmt_total_out[0].total_outward;
                                }

                                let stmt_total_in = await invtDB.query("SELECT COALESCE(SUM(`qty`+`other_qty`),0 ) AS `total_inward`, `in_po_rate` FROM `rm_location` WHERE `in_jw_transaction_id` = :transaction_id AND `components_id` = :component_id AND `trans_type` = 'INWARD' AND `bom_subject_id` = '--' AND `in_vendor_branch` = '--' AND `in_vendor_addr` = '--'", {
                                    replacements: { component_id: stmt_comp[j].component_key, transaction_id: jw_header_data[i].jw_jw_transaction },
                                    type: invtDB.QueryTypes.SELECT,
                                });
                                let total_inward_value = 0;
                                if (stmt_total_in.length > 0) {
                                    total_inward_value = stmt_total_in[0].total_inward;
                                }

                                let stmt_total_consump = await invtDB.query("SELECT COALESCE(SUM(`qty`+`other_qty`),0 ) AS `total_consumption` FROM `rm_location` WHERE `jw_transaction_id` = :transaction_id AND `components_id` = :component_id AND `trans_type` = 'SFG-CONSUMPTION' ", {
                                    replacements: { component_id: stmt_comp[j].component_key, transaction_id: jw_header_data[i].jw_jw_transaction },
                                    type: invtDB.QueryTypes.SELECT,
                                })
                                let total_consumption_value;
                                if (stmt_total_consump.length > 0) {
                                    total_consumption_value = stmt_total_consump[0].total_consumption;
                                } else {
                                    total_consumption_value = 0;
                                }

                                // let stmt_total_rt_in = await invtDB.query("SELECT COALESCE(SUM(`qty`+`other_qty`),0 ) AS `total_inward`, `in_po_rate` FROM `rm_location` WHERE `in_jw_transaction_id` = :transaction_id AND `components_id` = :component_id AND `trans_type` = 'INWARD' AND `bom_subject_id` != '--' AND `in_vendor_branch` != '--' AND `in_vendor_addr` != '--'", {
                                //     replacements: { component_id: stmt_comp[j].component_key, transaction_id: jw_header_data[i].jw_jw_transaction },
                                //     type: invtDB.QueryTypes.SELECT,
                                // });

                                // let total_rt_inward_value = 0;
                                // if (stmt_total_rt_in.length > 0) {
                                //     total_rt_inward_value = stmt_total_rt_in[0].total_inward;
                                // }
                                let consump_qty = helper.number((total_consumption_value) > (total_issue_qty - total_rm_return_qty) ? (total_issue_qty - total_rm_return_qty) : (total_consumption_value));

                                let p_with_jw = helper.number(total_issue_qty - consump_qty - total_rm_return_qty).toFixed(4);
                                let pending_qty = helper.number(jw_order_qty * stmt_comp[j].jw_bom_qty - total_issue_qty).toFixed(4);

                                sheet_data.push([j + 1, stmt_comp[j].c_part_no, stmt_comp[j].c_name, stmt_comp[j].units_name, helper.number(stmt_comp[j].jw_bom_qty).toFixed(4), stmt_comp[j].jw_bom_rate, helper.number(jw_order_qty * stmt_comp[j].jw_bom_qty).toFixed(4), total_issue_qty, pending_qty, consump_qty, total_rm_return_qty, p_with_jw, helper.number(total_issue_qty * stmt_comp[j].jw_bom_rate), helper.number(consump_qty * stmt_comp[j].jw_bom_rate), helper.number(total_rm_return_qty * stmt_comp[j].jw_bom_rate)]);
                            }


                            const ws = XLSX.utils.aoa_to_sheet(sheet_data);

                            let sheet_name = jw_header_data[i].jw_jw_transaction.replaceAll("-", "_").replaceAll("/", "_");

                            XLSX.utils.book_append_sheet(wb, ws, sheet_name);

                        }
                    }
                }

            } //LIST JW PO
            const filename = "JW_ANALYSIS" + helper.randomNumber(1000, 9999) + ".xlsx";
            const filePath = "./files/excel/" + filename;
            XLSX.writeFile(wb, filePath);

            let stmt_update = await otherDB.query("UPDATE user_files_req SET status = 'complete', other_data = :other WHERE ID = :req_id ", {
                replacements: {
                    uid: check.crn_id,
                    req_id: stmt[0],
                    other: JSON.stringify({
                        fileName: filename,
                        fileUrl: filePath,
                        fileBuffer: Buffer.from(filePath, "base64"),
                    }),
                },
                type: otherDB.QueryTypes.UPDATE,
            });

            emit_notifications(io, socket, data.notificationId);

        })
    }
    catch (err) {
        error_log({ stack: err.stack });
    }
}