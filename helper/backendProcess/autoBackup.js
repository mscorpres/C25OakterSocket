const fs = require('fs');
const archiver = require('archiver');
const path = require('path');
const ProgressBar = require('progress');
const fastGlob = require('fast-glob');

function listDirectoriesAndContents(directory) {
  const contents = fs.readdirSync(directory);

  console.log(`Contents of ${directory}:`);
  for (const item of contents) {
    console.log(item);
  }
  console.log('------------------------');
}

async function createBackup(sourceDir, targetZip) {
  // Check if the target zip file already exists
  if (fs.existsSync(targetZip)) {
    console.error('Error: Backup file already exists. Please delete the existing backup before creating a new one.');
    return;
  }

  console.log('Listing directories and their contents before the backup process:');
  listDirectoriesAndContents(sourceDir);

  console.log('Creating backup...');

  const archive = archiver('zip', {
    zlib: { level: 9 },
  });

  const output = fs.createWriteStream(targetZip);

  archive.pipe(output);

  archive.on('error', function(err) {
    console.error('Error:', err);
  });

  archive.on('warning', function(warning) {
    console.warn('Warning:', warning);
  });

  archive.on('entry', function(entryData) {
    const entryName = entryData.name;

    // Ignore specific files and folders
    if (entryName === 'backup.zip') {
      return;
    }

    // Log the name of each file/folder as it's being zipped
    console.log('Zipping:', entryName);
  });

  // Use fast-glob to select the files and folders to include
  const filesAndFolders = await fastGlob(['**/*', '!node_modules/**', '!**/.env', '!**/backup.zip'], {
    cwd: sourceDir,
  });

  let totalFiles = 0;
  let totalFolders = 0;
  const extensionCounts = {};

  for (const entry of filesAndFolders) {
    const entryStats = fs.statSync(path.join(sourceDir, entry));

    if (entryStats.isFile()) {
      totalFiles++;

      const fileExtension = path.extname(entry).toLowerCase();

      if (extensionCounts[fileExtension]) {
        extensionCounts[fileExtension]++;
      } else {
        extensionCounts[fileExtension] = 1;
      }
    } else if (entryStats.isDirectory()) {
      totalFolders++;
    }

    archive.file(path.join(sourceDir, entry), { name: entry });
  }

  const total = totalFiles + totalFolders;

  const progressBar = new ProgressBar('Progress [:bar] :percent', {
    width: 50,
    total: total,
  });

  output.on('close', function() {
    console.log(`Backup created: ${targetZip}`);
    console.log(`Total files: ${totalFiles} and folders: ${totalFolders}`);
    console.log('File extensions:');
    for (const extension in extensionCounts) {
      console.log(`${extension}: ${extensionCounts[extension]}`);
    }
    console.log(`Total: ${total}`);
  });

  archive.finalize();
}

const sourceDirectory = path.join(__dirname, '../../socket'); // Replace with your source directory
const targetZipFile = './backup.zip'; // Replace with the target zip file

createBackup(sourceDirectory, targetZipFile);
