const { invtDB, otherDB } = require("./../config/db/connection");
var url = require("url");
var jwt = require("jsonwebtoken");

// check permission for user
module.exports.isPermission = async function (req, res, next) {
  next();
  return;

  // let stmt = await otherDB.query("SELECT * FROM `ims_permission2` WHERE `user_id` = :user_id AND page_id = :page_id ", {
  // 	replacements: { user_id: req.logedINUser, page_id: req.page_id },
  // 	type: otherDB.QueryTypes.SELECT,
  //   });
  //   if (stmt.length > 0) {
  // 	next();
  // 	return;
  //   } else {
  // 	return res.json({ code: 500, status: "error", message: { msg: "seems like you are an unauthorized user, so we are noting your action as spam" } });
  //   }

  let stmt1 = await invtDB.query("SELECT * FROM `admin_login` WHERE `CustID` = :user_id AND `company_id` = :company_id", { replacements: { user_id: req.logedINUser, company_id: req.logedINCompany }, type: invtDB.QueryTypes.SELECT });
  if (stmt1.length > 0) {
    if (stmt1[0].login_status == "0") {
      return res.json({ code: 500, status: "error", type: "userblocked", message: { msg: "seems like your account is marked as suspend, please contact your administrator for further information" } });
    } else {
      let stmt2 = await otherDB.query("SELECT * FROM `ims_company` WHERE `company_id` = :company_id", { replacements: { company_id: req.logedINCompany }, type: otherDB.QueryTypes.SELECT });
      if (stmt2.length > 0) {
        if (stmt2[0].company_server !== "ON" && stmt1[0].type !== "developer") {
          return res.json({
            code: 500,
            status: "error",
            type: "serveroff",
            message: { msg: "seems like your company database goes to under server maintenance, we will back back after few moment later, otherwise you can contact your administrator for further information" },
          });
        } else {
          next();
          return;
        }
      } else {
        return res.json({ code: 500, status: "error", message: { msg: "seems like you have an unauthorized company, so we are noting your action as spam" } });
      }
    }
  } else {
    return res.json({ code: 500, status: "error", message: { msg: "seems like you are an unauthorized user, so we are noting your action as spam" } });
  }

  return;
  let page_id = req.headers["page"];
  let user_id = req.logedINUser;
  let req_type = req.headers["req_type"];

  try {
    let stmt1 = await con.query("SELECT * FROM `admin_login` WHERE `CustID` = :user_id", { replacements: { user_id: user_id }, type: con.QueryTypes.SELECT });
    if (stmt1.length == 0) {
      if (stmt1[0].isMobileConfirmed == "0") {
        return res.json({ code: 403, message: "Please confirm your mobile number", error: "warning", url: "https://www.google.com", demandPermission: "0" });
      } else if (stmt1[0].isEmailConfirmed == "0") {
        return res.json({ code: 403, message: "Please confirm your mobile number", error: "warning", url: "https://www.google.com", demandPermission: "0" });
      } else {
        let stmt2 = await otherDB.query("SELECT * FROM `ims_permission` WHERE `page_id` = :page_id AND `username` = :user_id", {
          replacements: {
            page_id: page_id,
            user_id: user_id,
          },
          type: otherDB.QueryTypes.SELECT,
        });
        if (stmt2.length > 0) {
          let jsonData = JSON.parse(stmt2[0].permission);

          if (req_type == "view" && jsonData.view == "true") {
            next();
          } else if (req_type == "edit" && jsonData.edit == "true") {
            next();
          } else if (req_type == "delete" && jsonData.delete == "true") {
            next();
          } else if (req_type == "create" && jsonData.create == "true") {
            next();
          } else {
            return res.json({ code: 403, message: "the administrator has not provided you with this rights yet.<br/>suggestion to contact them...", status: "warning", demandPermission: "1" });
          }
        } else {
          return res.json({ code: 403, message: "it might be accidentally that the administrator has not provided you with any rights yet.<br/>suggestion to contact them...", status: "info", demandPermission: "1" });
        }
      }
    } else {
      return res.json({ code: 403, message: "authentication failed, contact to system administrator..", url: "https://ims.mscorpres.com/auth/logout" });
    }
  } catch (err) {
    console.log(err);
  }
};
