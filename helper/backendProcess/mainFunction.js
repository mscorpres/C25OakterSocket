const ev = require('email-mx-validator');
const { otherDB } = require('../../config/db/connection');
const { sendMail } = require('../helper');

const sendAdminMail = async () => {
    try {
        let stmt = await otherDB.query("SELECT * FROM mails_log WHERE status = 'pending'", {
            type: otherDB.QueryTypes.SELECT,
        });
        if (stmt.length > 0) {
            for (let i = 0; i < stmt.length; i++) {
                const minSec = 30;
                const maxSec = 60;

                let rand = Math.floor(Math.random() * (maxSec - minSec + 1) + minSec);

                console.log(`next e-mail will send in [waiting time ${rand} seconds]`);

                setTimeout(validEmail, rand * 1000);

                function validEmail() {
                    ev.validEmail(stmt[i].mail_to, async function (valid) {
                        if (valid) {
                            let result = await sendMail(stmt[i].mail_to, null, stmt[i].subject, stmt[i].message);

                            if (result.code == 200) {
                                let stmt2 = await otherDB.query("UPDATE mails_log SET status = 'success' , mail_sent_dt = :date  WHERE mail_to = :mailTo", {
                                    replacements: {
                                        date: new Date(),
                                        mailTo: stmt[i].mail_to,
                                    },
                                    type: otherDB.QueryTypes.UPDATE,
                                });
                            }
                            console.log(result);
                        }
                    })
                }
            }
        }

    } catch (error) {
        console.log(error.stack)
    }
}

module.exports = sendAdminMail;