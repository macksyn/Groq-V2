import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import { File as MegaFile } from 'megajs';
import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';

const SESSION_DIR = './sessions';
const SESSION_FILE = 'creds.json';

export class SessionManager {
  constructor() {
    this.sessionId = process.env.SESSION_ID;
    this.sessionPath = SESSION_DIR;
  }

  /**
   * Initialize session
   */
  async initialize() {
    await this.ensureSessionDir();

    if (this.sessionId && !await this.sessionExists()) {
      console.log(chalk.yellow('📥 Downloading session from Mega.nz...'));
      await this.downloadSession();
    }

    if (!await this.sessionExists()) {
      console.log(chalk.yellow('⚠️  No existing session found. QR code will be displayed.'));
    }
  }

  /**
   * Ensure session directory exists
   */
  async ensureSessionDir() {
    try {
      await fs.access(this.sessionPath);
    } catch {
      await fs.mkdir(this.sessionPath, { recursive: true });
    }
  }

  /**
   * Check if session exists
   */
  async sessionExists() {
    try {
      await fs.access(path.join(this.sessionPath, SESSION_FILE));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Download session from Mega.nz
   * Expected format: botName~fileId#decryptionKey
   */
  async downloadSession() {
    if (!this.sessionId) {
      throw new Error('SESSION_ID not provided');
    }

    try {
      // Parse SESSION_ID format
      const match = this.sessionId.match(/~(.+)#(.+)/);
      if (!match) {
        throw new Error('Invalid SESSION_ID format. Expected: botName~fileId#key');
      }

      const [, fileId, key] = match;
      const megaUrl = `https://mega.nz/file/${fileId}#${key}`;

      console.log(chalk.blue(`📥 Downloading from: ${megaUrl}`));

      const file = MegaFile.fromURL(megaUrl);
      await new Promise((resolve, reject) => {
        file.loadAttributes((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const buffer = await file.downloadBuffer();
      
      // Save session file
      await fs.writeFile(
        path.join(this.sessionPath, SESSION_FILE),
        buffer
      );

      console.log(chalk.green('✅ Session downloaded successfully'));
    } catch (error) {
      console.error(chalk.red('❌ Failed to download session:'), error.message);
      throw error;
    }
  }

  /**
   * Get authentication state
   */
  async getAuthState() {
    return await useMultiFileAuthState(this.sessionPath);
  }

  /**
   * Clean session directory
   */
  async cleanSession() {
    try {
      const files = await fs.readdir(this.sessionPath);
      for (const file of files) {
        await fs.unlink(path.join(this.sessionPath, file));
      }
      console.log(chalk.green('✅ Session cleaned'));
    } catch (error) {
      console.error(chalk.red('❌ Failed to clean session:'), error);
    }
  }
}
