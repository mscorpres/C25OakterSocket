var jwt = require("jsonwebtoken");

module.exports.isAuthorized = function (req, res, next) {
  req.logedINUser = "TEST ";
  req.logedINCompany = "TEST";
  next();
  return;

  var token = req.headers["x-csrf-token"];
  req.page_id = req.headers["page_id"];

  if (!token) {
    res.json({
      code: 500,
      message: { msg: "token identification mismatched..<br />Please login again.." },
    });
    return;
  }
  jwt.verify(token, `${process.env.TOKEN_SECRET}`, function (err, decoded) {
    if (err) {
      res.json({
        code: 500,
        message: { msg: "token authentication failed..<br />Please login again..." },
      });
      return;
    }
    //qyuery here
    req.logedINUser = decoded.crn_id;
    req.logedINCompany = decoded.company_id;
    next();
  });
};
