import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('Current directory:', __dirname);
console.log('Checking for build output directories:');

const possibleDirs = ['build', 'dist', '.svelte-kit/output', '.svelte-kit/build'];

possibleDirs.forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  console.log(`Checking ${fullPath}`);
  if (fs.existsSync(fullPath)) {
    console.log(`✅ Directory exists: ${dir}`);
    
    // List contents
    const contents = fs.readdirSync(fullPath);
    console.log(`Contents: ${contents.join(', ')}`);
  } else {
    console.log(`❌ Directory does not exist: ${dir}`);
  }
});
