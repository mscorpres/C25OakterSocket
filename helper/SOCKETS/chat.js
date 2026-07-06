const { otherDB, invtDB } = require("./../../config/db/connection");
const jwt = require("jsonwebtoken");
const { randomNumber, getUniqueNumber } = require("../helper");
var users = {};
exports.chat = async function (io, socket) {
  // when user click on a conversation
  // socket.on("socket_join_room", ({ conversationId }) => {
  //   socket.join(conversationId);
  // });
  let user_id;
  try {
    token_res = await verifyToken(`${socket.handshake.auth.token}`);
    user_id = token_res.crn_id;
  } catch (err) { }

  socket.join(user_id);
  socket.on("send_chat_msg", async (data) => {
    try {
      io.to(data.receiver).emit("socket_receive_notification", {
        ...data,
        sender: user_id,
        type: "message",
        notificationId: getUniqueNumber(),
        title: data.senderName,
        message: (!data.messageType || data.messageType != "file") && data.text,
        filePath: data.messageType && data.messageType === "file" && data.path,
        messageType: data.messageType ?? "text",
      });
      io.to(data.senderId).emit("socket_receive_notification", {
        ...data,
        type: "message",
        notificationId: getUniqueNumber(),
        title: data.senderName,
        message: (!data.messageType || data.messageType != "file") && data.text,
        filePath: data.messageType && data.messageType === "file" && data.path,
        message: data.text,
        messageType: data.messageType ?? "text",
      });
    } catch (err) {
      console.log("res_chats :=", err.stack);
    }
  });

  async function fetch_sender_chats(user_id, sender_id) {
    let stmt = await otherDB.query(
      "SELECT fname,img,incoming_msg_id,msg,outgoing_msg_id,status FROM ims_chat_logs LEFT JOIN users ON users.unique_id = ims_chat_logs.outgoing_msg_id WHERE (outgoing_msg_id = :sender_id  AND incoming_msg_id = :uid ) OR (outgoing_msg_id = :uid AND incoming_msg_id = :sender_id ) ORDER BY msg_id",
      {
        replacements: { uid: user_id, sender_id: sender_id },
        type: otherDB.QueryTypes.SELECT,
      }
    );
    if (stmt.length > 0) {
      // io.emit("res_chats", stmt);
      var socketId = users[sender_id];
      var socketId2 = users[user_id];
      io.to(socketId).emit("res_chats", stmt);
      io.to(socketId2).emit("res_chats", stmt);
    } else {
      var socketId = users[user_id];
      var socketId2 = users[user_id];
      console.log(socketId);
      io.to(socketId).emit("res_chats", stmt);
      io.to(socketId2).emit("res_chats", stmt);
    }
  }

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

// socket.on("fetch_chat_list", async () => {
//   console.log("user was here");
//   try {
//     token_res = await verifyToken(`${socket.handshake.auth.token}`);
//     let user_id = token_res.crn_id;
//     let stmt = await otherDB.query(
//       "SELECT * FROM users WHERE NOT unique_id = :uid ORDER BY user_id DESC",
//       {
//         replacements: { uid: user_id },
//         type: otherDB.QueryTypes.SELECT,
//       }
//     );
//     // console.log(stmt);
//     if (stmt.length > 0) {
//       socket.emit("res_chat_list", stmt);
//     } else {
//       socket.emit("res_chat_list", stmt);
//     }
//   } catch (err) {
//     // console.log("res_chat_list :=", err.stack);
//   }
// });
// socket.on("fetch_sender_chats", async (data) => {
//   const { sender_id } = data;

//   console.log("receiver i s", data);
//   try {
//     token_res = await verifyToken(`${socket.handshake.auth.token}`);
//     let user_id = token_res.crn_id;
//     console.log(token_res.crn_id);
//     let stmt = await otherDB.query(
//       "SELECT fname,img,incoming_msg_id,msg,outgoing_msg_id,status FROM ims_chat_logs LEFT JOIN users ON users.unique_id = ims_chat_logs.outgoing_msg_id WHERE (outgoing_msg_id = :sender_id  AND incoming_msg_id = :uid ) OR (outgoing_msg_id = :uid AND incoming_msg_id = :sender_id ) ORDER BY msg_id",
//       {
//         replacements: { uid: user_id, sender_id: sender_id },
//         type: otherDB.QueryTypes.SELECT,
//       }
//     );
//     if (stmt.length > 0) {
//       socket.emit("res_chats", stmt);
//     } else {
//       socket.emit("res_chats", stmt);
//     }
//   } catch (err) {
//     console.log("res_chats :=", err.stack);
//   }
// });
