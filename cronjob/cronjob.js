require("./weeklyReport");
const cron = require("node-cron");
const moment = require("moment");
const { otherDB, invtDB } = require("../config/db/connection");
const { allCompM } = require("../helper/backendProcess/allComp");
const { error_log } = require("../helper/utils");
const helper = require("../helper/helper");
const fs = require("fs");
const path = require("path");
const { htmlTemplate } = require("../helper/backendProcess/EmailTemplate/fileDownload");

// Mock IO and Socket for cron job
const mockIo = {
  to: (user_id) => ({
    emit: (event, data) => {
      console.log(`Mock emit to ${user_id}: ${event}`, data);
    },
  }),
};

const mockSocket = {
  emit: (event, data) => {
    console.log(`Mock socket emit: ${event}`, data);
  },
  handshake: {
    auth: {
      token: null, // Not needed for cron
      companyBranch: "BROAKTRC25", // Default branch, adjust if needed
    },
  },
};

// Modified emit_notifications for cron
const emit_notifications = async (notificationId, user_id) => {
  try {
    let stmt = await otherDB.query("SELECT * FROM `user_files_req` WHERE `user_id` = :uid ORDER BY `ID` DESC", {
      replacements: { uid: user_id },
      type: otherDB.QueryTypes.SELECT,
    });

    if (stmt.length > 0) {
      if (notificationId) {
        stmt[0] = { ...stmt[0], notificationId: notificationId };
        mockIo.to(user_id).emit("socket_receive_notification", stmt);
      } else {
        mockSocket.emit("notification", stmt);
      }
    }
  } catch (err) {
    error_log({ stack: err.stack });
  }
};

// Cron job for AllComp report at 6:40 PM daily
cron.schedule("56 17 * * *", async () => {
  console.log(`AllComp Report Cron job triggered at ${new Date().toISOString()}`);
  try {
    const date = [moment().subtract(90, "days").format("DD-MM-YYYY"), moment().format("DD-MM-YYYY")];

    const user = await invtDB.query("SELECT CustID, user_name FROM admin_login LIMIT 1", { type: invtDB.QueryTypes.SELECT });
    const user_id = user[0]?.CustID || "AUTO";
    const user_name = user[0]?.user_name || "User";
    const companyBranch = "BROAKTRC25";
    mockSocket.handshake.auth.companyBranch = companyBranch;

    // Generate unique file name
    let file_branch = companyBranch === "BROAKTRC25" ? "A21" : "B29";
    const fileName = `ALLCOMP-${file_branch}${user_id}${Math.floor(Math.random() * 9999)}.csv`;

    // Insert into user_files_req
    await otherDB.query(
      "INSERT INTO `user_files_req` (`request_txt_label`, `req_code`, `user_id`, `req_date`, `msg_type`, `status`, `other_data`, `insert_date`, `reactNotificationId`) VALUES ('ALL COMP', 'ALLCOMP', :uid, :req_date, 'file', 'pending', :other, :insert_date, :notificationId)",
      {
        replacements: {
          uid: user_id,
          req_date: `${date[0]}-${date[1]}`,
          other: JSON.stringify({ fileName: fileName }),
          insert_date: moment().format("YYYY-MM-DD HH:mm:ss"),
          notificationId: 0,
        },
        type: otherDB.QueryTypes.INSERT,
      },
    );

    // Emit download start detail (mock)
    mockIo.to(user_id).emit("download_start_detail", {
      title: "All Comp",
      details: `${date[0]}-${date[1]}`,
      notificationId: 0,
      status: "pending",
      detailStatus: true,
      type: "file",
    });

    // Trigger the report generation
    await allCompM(date, user_id, emit_notifications, fileName, 0, mockSocket, mockIo, companyBranch);

    // Send email to specific recipients
    const emailRecipients = ["aman.mandal@mscorpres.in"]; // Add more emails as needed
    const attachment = [
      {
        filename: "ALL COMP REPORT.csv",
        content: fs.readFileSync(`./files/excel/${fileName}`),
      },
    ];
    await helper.sendMail(
      emailRecipients.join(","), // Combine multiple emails with commas
      "",
      `All Component [File Ready for download] Ref:${helper.randomNumber(99999, 999999)}`,
      htmlTemplate(user_name, new Date(), "All Component", `${process.env.SOCKET_API_URL}/${fileName}`),
      attachment,
    );

    console.log(`AllComp report generated and emailed to ${emailRecipients.join(", ")}`);
  } catch (error) {
    console.error(`Error executing AllComp cron job: ${error.message}`, error.stack);
    error_log({ stack: error.stack });
  }
});

// Function to delete old files from filesystem (recursively through all folders in files/)
async function deleteOldFilesFromFolder(dirPath) {
  const deletedFiles = [];
  const errors = [];

  // Allowed file extensions (only delete these file types, not folders)
  const allowedExtensions = [
    ".xlsx",
    ".xls",
    ".csv", // Excel
    ".doc",
    ".docx", // Word
    ".pdf", // PDF
    ".zip",
    ".rar",
    ".7z", // Archives
    ".xml", // XML
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".svg",
    ".webp", // Images
    ".txt",
    ".log", // Text files
    ".json", // JSON
  ];

  try {
    if (!fs.existsSync(dirPath)) {
      console.log(`Directory does not exist: ${dirPath}`);
      return { deletedFiles: [], errors: [] };
    }

    const items = await fs.promises.readdir(dirPath);

    for (const item of items) {
      const itemPath = path.join(dirPath, item);

      try {
        const stats = await fs.promises.stat(itemPath);

        // Check if it's a directory
        if (stats.isDirectory()) {
          // Recursively process subdirectories (but don't delete the folder itself)
          const subResult = await deleteOldFilesFromFolder(itemPath);
          deletedFiles.push(...subResult.deletedFiles);
          errors.push(...subResult.errors);
        } else if (stats.isFile()) {
          // It's a file - check extension and age
          const fileExt = path.extname(item).toLowerCase();

          // Only process files with allowed extensions
          if (allowedExtensions.includes(fileExt)) {
            // Check if file is older than 12 hours
            const fileAge = moment().diff(moment(stats.birthtime), "hours");

            if (fileAge >= 12) {
              // Delete the file
              await fs.promises.unlink(itemPath);
              deletedFiles.push(itemPath);
              console.log(`Deleted old file: ${itemPath}`);
            }
          }
        }
      } catch (itemError) {
        errors.push({ path: itemPath, error: itemError.message });
        console.error(`Error processing ${itemPath}:`, itemError.message);
      }
    }
  } catch (dirError) {
    errors.push({ path: dirPath, error: dirError.message });
    console.error(`Error reading directory ${dirPath}:`, dirError.message);
    error_log({ stack: dirError.stack });
  }

  return { deletedFiles, errors };
}

// Function to delete records older than 12 hours from database
async function deleteOldFiles() {
  try {
    console.log(`Starting database cleanup at ${new Date().toISOString()}`);

    const twelveHoursAgo = moment().subtract(12, "hours").format("YYYY-MM-DD HH:mm:ss");

    // First, count how many records will be deleted
    const countResult = await otherDB.query("SELECT COUNT(*) as count FROM `user_files_req` WHERE `insert_date` < :twelveHoursAgo", {
      replacements: { twelveHoursAgo: twelveHoursAgo },
      type: otherDB.QueryTypes.SELECT,
    });

    const deletedCount = countResult[0]?.count || 0;

    // Delete records older than 12 hours from database
    await otherDB.query("DELETE FROM `user_files_req` WHERE `insert_date` < :twelveHoursAgo", {
      replacements: { twelveHoursAgo: twelveHoursAgo },
      type: otherDB.QueryTypes.DELETE,
    });

    console.log(`Deleted ${deletedCount} records older than 12 hours from database`);

    // After deleting from database, delete old files from filesystem
    console.log(`Starting filesystem cleanup in files/ directory...`);
    const filesResult = await deleteOldFilesFromFolder("./files");

    console.log(`\n=== Cleanup Summary ===`);
    console.log(`Records deleted from DB: ${deletedCount}`);
    console.log(`Files deleted from filesystem: ${filesResult.deletedFiles.length}`);
    console.log(`Errors: ${filesResult.errors.length}`);

    if (filesResult.errors.length > 0) {
      console.log(`Errors encountered:`, filesResult.errors);
    }

    return {
      deletedCount: deletedCount,
      deletedFiles: filesResult.deletedFiles.length,
      errors: filesResult.errors.length,
    };
  } catch (error) {
    console.error(`Error in deleteOldFiles function:`, error.message);
    error_log({ stack: error.stack });
    throw error;
  }
}

// Cron job to delete files older than 12 hours - runs every 5 minutes
cron.schedule("*/5 * * * *", async () => {
  console.log(`File cleanup cron job triggered at ${new Date().toISOString()}`);
  try {
    await deleteOldFiles();
    console.log(`File cleanup completed successfully`);
  } catch (error) {
    console.error(`Error executing file cleanup cron job: ${error.message}`, error.stack);
    error_log({ stack: error.stack });
  }
});

// Export the function for use in cron jobs or manual calls
module.exports = { deleteOldFiles };
