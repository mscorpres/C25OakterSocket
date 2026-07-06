const fs = require("fs");
const path = require("path");

// MAIN FILES DIRECTORY
const BASE_DIR = path.join(__dirname, "../files");

// time limit → 12 hours
const MAX_AGE_HOURS = 12;
const MAX_AGE_MS = MAX_AGE_HOURS * 60 * 60 * 1000;

function deleteOldFiles() {
  try {
    const folders = fs.readdirSync(BASE_DIR);

    folders.forEach((folder) => {
      const folderPath = path.join(BASE_DIR, folder);

      // Ensure it is a directory (excel, pdf, gstr1)
      if (!fs.lstatSync(folderPath).isDirectory()) return;

      // Now read nested folders (csv, xlsx, etc.)
      const subFolders = fs.readdirSync(folderPath);

      subFolders.forEach((sub) => {
        const subPath = path.join(folderPath, sub);

        // Only go inside folders
        if (!fs.lstatSync(subPath).isDirectory()) return;

        const files = fs.readdirSync(subPath);

        files.forEach((file) => {
          const filePath = path.join(subPath, file);

          // Skip if not a file
          if (!fs.lstatSync(filePath).isFile()) return;

          const stats = fs.statSync(filePath);
          const fileAge = Date.now() - stats.mtimeMs;

          // Delete if older than 12 hours
          if (fileAge > MAX_AGE_MS) {
            console.log(`Deleting old file: ${filePath}`);
            fs.unlinkSync(filePath);
          }
        });
      });
    });

    console.log("Auto delete job completed.");

  } catch (err) {
    console.error("Auto file delete error:", err);
  }
}

// Run every 1 min
setInterval(deleteOldFiles, 60 * 1000);

module.exports = deleteOldFiles;
