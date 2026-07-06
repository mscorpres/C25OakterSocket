var createError = require("http-errors");
var express = require("express");
var https = require("https");
var http = require("http");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
var cors = require("cors");
var compression = require("compression");
var nocache = require("nocache");
var bodyParser = require("body-parser");
const schedule = require("node-schedule");
require("dotenv").config();

// File System
var fs = require("fs");
const sendAdminMail = require("./helper/backendProcess/mainFunction");
require("./cronjob/cronjob");

// Initialize SSL Certificates
var https_options = {
  key: fs.readFileSync("./certificate/private.key"),
  cert: fs.readFileSync("./certificate/certificate.crt"),
  ca: fs.readFileSync("./certificate/ca_bundle.crt"),
};

if (process.env.STAGE === "production") {
  global.oakter_db_tally = process.env.DB_FIN_DBNAME;
  global.oakter_db_invt = process.env.DB_INVT_DBNAME;
  global.oakter_db_other = process.env.DB_OTHER_DBNAME;
} else {
  global.oakter_db_tally = process.env.TEST_DB_FIN_DBNAME;
  global.oakter_db_invt = process.env.TEST_DB_INVT_DBNAME;
  global.oakter_db_other = process.env.TEST_DB_OTHER_DBNAME;
}

var app = express();

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

var accessLogStream = fs.createWriteStream(path.join(__dirname, "access.log"), {
  flags: "a",
});
app.use(logger("combined", { stream: accessLogStream }));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(compression());
app.use(nocache());
// Initialize CORS
corsOptions = {
  origin: [
    "https://c25.prod.mscorpres.com",
    "https://c25.test.mscorpres.net"
  ],
  optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
};
app.use(cors(corsOptions));

app.get("/", function (req, res) {
  return res.send("<h2>WELCOME : C25 Socket Server</h2>");
});



// error handler
app.use(function (err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  res.status(err.status || 500);
  res.render("error");
});

app.use("/files", require("./helper/backendProcess/TruncateDownloadedFiles"));

const port = process.env.PORT;

//with http://
const node_server = https.createServer(https_options, app).listen(port);
node_server.setTimeout(6000000); // Miliseconds
console.log(`server started at port - ${port}`);

var io = require("socket.io")(node_server, {
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ["websocket", "polling"],
  upgrade: false,
  cors: {
    origin: corsOptions.origin,
    allowedHeaders: ["token", "Content-Type", "page_id", "type"],
  },
});

require("./helper/sockets_fun").myFunction(io);
