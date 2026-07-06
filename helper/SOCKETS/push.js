const jwt = require("jsonwebtoken");
const { otherDB, invtDB } = require("./../../config/db/connection");
exports.push = function (io, socket) {
	// PUSH NOTIFICATION
	socket.on("push_notify", async (data) => {
		try {
			let check = await verifyToken(`${socket.handshake.auth.token}`);
			console.log("check", check.crn_id);

			if (check.crn_id) {
				let result = await invtDB.query("SELECT * FROM `admin_login` WHERE `CustID` = :data AND type = 'developer'", {
					replacements: { data: check.crn_id },
					type: invtDB.QueryTypes.SELECT,
				});
				if (result.length === 0) {
					return io.emit(`${setData.page}`, { message: "User not found", code: 404, user: "Not Developer" });
				} else {
					let result = await otherDB.query(
						"INSERT INTO `user_files_req` (`request_txt_label`, `req_code`, `user_id`, `msg_type`, `status`, `other_data`, `insert_date`) VALUES( :txt_label, :req_code, :user_id, :msg_type, :status, :other_data, :insert_date )",
						{
							replacements: {
								txt_label: "NOTIFICATION",
								req_code: helper.getUniqueNumber(),
								user_id: data.user,
								msg_type: "msg",
								status: "pending",
								other_data: JSON.stringify({
									msg: data.msg,
									sender_id: check.crn_id,
								}),
								insert_date: moment(new Date()).tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss"),
							},
							type: otherDB.QueryTypes.INSERT,
						}
					);
					if (result.length > 0) {
						io.emit("push_notify", { message: data.msg, from: check.crn_id, to: data.user });
					} else {
						// io.emit("socket_response",{message:})
					}
				}
			}
		} catch (err) {
			console.log(" token ", err);
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
