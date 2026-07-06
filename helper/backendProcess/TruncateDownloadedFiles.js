const express = require("express");
const router = express.Router();
const moment = require("moment");
const fs = require("fs");
const path = require("path");
const { otherDB } = require("./../../config/db/connection");


const { error_log } = require("../utils")

router.get('/truncateDownloadedFiles', async (req, res) => {
  await otherDB.query("TRUNCATE TABLE user_files_req");
  const dirPaths = ["files/excel", "files/purchaseRegister", "files/xml", "files/xml/temp"];
  let arr = [];

  const currentDate = new Date();

  for (const dirPath of dirPaths) {
    try {
      const files = await fs.promises.readdir(dirPath);
      for (const file of files) {
        const filepath = `${dirPath}/${file}`;
        const createdDate = (await fs.promises.stat(filepath)).birthtime;

        // Compare dates without considering the time
        if (currentDate.toDateString() !== createdDate.toDateString()) {
          arr.push(file);
          await fs.promises.unlink(filepath);
        }
      }
    } catch (error) {
      error_log({ stack: error });
    }
  }

  return res.send(`Deleted ${arr.length} files. Working correctly`);
});

module.exports = router;