import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function buildAndPrepare() {
  try {
    // Run the build command
    console.log('Running vite build...');
    const { stdout, stderr } = await execPromise('vite build');
    console.log(stdout);
    if (stderr) console.error(stderr);
    
    // Check where the files ended up
    const possibleDirs = ['build', 'dist', '.svelte-kit/output/client'];
    let sourceDir = null;
    
    for (const dir of possibleDirs) {
      const fullPath = path.join(__dirname, dir);
      if (fs.existsSync(fullPath)) {
        console.log(`Found build output in: ${dir}`);
        sourceDir = dir;
        break;
      }
    }
    
    if (!sourceDir) {
      throw new Error('Could not find build output directory');
    }
    
    // If the output is not in 'build', create or copy to 'build' directory
    if (sourceDir !== 'build') {
      const buildDir = path.join(__dirname, 'build');
      
      // Create build directory if it doesn't exist
      if (!fs.existsSync(buildDir)) {
        console.log('Creating build directory...');
        fs.mkdirSync(buildDir, { recursive: true });
      }
      
      // Copy files from source to build
      console.log(`Copying files from ${sourceDir} to build...`);
      copyDirectory(path.join(__dirname, sourceDir), buildDir);
      console.log('Files copied successfully!');
    }
    
    console.log('Build prepared for Firebase hosting!');
  } catch (error) {
    console.error('Error during build and prepare:', error);
    process.exit(1);
  }
}

// Helper function to copy directory recursively
function copyDirectory(source, destination) {
  // Create destination directory if it doesn't exist
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }
  
  // Get all files and directories in the source
  const entries = fs.readdirSync(source, { withFileTypes: true });
  
  // Process each entry
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);
    
    if (entry.isDirectory()) {
      // Recursively copy directories
      copyDirectory(sourcePath, destPath);
    } else {
      // Copy files
      fs.copyFileSync(sourcePath, destPath);
    }
  }
}

buildAndPrepare();
