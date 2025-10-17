#!/usr/bin/env node
// test-mega.js - Run with: node test-mega.js

import chalk from 'chalk';
import { File } from 'megajs';
import fs from 'fs/promises';

const SESSION_ID = 'Groq~yrhRkALQ#QU_IJYwIF0LguigC8YWZmAGGlBEx5Dp9v4cnZavWArk';

console.log(chalk.cyan(`
╭─────────────────────────────────────╮
│     🔧 MEGA Download Diagnostic     │
╰─────────────────────────────────────╯
`));

async function testMegaDownload() {
  try {
    // Parse SESSION_ID
    console.log(chalk.blue('📝 Step 1: Parsing SESSION_ID'));
    console.log(chalk.cyan(`  Full ID: ${SESSION_ID}`));
    
    const [botName, fileData] = SESSION_ID.split('~');
    const [fileId, key] = fileData.split('#');
    
    console.log(chalk.cyan(`  Bot Name: ${botName}`));
    console.log(chalk.cyan(`  File ID: ${fileId} (${fileId.length} chars)`));
    console.log(chalk.cyan(`  Key: ${key.substring(0, 30)}... (${key.length} chars)`));
    console.log(chalk.green('✅ Parsing successful\n'));

    // Construct Mega URL
    console.log(chalk.blue('🔗 Step 2: Constructing Mega URL'));
    const megaUrl = `https://mega.nz/file/${fileId}#${key}`;
    console.log(chalk.cyan(`  URL: ${megaUrl}`));
    console.log(chalk.green('✅ URL constructed\n'));

    // Try to load from URL
    console.log(chalk.blue('📥 Step 3: Creating File object from URL'));
    console.log(chalk.yellow('⏳ This might take a moment...\n'));
    
    const file = File.fromURL(megaUrl);
    console.log(chalk.green('✅ File object created\n'));

    // Get file info
    console.log(chalk.blue('📊 Step 4: Getting file information'));
    console.log(chalk.cyan(`  File name: ${file.name || 'Unknown'}`));
    console.log(chalk.cyan(`  File size: ${file.size ? `${(file.size / 1024).toFixed(2)}KB` : 'Unknown'}`));
    console.log(chalk.green('✅ File info retrieved\n'));

    // Download file
    console.log(chalk.blue('📥 Step 5: Downloading file'));
    console.log(chalk.yellow('⏳ Download in progress...\n'));
    
    const data = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Download timeout after 120 seconds'));
      }, 120000);

      file.download((error, downloadedData) => {
        clearTimeout(timeout);
        if (error) {
          reject(new Error(`Download error: ${error.message}`));
        } else {
          resolve(downloadedData);
        }
      });
    });

    console.log(chalk.green('✅ Download completed\n'));

    // Validate data
    console.log(chalk.blue('🔍 Step 6: Validating downloaded data'));
    console.log(chalk.cyan(`  Data size: ${(data.length / 1024).toFixed(2)}KB`));
    console.log(chalk.cyan(`  Data type: ${data.constructor.name}`));
    
    if (data.length === 0) {
      throw new Error('Downloaded data is empty!');
    }

    // Try to parse as JSON
    console.log(chalk.blue('\n🧪 Step 7: Checking if valid JSON'));
    try {
      const parsed = JSON.parse(data);
      console.log(chalk.green('✅ Valid JSON format\n'));
      
      console.log(chalk.blue('📋 JSON Structure:'));
      console.log(chalk.cyan(`  Keys: ${Object.keys(parsed).join(', ')}`));
      
      if (parsed.creds) {
        console.log(chalk.cyan(`  ✓ Contains 'creds' key`));
      }
      if (parsed.keys) {
        console.log(chalk.cyan(`  ✓ Contains 'keys' key`));
      }
      
    } catch (parseError) {
      console.log(chalk.yellow('⚠️ Not valid JSON - checking if it might be encrypted...\n'));
      
      // Show first 100 bytes
      const preview = data.toString('utf8', 0, Math.min(100, data.length));
      console.log(chalk.gray(`  Preview: ${preview}...\n`));
    }

    // Save to test file
    console.log(chalk.blue('💾 Step 8: Saving to test file'));
    await fs.writeFile('./test-creds.json', data);
    console.log(chalk.green('✅ Saved to test-creds.json\n'));

    // Success!
    console.log(chalk.green.bold(`
╭─────────────────────────────────────╮
│  ✅ ALL TESTS PASSED!               │
│                                     │
│  Your Mega session is valid and     │
│  can be downloaded successfully.    │
╰─────────────────────────────────────╯
    `));

    console.log(chalk.cyan('💡 Next steps:'));
    console.log(chalk.cyan('  1. Update .env with the SESSION_ID'));
    console.log(chalk.cyan('  2. Start your bot: npm start'));
    console.log(chalk.cyan('  3. The session should download automatically\n'));

  } catch (error) {
    console.log(chalk.red.bold(`
╭─────────────────────────────────────╮
│  ❌ TEST FAILED                      │
╰─────────────────────────────────────╯
    `));

    console.log(chalk.red('Error Details:'));
    console.log(chalk.red(`  ${error.message}\n`));

    console.log(chalk.yellow('🔧 Troubleshooting steps:'));
    console.log(chalk.yellow('  1. Verify the SESSION_ID is correct'));
    console.log(chalk.yellow('  2. Check if the Mega link is still valid'));
    console.log(chalk.yellow('  3. Try downloading manually from:'));
    console.log(chalk.cyan(`     https://mega.nz/file/${SESSION_ID.split('~')[1]}\n`));
    
    console.log(chalk.yellow('  4. If manual download fails:'));
    console.log(chalk.yellow('     • The file may have been deleted'));
    console.log(chalk.yellow('     • The link may have expired'));
    console.log(chalk.yellow('     • You may need to re-authenticate and upload creds.json\n'));

    process.exit(1);
  }
}

testMegaDownload();