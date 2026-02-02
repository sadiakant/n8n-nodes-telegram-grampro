import fs from 'fs';
import path from 'path';

const srcIcons = 'src/nodes/icons';
const distIcons = 'dist/nodes/icons';

if (!fs.existsSync(srcIcons)) {
  console.log('No icons folder found, skipping asset copy');
  process.exit(0);
}

fs.mkdirSync(distIcons, { recursive: true });

for (const file of fs.readdirSync(srcIcons)) {
  fs.copyFileSync(
    path.join(srcIcons, file),
    path.join(distIcons, file)
  );
}

console.log('Icons copied successfully');
