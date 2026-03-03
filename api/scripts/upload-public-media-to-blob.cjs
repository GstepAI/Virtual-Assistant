#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { BlobServiceClient } = require('@azure/storage-blob');

function printUsage() {
  console.log(
    [
      'Bulk upload media from public/ to Azure Blob Storage.',
      '',
      'Usage:',
      '  node scripts/upload-public-media-to-blob.cjs [options]',
      '',
      'Options:',
      '  --dry-run                 Show planned uploads without uploading',
      '  --overwrite               Replace blobs that already exist',
      '  --container=<name>        Blob container (default: MEDIA_BLOB_CONTAINER or bluecrow-media)',
      '  --concurrency=<number>    Parallel uploads (default: 4)',
      '  --public-root=<path>      Public folder path (default: <repo>/public)',
      '  --help                    Show this help',
      '',
      'Environment:',
      '  BLOB_STORAGE_CONNECTION_STRING (or AZURE_STORAGE_CONNECTION_STRING / AzureWebJobsStorage)',
      '  MEDIA_PUBLIC_BASE_URL (optional, used only for printed URLs)',
    ].join('\n')
  );
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    overwrite: false,
    container:
      process.env.MEDIA_BLOB_CONTAINER || 'bluecrow-media',
    concurrency: 4,
    publicRoot: path.resolve(__dirname, '..', '..', 'public'),
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--overwrite') {
      options.overwrite = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg.startsWith('--container=')) {
      options.container = arg.slice('--container='.length).trim();
      continue;
    }
    if (arg.startsWith('--concurrency=')) {
      const parsed = Number.parseInt(arg.slice('--concurrency='.length), 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        options.concurrency = parsed;
      }
      continue;
    }
    if (arg.startsWith('--public-root=')) {
      const value = arg.slice('--public-root='.length).trim();
      if (value) {
        options.publicRoot = path.resolve(value);
      }
      continue;
    }
  }

  return options;
}

function getStorageConnectionString() {
  const candidates = [
    process.env.BLOB_STORAGE_CONNECTION_STRING,
    process.env.AZURE_STORAGE_CONNECTION_STRING,
    process.env.AzureWebJobsStorage,
  ];

  for (const candidate of candidates) {
    const value = candidate && candidate.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function isNotFoundError(error) {
  return (
    Number(error && error.statusCode) === 404 ||
    (error && error.code) === 'BlobNotFound' ||
    (error && error.details && error.details.errorCode) === 'BlobNotFound'
  );
}

async function fileExists(filePath) {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(rootDir) {
  const files = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const current = queue.shift();
    const entries = await fs.promises.readdir(current, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function toBlobPath(prefix, sourceRoot, filePath) {
  const relative = path.relative(sourceRoot, filePath).split(path.sep).join('/');
  return `${prefix}/${relative}`;
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mov':
      return 'video/quicktime';
    default:
      return 'application/octet-stream';
  }
}

async function blobExists(blobClient) {
  try {
    await blobClient.getProperties();
    return true;
  } catch (error) {
    if (isNotFoundError(error)) {
      return false;
    }
    throw error;
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const workers = [];
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      await mapper(items[index], index);
    }
  }

  for (let i = 0; i < Math.min(concurrency, items.length); i += 1) {
    workers.push(worker());
  }

  await Promise.all(workers);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const connectionString = getStorageConnectionString();
  if (!connectionString) {
    throw new Error(
      'Missing storage connection string. Set BLOB_STORAGE_CONNECTION_STRING (or AZURE_STORAGE_CONNECTION_STRING / AzureWebJobsStorage).'
    );
  }

  const slidesRoot = path.join(options.publicRoot, 'slides');
  const videosRoot = path.join(options.publicRoot, 'videos');

  const [hasSlidesRoot, hasVideosRoot] = await Promise.all([
    fileExists(slidesRoot),
    fileExists(videosRoot),
  ]);

  if (!hasSlidesRoot && !hasVideosRoot) {
    throw new Error(
      `No source folders found. Expected at least one of: ${slidesRoot}, ${videosRoot}`
    );
  }

  const sources = [];
  if (hasSlidesRoot) {
    sources.push({ prefix: 'slides', root: slidesRoot });
  }
  if (hasVideosRoot) {
    sources.push({ prefix: 'videos', root: videosRoot });
  }

  const serviceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = serviceClient.getContainerClient(options.container);

  const publicAccess = process.env.MEDIA_BLOB_PUBLIC_ACCESS === 'true' ? 'blob' : undefined;
  if (publicAccess) {
    await containerClient.createIfNotExists({ access: publicAccess });
  } else {
    await containerClient.createIfNotExists();
  }

  const targets = [];
  for (const source of sources) {
    const files = await collectFiles(source.root);
    for (const filePath of files) {
      targets.push({
        filePath,
        blobPath: toBlobPath(source.prefix, source.root, filePath),
      });
    }
  }

  if (targets.length === 0) {
    console.log('No media files found to upload.');
    return;
  }

  console.log(
    `Preparing ${targets.length} file(s) for container "${options.container}"` +
      (options.dryRun ? ' (dry-run)' : '')
  );

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];

  await mapWithConcurrency(targets, options.concurrency, async (target, index) => {
    const blobClient = containerClient.getBlockBlobClient(target.blobPath);
    try {
      if (!options.overwrite) {
        const exists = await blobExists(blobClient);
        if (exists) {
          skipped += 1;
          if ((index + 1) % 25 === 0 || index + 1 === targets.length) {
            console.log(`[${index + 1}/${targets.length}] skipped existing`);
          }
          return;
        }
      }

      if (!options.dryRun) {
        await blobClient.uploadFile(target.filePath, {
          blobHTTPHeaders: {
            blobContentType: getContentType(target.filePath),
          },
        });
      }

      uploaded += 1;
      if ((index + 1) % 10 === 0 || index + 1 === targets.length) {
        console.log(`[${index + 1}/${targets.length}] uploaded`);
      }
    } catch (error) {
      failed += 1;
      failures.push({
        blobPath: target.blobPath,
        message: error && error.message ? error.message : String(error),
      });
      console.error(`[${index + 1}/${targets.length}] failed: ${target.blobPath}`);
    }
  });

  const mediaBaseUrl = (process.env.MEDIA_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  const effectiveBaseUrl = mediaBaseUrl || containerClient.url;

  console.log('');
  console.log('Upload summary');
  console.log(`  Uploaded: ${uploaded}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Base URL: ${effectiveBaseUrl}`);
  console.log(`  Example : ${effectiveBaseUrl}/slides/...`);
  console.log(`  Example : ${effectiveBaseUrl}/videos/...`);

  if (failures.length > 0) {
    console.log('');
    console.log('Failures');
    for (const failure of failures.slice(0, 20)) {
      console.log(`  ${failure.blobPath}`);
      console.log(`    ${failure.message}`);
    }
    if (failures.length > 20) {
      console.log(`  ...and ${failures.length - 20} more`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exitCode = 1;
});
