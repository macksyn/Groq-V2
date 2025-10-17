import { MongoClient } from 'mongodb';
import chalk from 'chalk';

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

export class MongoManager {
  constructor() {
    this.uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
    this.dbName = process.env.MONGO_DBNAME || 'groqbot';
    this.client = null;
    this.db = null;
  }

  /**
   * Connect to MongoDB with retry logic
   */
  async connect(retryCount = 0) {
    try {
      this.client = new MongoClient(this.uri, {
        maxPoolSize: 20,
        minPoolSize: 5,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      await this.client.connect();
      this.db = this.client.db(this.dbName);

      // Test connection
      await this.db.admin().ping();

      console.log(chalk.green(`✅ MongoDB connected to: ${this.dbName}`));
    } catch (error) {
      console.error(chalk.red(`❌ MongoDB connection failed (Attempt ${retryCount + 1}/${MAX_RETRIES}):`), error.message);

      if (retryCount < MAX_RETRIES - 1) {
        console.log(chalk.yellow(`⏳ Retrying in ${RETRY_DELAY / 1000}s...`));
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return await this.connect(retryCount + 1);
      }

      throw new Error('Failed to connect to MongoDB after maximum retries');
    }
  }

  /**
   * Get database instance
   */
  getDB() {
    if (!this.db) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }
    return this.db;
  }

  /**
   * Get collection
   */
  getCollection(name) {
    return this.getDB().collection(name);
  }

  /**
   * Close connection
   */
  async close() {
    if (this.client) {
      await this.client.close();
      console.log(chalk.yellow('🔌 MongoDB disconnected'));
    }
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.client && this.db;
  }
}
