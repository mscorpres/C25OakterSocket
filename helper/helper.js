const dns = require("dns");
require("dotenv").config();
const nodemailer = require("nodemailer");
const fs = require("fs");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE,
  auth: {
    user: process.env.SMTP_USERID,
    pass: process.env.SMTP_USERPASS,
  },
});


exports.dateFormatDMY = function (date) {
  return date.getDate() + "-" + date.getMonth() + "-" + date.getFullYear();
};

exports.dateFormatDMYHIS = function (date) {
  return date.getDate() + "-" + date.getMonth() + "-" + date.getFullYear() + " " + date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds();
};

exports.dateFormat = function (date) {
  return date.getMonth() + "/" + date.getDate() + "/" + date.getFullYear();
};

exports.getShortDate = function (date) {
  return date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();
};

exports.daeFormat = function (date) {
  return date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate() + " " + date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds();
};

exports.getOs = function (req) {
  var ua = req.headers["user-agent"],
    $ = {};

  if (/mobile/i.test(ua)) $.Mobile = true;

  if (/like Mac OS X/.test(ua)) {
    $.iOS = /CPU( iPhone)? OS ([0-9\._]+) like Mac OS X/.exec(ua)[2].replace(/_/g, ".");
    $.iPhone = /iPhone/.test(ua);
    $.iPad = /iPad/.test(ua);
  }

  if (/Android/.test(ua)) $.Android = /Android ([0-9\.]+)[\);]/.exec(ua)[1];

  if (/webOS\//.test(ua)) $.webOS = /webOS\/([0-9\.]+)[\);]/.exec(ua)[1];

  if (/(Intel|PPC) Mac OS X/.test(ua)) $.Mac = /(Intel|PPC) Mac OS X ?([0-9\._]*)[\)\;]/.exec(ua)[2].replace(/_/g, ".") || true;

  if (/Windows NT/.test(ua)) $.Windows = /Windows NT ([0-9\._]+)[\);]/.exec(ua)[1];

  return $;
};

exports.getIp = function (req) {
  return req.headers["x-forwarded-for"] || req.connection.remoteAddress;
};

exports.getBrowser = function (req) {
  var ua = req.headers["user-agent"],
    $ = {};

  if (/MSIE|Trident/.test(ua)) $.name = "Internet Explorer";
  else if (/Firefox/.test(ua)) $.name = "Firefox";
  else if (/Chrome/.test(ua)) $.name = "Chrome";
  else if (/Safari/.test(ua)) $.name = "Safari";
  else if (/Opera/.test(ua)) $.name = "Opera";
  else if (/OPR/.test(ua)) $.name = "Opera";
  else if (/Edge/.test(ua)) $.name = "Edge";
  else if (/Yandex/.test(ua)) $.name = "Yandex";
  else if (/Konqueror/.test(ua)) $.name = "Konqueror";
  else if (/CriOS/.test(ua)) $.name = "Chrome";
  else if (/rv:11/.test(ua)) $.name = "IE";
  else $.name = "Unknown";

  if (/Trident/.test(ua)) $.version = /rv:([0-9\.]+)/.exec(ua)[1];
  else if (/MSIE/.test(ua)) $.version = /MSIE ([0-9\.]+)/.exec(ua)[1];
  else if (/Firefox/.test(ua)) $.version = /Firefox\/([0-9\.]+)/.exec(ua)[1];
  else if (/Chrome/.test(ua)) $.version = /Chrome\/([0-9\.]+)/.exec(ua)[1];
  else if (/OPR/.test(ua)) $.version = /OPR\/([0-9\.]+)/.exec(ua)[1];
  else if (/Yandex/.test(ua)) $.version = /Yandex\/([0-9\.]+)/.exec(ua)[1];
  else if (/Konqueror/.test(ua)) $.version = /Konqueror\/([0-9\.]+)/.exec(ua)[1];
  else if (/Safari/.test(ua)) $.version = /Version\/([0-9\.]+)/.exec(ua)[1];
  else if (/CriOS/.test(ua)) $.version = /CriOS\/([0-9\.]+)/.exec(ua)[1];
  else if (/Edge/.test(ua)) $.version = /Edge\/([0-9\.]+)/.exec(ua)[1];
  else $.version = "Unknown";

  if ($.name == "IE") {
    $.version = $.version.split(".")[0];
  }

  return $;
};

// random number generator
exports.randomNumber = function (min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// get unique number from date
exports.getUniqueNumber = function () {
  let date = new Date();
  return `${date.getFullYear()}${date.getMonth()}${date.getDate()}${date.getHours()}${date.getMinutes()}${date.getSeconds()}${date.getMilliseconds()}`;
};

//FILE SIZE [27-08-2022]
exports.fileSize = function (bytes, decimalPoint) {
  if (bytes == 0) return "0 Bytes";
  var k = 1000,
    dm = decimalPoint || 2,
    sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"],
    i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

// 15-07-2022
//transporter.verify().then(console.log).catch(console.error);
exports.sendMail = async function (to, cc = null, subject, message, attachments = null) {
  let mail_res;
  // if (attachments == null) {
  //   mail_res = to.map(async (toMail) => {
  //     await transporter
  //       .sendMail({
  //         from: process.env.SMTP_USERNAME + process.env.SMTP_USERID,
  //         to: toMail,
  //         cc: cc,
  //         subject: subject,
  //         html: message,
  //       })
  //       .then((info) => {
  //         return {
  //           code: 200,
  //           messageId: info.messageId,
  //         };
  //       })
  //       .catch((err) => {
  //         return {
  //           code: 500,
  //           error: err,
  //         };
  //       });
  //   });
  // } else {
  //   mail_res = to.map(async (toMail) => {
  //     await transporter
  //       .sendMail({
  //         from: process.env.SMTP_USERNAME + process.env.SMTP_USERID,
  //         to: toMail,
  //         cc: cc,
  //         subject: subject,
  //         html: message,
  //         attachments: attachments,
  //       })
  //       .then((info) => {
  //         return {
  //           code: 200,
  //           messageId: info.messageId,
  //         };
  //       })
  //       .catch((err) => {
  //         return {
  //           code: 500,
  //           error: err,
  //         };
  //       });
  //   });
  // }

  mail_res = await transporter
    .sendMail({
      from: process.env.SMTP_USERNAME + process.env.SMTP_USERID,
      to: to,
      cc: cc,
      subject: subject,
      html: message,
      attachments: attachments,
    })
    .then((info) => {
      return {
        code: 200,
        messageId: info.messageId,
      };
    })
    .catch((err) => {
      return {
        code: 500,
        error: err,
      };
    });
  return mail_res;
};

// 17-07-2022
exports.preg_match = function (regex, str) {
  return new RegExp(regex).test(str);
};

// 18-07-2022
exports.truncateWithEllipse = function (text, max) {
  return text.substr(0, max - 1) + (text.length > max ? "..." : "");
};

exports.random_color = function () {
  let letters = "0123456789ABCDEF";
  let color = "#";
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
};

exports.amount_to_word = function (amountInDigits) {
  var th = ["", "Thousand", "Million", "Billion", "Trillion"];
  var dg = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  var tn = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  var tw = ["Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function toWords(s) {
    s = s.toString();
    s = s.replace(/[\, ]/g, "");
    if (s != parseFloat(s)) return "not a number";
    var x = s.indexOf(".");
    if (x == -1) x = s.length;
    if (x > 15) return "too big";
    var n = s.split("");
    var str = "";
    var sk = 0;
    for (var i = 0; i < x; i++) {
      if ((x - i) % 3 == 2) {
        if (n[i] == "1") {
          str += tn[Number(n[i + 1])] + " ";
          i++;
          sk = 1;
        } else if (n[i] != 0) {
          str += tw[n[i] - 2] + " ";
          sk = 1;
        }
      } else if (n[i] != 0) {
        str += dg[n[i]] + " ";
        if ((x - i) % 3 == 0) str += "Hundred ";
        sk = 1;
      }
      if ((x - i) % 3 == 1) {
        if (sk) str += th[(x - i - 1) / 3] + " ";
        sk = 0;
      }
    }
    if (x != s.length) {
      var y = s.length;
      str += "Point ";
      for (var i = x + 1; i < y; i++) str += dg[n[i]] + " ";
    }
    return str.replace(/\s+/g, " ");
  }

  return toWords(amountInDigits);
};

exports.saveLogs = async function (db, message, req, transaction) {
  let result = await db
    .query("INSERT INTO `ims_invt_loggers` ( `logger_key`, `insert_date`, `insert_by`, `message`) VALUES (:log_key, :insert_key, :insert_by, :message)", {
      replacements: {
        log_key: exports.getUniqueNumber(),
        insert_key: new Date(),
        insert_by: req.logedINUser,
        message: message,
      },
      transaction: transaction,
      type: db.QueryTypes.INSERT,
    })
    .then(function (result) {
      if (result.length > 0) {
        return true;
      } else {
        throw "Insertion Of Loggers is failed";
      }
    })
    .catch(function (err) {
      console.log("Error in save log ", err);
      return false;
    });
  return result;
};

// 18-09-2022
// exports.mxValidation = async function (email) {
// 	dns.resolve(email.split("@")[1], "MX", function (err, addresses) {
// 		if (err) {
// 			//res.json({ code: 500, message: { msg: `e-mail address '${email}' not exists, seems this is a disposal e-mail` }, status: "error" });
// 			return false;
// 		} else if (addresses && addresses.length > 0) {
// 			return true;
// 		}
// 	});
// };

// 20-09-2022
exports.number = function (number) {
  if (number == Math.floor(number)) {
    return Number(number);
  } else {
    return Number(Number(number).toFixed(2).replace(/\.00$/, ""));
  }
};

exports.strCharValid = function (str) {
  const arr = ["'", "`", ":"];
  for (let i = 0; i < arr.length; i++) {
    if (str.indexOf(arr[i]) >= 0) {
      return `character that you have mentioned as [ ${arr[i]} ] not accepted`;
    }
  }
  return true;
};
