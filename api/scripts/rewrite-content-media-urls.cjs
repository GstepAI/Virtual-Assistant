#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { BlobServiceClient } = require('@azure/storage-blob');

function printUsage() {
  console.log(
    [
      'Rewrite relative slide media URLs in content store to Blob base URL.',
      '',
      'Usage:',
      '  node scripts/rewrite-content-media-urls.cjs [options]',
      '',
      'Options:',
      '  --dry-run                 Show planned changes without saving',
      '  --source=<auto|file|blob> Content store source (default: auto)',
      '  --base-url=<url>          Public media base URL (defaults to MEDIA_PUBLIC_BASE_URL)',
      '  --file=<path>             Content store JSON path for file source',
      '  --container=<name>        Content store blob container',
      '  --blob=<name>             Content store blob name',
      '  --report=<path>           Write JSON change report (default: api/data/media-url-rewrite-report.json)',
      '  --no-report               Disable report file output',
      '  --help                    Show this help',
      '',
      'Environment:',
      '  MEDIA_PUBLIC_BASE_URL',
      '  CONTENT_STORE_BACKEND',
      '  CONTENT_STORE_BLOB_CONTAINER, CONTENT_STORE_BLOB_NAME',
      '  BLOB_STORAGE_CONNECTION_STRING (or AZURE_STORAGE_CONNECTION_STRING / AzureWebJobsStorage)',
    ].join('\n')
  );
}

function parseArgs(argv) {
  const apiRoot = path.resolve(__dirname, '..');
  const dataRoot = path.join(apiRoot, 'data');

  const options = {
    dryRun: false,
    source: 'auto',
    baseUrl: (process.env.MEDIA_PUBLIC_BASE_URL || '').trim(),
    filePath: path.join(dataRoot, 'content-store.json'),
    container:
      process.env.CONTENT_STORE_BLOB_CONTAINER ||
      process.env.CONTENT_BLOB_CONTAINER ||
      'bluecrow-content',
    blobName: process.env.CONTENT_STORE_BLOB_NAME || 'content-store.json',
    writeReport: true,
    reportPath: path.join(dataRoot, 'media-url-rewrite-report.json'),
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--no-report') {
      options.writeReport = false;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg.startsWith('--source=')) {
      const value = arg.slice('--source='.length).trim().toLowerCase();
      if (value === 'auto' || value === 'file' || value === 'blob') {
        options.source = value;
      }
      continue;
    }
    if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length).trim();
      continue;
    }
    if (arg.startsWith('--file=')) {
      const value = arg.slice('--file='.length).trim();
      if (value) {
        options.filePath = path.resolve(value);
      }
      continue;
    }
    if (arg.startsWith('--container=')) {
      const value = arg.slice('--container='.length).trim();
      if (value) {
        options.container = value;
      }
      continue;
    }
    if (arg.startsWith('--blob=')) {
      const value = arg.slice('--blob='.length).trim();
      if (value) {
        options.blobName = value;
      }
      continue;
    }
    if (arg.startsWith('--report=')) {
      const value = arg.slice('--report='.length).trim();
      if (value) {
        options.reportPath = path.resolve(value);
      }
      continue;
    }
  }

  options.baseUrl = options.baseUrl.replace(/\/+$/, '');
  return options;
}

function isAbsoluteUrl(value) {
  return /^(https?:)?\/\//i.test(value) || value.startsWith('data:');
}

function normalizeRelativePath(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (isAbsoluteUrl(trimmed)) {
    return null;
  }

  const normalized = trimmed
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');

  if (!normalized || normalized.includes('..')) {
    return null;
  }

  return normalized;
}

function rewriteIfRelative(value, baseUrl) {
  if (typeof value !== 'string') {
    return null;
  }

  const relativePath = normalizeRelativePath(value);
  if (!relativePath) {
    return null;
  }

  return `${baseUrl}/${relativePath}`;
}

function nowIso() {
  return new Date().toISOString();
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

function chooseSource(requestedSource, hasConnectionString) {
  if (requestedSource !== 'auto') {
    return requestedSource;
  }

  const backend = (process.env.CONTENT_STORE_BACKEND || '').trim().toLowerCase();
  if (backend === 'blob') {
    return 'blob';
  }
  if (backend === 'file') {
    return 'file';
  }
  return hasConnectionString ? 'blob' : 'file';
}

async function readJsonFile(filePath) {
  const raw = await fs.promises.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeJsonFile(filePath, value) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const serialized = JSON.stringify(value, null, 2);
  await fs.promises.writeFile(filePath, `${serialized}\n`, 'utf8');
}

async function readStoreFromBlob(connectionString, containerName, blobName) {
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blobClient = containerClient.getBlockBlobClient(blobName);
  const buffer = await blobClient.downloadToBuffer();
  return {
    store: JSON.parse(buffer.toString('utf8')),
    blobClient,
    containerClient,
  };
}

async function writeStoreToBlob(blobClient, store) {
  const serialized = `${JSON.stringify(store, null, 2)}\n`;
  await blobClient.upload(serialized, Buffer.byteLength(serialized), {
    blobHTTPHeaders: {
      blobContentType: 'application/json; charset=utf-8',
    },
  });
}

function collectSlideChanges(store, baseUrl, dryRun) {
  const fields = ['imageUrl', 'videoUrl'];
  const changes = [];
  const snapshots = [];

  if (Array.isArray(store?.slides)) {
    snapshots.push({ name: 'live', slides: store.slides });
  }

  // Backward-compatibility for legacy draft/published stores.
  if (Array.isArray(store?.draft?.slides)) {
    snapshots.push({ name: 'draft', slides: store.draft.slides });
  }
  if (Array.isArray(store?.published?.slides)) {
    snapshots.push({ name: 'published', slides: store.published.slides });
  }

  for (const snapshot of snapshots) {
    for (const slide of snapshot.slides) {
      for (const field of fields) {
        const before = slide[field];
        const after = rewriteIfRelative(before, baseUrl);
        if (!after || after === before) {
          continue;
        }

        changes.push({
          snapshot: snapshot.name,
          slideId: slide.id,
          field,
          from: before,
          to: after,
        });

        if (!dryRun) {
          slide[field] = after;
        }
      }
    }
  }

  return changes;
}

async function writeReport(reportPath, data) {
  await fs.promises.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.promises.writeFile(
    reportPath,
    `${JSON.stringify(data, null, 2)}\n`,
    'utf8'
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  if (!options.baseUrl || !/^https?:\/\//i.test(options.baseUrl)) {
    throw new Error(
      'A valid --base-url (http/https) is required, or set MEDIA_PUBLIC_BASE_URL.'
    );
  }

  const connectionString = getStorageConnectionString();
  const source = chooseSource(options.source, Boolean(connectionString));

  let store;
  let saveMode;
  let blobClient = null;
  let containerClient = null;

  if (source === 'file') {
    store = await readJsonFile(options.filePath);
    saveMode = `file:${options.filePath}`;
  } else {
    if (!connectionString) {
      throw new Error(
        'Blob source selected but no storage connection string is configured.'
      );
    }
    const blobLoad = await readStoreFromBlob(
      connectionString,
      options.container,
      options.blobName
    );
    store = blobLoad.store;
    blobClient = blobLoad.blobClient;
    containerClient = blobLoad.containerClient;
    saveMode = `blob:${containerClient.containerName}/${options.blobName}`;
  }

  const changes = collectSlideChanges(store, options.baseUrl, options.dryRun);
  const changeCounts = changes.reduce((acc, change) => {
    acc[change.snapshot] = (acc[change.snapshot] || 0) + 1;
    return acc;
  }, {});

  console.log(`Source: ${saveMode}`);
  console.log(`Base URL: ${options.baseUrl}`);
  console.log(`Changes detected: ${changes.length}`);
  if (Object.keys(changeCounts).length === 0) {
    console.log('  No matching slide URL fields found.');
  } else {
    for (const [snapshot, count] of Object.entries(changeCounts)) {
      console.log(`  ${snapshot} changes: ${count}`);
    }
  }

  if (changes.length > 0) {
    console.log('Sample changes:');
    for (const change of changes.slice(0, 12)) {
      console.log(
        `  [${change.snapshot}] ${change.slideId} ${change.field}: ${change.from} -> ${change.to}`
      );
    }
    if (changes.length > 12) {
      console.log(`  ...and ${changes.length - 12} more`);
    }
  }

  if (!options.dryRun && changes.length > 0) {
    store.updatedAt = nowIso();
    if (source === 'file') {
      await writeJsonFile(options.filePath, store);
    } else {
      await writeStoreToBlob(blobClient, store);
    }
    console.log('Content store updated.');
  } else if (options.dryRun) {
    console.log('Dry-run mode: no changes were written.');
  } else {
    console.log('No changes to write.');
  }

  if (options.writeReport) {
    const report = {
      generatedAt: nowIso(),
      source: saveMode,
      baseUrl: options.baseUrl,
      dryRun: options.dryRun,
      changes,
    };
    await writeReport(options.reportPath, report);
    console.log(`Report written: ${options.reportPath}`);
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exitCode = 1;
});
