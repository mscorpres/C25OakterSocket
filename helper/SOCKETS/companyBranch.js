const { otherDB, invtDB } = require("./../../config/db/connection");
const jwt = require("jsonwebtoken");
const { randomNumber, getUniqueNumber } = require("../helper");
exports.companyBranch = async function (io, socket) {
  let user_id;
  try {
    token_res = await verifyToken(`${socket.handshake.auth.token}`);
    user_id = token_res.crn_id;

    socket.join(user_id);
    socket.on("getBranch", async (data) => {
      const existingUser = await otherDB.query(
        "SELECT user FROM user_company_branch where `user` = :user",
        {
          replacements: {
            user: user_id,
          },
          type: otherDB.QueryTypes.SELECT,
        }
      );
      if (existingUser[0]) {
        const stmt = await otherDB.query(
          "UPDATE user_company_branch SET `branch` = :branch WHERE `user` = :user",
          {
            replacements: {
              user: user_id,
              branch: data,
            },
            type: otherDB.QueryTypes.UPDATE,
          }
        );
      } else {
        const stmt = await otherDB.query(
          "INSERT INTO `user_company_branch` (`user`,`branch`) VALUES (:user, :branch)",
          {
            replacements: {
              user: user_id,
              branch: data,
            },
            type: otherDB.QueryTypes.INSERT,
          }
        );
      }

      console.log(existingUser);
    });
  } catch (err) { }

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
