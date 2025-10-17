import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import { File } from 'megajs';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class SessionManager {
  constructor(config) {
    this.config = config;
    this.sessionDir = path.join(__dirname, '../../sessions');
    this.credsPath = path.join(this.sessionDir, 'creds.json');
  }

  async initialize() {
    try {
      // Create session directory
      await fs.mkdir(this.sessionDir, { recursive: true });
      console.log(chalk.blue('📁 Session directory ready'));
      
      // Check if session already exists
      const sessionExists = await this.sessionExists();
      
      if (sessionExists) {
        console.log(chalk.green('✅ Existing session found, will use it'));
      } else if (this.config?.SESSION_ID) {
        console.log(chalk.yellow('📥 No existing session, attempting Mega download...'));
        const downloaded = await this.downloadSession();
        
        if (!downloaded) {
          console.log(chalk.yellow('💡 Will use QR code authentication on first connection'));
        }
      } else {
        console.log(chalk.yellow('⚠️ No SESSION_ID provided, will use QR code authentication'));
      }
      
    } catch (error) {
      console.log(chalk.yellow('⚠️ Session initialization warning:'), error.message);
    }
  }

  async sessionExists() {
    try {
      await fs.access(this.credsPath);
      return true;
    } catch {
      return false;
    }
  }

  async downloadSession() {
    const sessionId = this.config?.SESSION_ID;
    
    if (!sessionId) {
      console.log(chalk.yellow('📝 No SESSION_ID in config'));
      return false;
    }

    // Parse SESSION_ID format: BotName~fileId#key
    if (!sessionId.includes('~')) {
      console.log(chalk.red('❌ SESSION_ID missing ~ separator'));
      console.log(chalk.yellow(`📝 Format should be: BotName~fileId#key`));
      console.log(chalk.yellow(`📝 Got: ${sessionId}`));
      return false;
    }

    try {
      console.log(chalk.blue(`🔍 Parsing SESSION_ID...`));
      
      const parts = sessionId.split('~');
      if (parts.length !== 2) {
        throw new Error(`SESSION_ID should have exactly one ~ separator, got ${parts.length - 1}`);
      }

      const [botName, fileData] = parts;
      console.log(chalk.cyan(`  Bot Name: ${botName}`));
      console.log(chalk.cyan(`  File Data: ${fileData}`));

      if (!fileData || !fileData.includes('#')) {
        throw new Error(`File data missing # separator. Got: ${fileData}`);
      }

      const fileParts = fileData.split('#');
      if (fileParts.length !== 2) {
        throw new Error(`File data should have exactly one # separator, got ${fileParts.length - 1}`);
      }

      const [fileId, key] = fileParts;
      
      console.log(chalk.cyan(`  File ID: ${fileId} (${fileId.length} chars)`));
      console.log(chalk.cyan(`  Key: ${key.substring(0, 20)}... (${key.length} chars)`));

      // Validate lengths (be more lenient)
      if (!fileId || fileId.length < 6) {
        throw new Error(`File ID too short: "${fileId}" (${fileId.length} chars, need at least 6)`);
      }

      if (!key || key.length < 12) {
        throw new Error(`Key too short: "${key}" (${key.length} chars, need at least 12)`);
      }

      console.log(chalk.green('✅ SESSION_ID format valid'));
      console.log(chalk.yellow('📥 Downloading from Mega.nz...'));
      
      const megaUrl = `https://mega.nz/file/${fileId}#${key}`;
      console.log(chalk.cyan(`🔗 URL: ${megaUrl}`));
      
      const file = File.fromURL(megaUrl);

      const data = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Download timeout after 60 seconds'));
        }, 60000);

        file.download((error, downloadedData) => {
          clearTimeout(timeout);
          if (error) {
            reject(new Error(`Mega download failed: ${error.message}`));
          } else {
            resolve(downloadedData);
          }
        });
      });
      
      if (!data || data.length === 0) {
        throw new Error('Downloaded session data is empty');
      }

      console.log(chalk.cyan(`📦 Downloaded ${(data.length / 1024).toFixed(2)}KB`));

      // Validate JSON
      let parsedData;
      try {
        parsedData = JSON.parse(data);
        console.log(chalk.cyan(`✅ Valid JSON format`));
      } catch (parseError) {
        throw new Error(`Downloaded data is not valid JSON: ${parseError.message}`);
      }

      await fs.writeFile(this.credsPath, data);
      console.log(chalk.green('✅ Session file saved successfully'));
      return true;

    } catch (error) {
      console.log(chalk.red('❌ Session download failed:'));
      console.log(chalk.red(`   ${error.message}`));
      console.log(chalk.yellow('💡 Troubleshooting tips:'));
      console.log(chalk.yellow('   1. Verify SESSION_ID is correct: BotName~fileId#key'));
      console.log(chalk.yellow('   2. Check if Mega link still works: https://mega.nz/file/fileId#key'));
      console.log(chalk.yellow('   3. Ensure creds.json was properly uploaded to Mega'));
      console.log(chalk.yellow('   4. Will proceed with QR code authentication'));
      return false;
    }
  }

  async getAuthState() {
    return await useMultiFileAuthState(this.sessionDir);
  }

  async cleanSession() {
    try {
      const files = await fs.readdir(this.sessionDir);
      for (const file of files) {
        const filePath = path.join(this.sessionDir, file);
        try {
          const stats = await fs.lstat(filePath);
          if (stats.isFile()) {
            await fs.unlink(filePath);
          }
        } catch (fileError) {
          console.warn(chalk.yellow(`⚠️ Could not delete ${file}:`, fileError.message));
        }
      }
      console.log(chalk.yellow('🗑️ Session files cleaned'));
    } catch (error) {
      console.log(chalk.yellow('⚠️ Could not clean session:'), error.message);
    }
  }
}