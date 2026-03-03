const fs = require('fs/promises');
const path = require('path');

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyWithFallback(sourcePath, targetPath) {
  if (await exists(sourcePath)) {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(sourcePath, targetPath);
    return `copied ${sourcePath} -> ${targetPath}`;
  }

  if (await exists(targetPath)) {
    return `kept existing ${targetPath} (source missing: ${sourcePath})`;
  }

  throw new Error(
    `Missing required config file. Source not found: ${sourcePath}; target also missing: ${targetPath}`
  );
}

async function main() {
  const apiRoot = path.resolve(__dirname, '..');
  const projectRoot = path.resolve(apiRoot, '..');
  const sourceConfigRoot = path.join(projectRoot, 'config');
  const targetConfigRoot = path.join(apiRoot, 'config');

  const tasks = [
    {
      source: path.join(sourceConfigRoot, 'slides.json'),
      target: path.join(targetConfigRoot, 'slides.json'),
    },
    {
      source: path.join(sourceConfigRoot, 'roomConfigurations.json'),
      target: path.join(targetConfigRoot, 'roomConfigurations.json'),
    },
  ];

  for (const task of tasks) {
    const result = await copyWithFallback(task.source, task.target);
    console.log(`[sync-config] ${result}`);
  }
}

main().catch((error) => {
  console.error(`[sync-config] ${error.message}`);
  process.exit(1);
});
