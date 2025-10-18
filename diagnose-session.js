#!/usr/bin/env node
// diagnose-session.js

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const credsPath = path.join(__dirname, 'sessions', 'creds.json');

async function diagnoseSession() {
  console.log(chalk.cyan(`
╭─────────────────────────────────────╮
│     🔍 Session Diagnostic Tool      │
╰─────────────────────────────────────╯
`));

  try {
    // Check if creds.json exists
    console.log(chalk.blue('📋 Step 1: Checking session file...'));
    try {
      await fs.access(credsPath);
      console.log(chalk.green(`✅ Session file found at: ${credsPath}`));
    } catch {
      console.log(chalk.red(`❌ Session file not found at: ${credsPath}`));
      console.log(chalk.yellow('💡 Create a new session by scanning QR code'));
      return;
    }

    // Read and parse creds.json
    console.log(chalk.blue('\n📖 Step 2: Reading credentials...'));
    const credsData = await fs.readFile(credsPath, 'utf8');
    let creds;
    
    try {
      creds = JSON.parse(credsData);
      console.log(chalk.green('✅ Valid JSON format'));
    } catch (error) {
      console.log(chalk.red('❌ Invalid JSON in creds.json'));
      console.log(chalk.red(`Error: ${error.message}`));
      return;
    }

    // Check for essential keys
    console.log(chalk.blue('\n🔐 Step 3: Checking essential credentials...'));
    
    const checks = [
      { key: 'me', name: 'Bot Identity' },
      { key: 'registered', name: 'Registration Status' },
      { key: 'account', name: 'Account Info' },
      { key: 'signalIdentities', name: 'Signal Identities' },
      { key: 'deviceId', name: 'Device ID' },
      { key: 'phoneId', name: 'Phone ID' },
    ];

    for (const check of checks) {
      const has = check.key in creds;
      const status = has ? '✅' : '❌';
      console.log(chalk.cyan(`  ${status} ${check.name}: ${has ? 'Present' : 'Missing'}`));
    }

    // Check "me" object specifically
    console.log(chalk.blue('\n👤 Step 4: Checking bot identity...'));
    if (creds.me) {
      console.log(chalk.cyan(`  ID: ${creds.me.id || 'Not set'}`));
      console.log(chalk.cyan(`  Name: ${creds.me.name || 'Not set'}`));
      console.log(chalk.cyan(`  LID: ${creds.me.lid || 'Not set'}`));

      if (!creds.me.id) {
        console.log(chalk.red('  ⚠️ Bot ID is not set - this might be the issue!'));
      }
    } else {
      console.log(chalk.red('  ❌ "me" object is missing - session is invalid!'));
    }

    // Check registration
    console.log(chalk.blue('\n📱 Step 5: Checking registration...'));
    if (creds.registered) {
      console.log(chalk.green('  ✅ Bot is registered'));
    } else {
      console.log(chalk.red('  ❌ Bot is NOT registered'));
      console.log(chalk.yellow('  💡 Session needs to be re-authenticated'));
    }

    // Check account details
    console.log(chalk.blue('\n🔑 Step 6: Checking account keys...'));
    if (creds.account) {
      console.log(chalk.green('  ✅ Account details present'));
      if (creds.account.accountSignatureKey) {
        console.log(chalk.cyan(`  ✓ Signature key: ${creds.account.accountSignatureKey.substring(0, 20)}...`));
      }
    } else {
      console.log(chalk.red('  ❌ Account details missing'));
    }

    // Overall assessment
    console.log(chalk.blue('\n📊 Step 7: Overall Assessment\n'));
    
    const isValid = creds.me?.id && creds.registered && creds.account;
    
    if (isValid) {
      console.log(chalk.green.bold('✅ Session appears VALID\n'));
      console.log(chalk.cyan('Your session credentials look good. If messages'));
      console.log(chalk.cyan('are still being marked as "fromMe", try:'));
      console.log(chalk.yellow('\n  1. Delete sessions folder: rm -rf sessions/'));
      console.log(chalk.yellow('  2. Re-authenticate with QR code: npm start'));
      console.log(chalk.yellow('  3. Update your Mega session if using one\n'));
    } else {
      console.log(chalk.red.bold('❌ Session is INVALID\n'));
      console.log(chalk.red('Missing:'));
      if (!creds.me?.id) console.log(chalk.red('  • Bot ID'));
      if (!creds.registered) console.log(chalk.red('  • Registration'));
      if (!creds.account) console.log(chalk.red('  • Account details'));
      console.log(chalk.yellow('\n💡 Solution: Delete session and authenticate fresh\n'));
      console.log(chalk.yellow('  1. rm -rf sessions/'));
      console.log(chalk.yellow('  2. npm start'));
      console.log(chalk.yellow('  3. Scan QR code with WhatsApp\n'));
    }

    // Show raw me object for debugging
    console.log(chalk.blue('📋 Raw "me" object:'));
    console.log(chalk.gray(JSON.stringify(creds.me, null, 2)));

  } catch (error) {
    console.error(chalk.red('❌ Error:'), error.message);
  }
}

diagnoseSession();