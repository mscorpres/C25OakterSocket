const { tran_out } = require("../backendProcess/trans_out");
const { tran_in } = require("../backendProcess/trans_in");

const jwt = require("jsonwebtoken");
const moment = require("moment");
const { otherDB, invtDB } = require("./../../config/db/connection");
exports.transaction = function (io, socket) {
	const emit_notifications = async function (notificationId) {
		try {
			token_res = await verifyToken(`${socket.handshake.auth.token}`);
			let user_id = token_res.crn_id;
			let stmt = await otherDB.query(
				"SELECT * FROM `user_files_req` WHERE `user_id` = :uid ORDER BY `ID` DESC",
				{
					replacements: { uid: user_id },
					type: otherDB.QueryTypes.SELECT,
				}
			);
			if (stmt.length > 0) {
				if (notificationId) {
					let item = { ...stmt[0], notificationId: notificationId };
					stmt.unshift();
					stmt = [item, ...stmt];
					console.log("notifications sent");

					io.to(user_id).emit("socket_receive_notification", stmt);
				} else {
					socket.emit("notification", stmt);
				}
			}
		} catch (err) {
			console.log("fetch_notifications :=", err.stack);
		}
	};

	// TRANSACTION OUT
	socket.on("trans_out", async (data) => {
		try {
			let check = await verifyToken(`${socket.handshake.auth.token}`);
			let check_data = await otherDB.query(
				"SELECT * FROM `user_files_req` WHERE `user_id`= :uid AND `req_code` = 'TRANOUT' AND req_date = :date AND `status` = 'pending'",
				{
					replacements: {
						uid: check.crn_id,
						date: JSON.parse(data.otherdata).date,
					},
					type: otherDB.QueryTypes.SELECT,
				}
			);

			if (check_data.length > 0) {
				return;
			}
			console.log(JSON.parse(data.otherdata).date);
			console.log("Hey ----", JSON.parse(data.otherdata).branch)

			let stmt = await otherDB.query(
				"INSERT INTO `user_files_req` ( `request_txt_label`,  `req_code`, `user_id` , `req_date`, `msg_type` , `status` , `other_data`, `insert_date` ) VALUES ('Transaction OUT REPORT', 'TRANOUT', :uid, :req_date ,'file','pending', :other, :insert_date ) ",
				{
					replacements: {
						uid: check.crn_id,
						req_date: JSON.parse(data.otherdata).date,
						other: JSON.stringify({}),
						insert_date: moment().format("YYYY-MM-DD HH:mm:ss"),
					},
					type: otherDB.QueryTypes.INSERT,
				}
			);

			let res = await tran_out(
				JSON.parse(data.otherdata).date,
				check.crn_id,
				emit_notifications,
				data.notificationId,
				socket,
				io,
				JSON.parse(data.otherdata).branch
			);
		} catch (err) {
			console.log("backend_req_err");
			console.log(err);
		}
	});

	// TRANSACTION IN
	socket.on("trans_in", async (data) => {
		try {
			console.log(data);
			let check = await verifyToken(`${socket.handshake.auth.token}`);
			let user_id = check.crn_id;
			let check_data = await otherDB.query(
				"SELECT * FROM `user_files_req` WHERE `user_id`= :uid AND `req_code` = 'TRANIN' AND `req_date` = :date AND `status` = 'pending'",
				{
					replacements: {
						uid: check.crn_id,
						date: JSON.parse(data.otherdata).date,
					},
					type: otherDB.QueryTypes.SELECT,
				}
			);

			if (check_data.length > 0) {
				return;
			}

			let stmt = await otherDB.query(
				"INSERT INTO `user_files_req` (`request_txt_label`, `req_code`, `user_id`, `req_date`, `msg_type` , `status` , `other_data`, `insert_date` ) VALUES ('Transaction In Report', 'TRANIN', :uid, :req_date,'file','pending', :other , :insert_date) ",
				{
					replacements: {
						uid: check.crn_id,
						req_date: JSON.parse(data.otherdata).date,
						other: JSON.stringify({}),
						insert_date: moment().format("YYYY-MM-DD HH:mm:ss"),
					},
					type: otherDB.QueryTypes.INSERT,
				}
			);

			let res = await tran_in(
				JSON.parse(data.otherdata).date,
				check.crn_id,
				emit_notifications,
				data.notificationId,
				socket,
				io,
				JSON.parse(data.otherdata).branch,
				JSON.parse(data.otherdata).wise
			);
		} catch (err) {
			console.log("backend_req_err");
			console.log(err);
		}
	});

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
};
