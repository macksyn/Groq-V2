#!/usr/bin/env node
// test-plugins.js - Test plugin system without starting the bot

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGINS_DIR = path.join(__dirname, 'plugins');

console.log(chalk.cyan(`
╭─────────────────────────────────────╮
│  🔌 PLUGIN SYSTEM VALIDATOR         │
╰─────────────────────────────────────╯
`));

async function testPlugins() {
  try {
    // Read plugins directory
    console.log(chalk.blue('📂 Scanning plugins directory...'));
    const files = await fs.readdir(PLUGINS_DIR);
    const jsFiles = files.filter(f => f.endsWith('.js'));
    
    console.log(chalk.cyan(`   Found ${jsFiles.length} plugin files\n`));

    let passed = 0;
    let failed = 0;
    const errors = [];

    // Test each plugin
    for (const file of jsFiles) {
      const pluginPath = path.join(PLUGINS_DIR, file);
      
      try {
        // Import plugin
        const plugin = await import(`file://${pluginPath}?t=${Date.now()}`);
        
        // Validate structure
        const validation = validatePlugin(file, plugin.default);
        
        if (validation.valid) {
          console.log(chalk.green(`✅ ${file}`));
          console.log(chalk.gray(`   └ ${plugin.default.name} - ${plugin.default.description || 'No description'}`));
          passed++;
        } else {
          console.log(chalk.red(`❌ ${file}`));
          validation.errors.forEach(err => {
            console.log(chalk.red(`   └ ${err}`));
          });
          failed++;
          errors.push({ file, errors: validation.errors });
        }
        
      } catch (error) {
        console.log(chalk.red(`❌ ${file}`));
        console.log(chalk.red(`   └ ${error.message}`));
        failed++;
        errors.push({ file, errors: [error.message] });
      }
    }

    // Summary
    console.log(chalk.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.cyan.bold('📊 SUMMARY'));
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.green(`✅ Passed: ${passed}`));
    console.log(chalk.red(`❌ Failed: ${failed}`));
    console.log(chalk.cyan(`📦 Total: ${jsFiles.length}`));

    // Show categories
    const categories = await analyzeCategories(jsFiles);
    if (categories.size > 0) {
      console.log(chalk.cyan('\n📋 CATEGORIES:'));
      for (const [cat, count] of categories) {
        const icon = getCategoryIcon(cat);
        console.log(chalk.cyan(`   ${icon} ${cat}: ${count} plugin(s)`));
      }
    }

    // Show errors if any
    if (errors.length > 0) {
      console.log(chalk.red('\n\n⚠️  ERRORS FOUND:\n'));
      errors.forEach(({ file, errors: errs }) => {
        console.log(chalk.red(`❌ ${file}:`));
        errs.forEach(err => console.log(chalk.red(`   • ${err}`)));
        console.log();
      });
    }

    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

    if (failed === 0) {
      console.log(chalk.green.bold('🎉 All plugins are valid! You\'re ready to go!\n'));
      process.exit(0);
    } else {
      console.log(chalk.yellow.bold('⚠️  Fix the errors above before starting the bot.\n'));
      process.exit(1);
    }

  } catch (error) {
    console.error(chalk.red('❌ Fatal error:'), error);
    process.exit(1);
  }
}

/**
 * Validate plugin structure
 */
function validatePlugin(filename, plugin) {
  const errors = [];

  if (!plugin) {
    errors.push('Plugin does not export a default object');
    return { valid: false, errors };
  }

  // Check required fields
  if (!plugin.name || typeof plugin.name !== 'string') {
    errors.push('Missing or invalid "name" property (string required)');
  }

  if (!plugin.run || typeof plugin.run !== 'function') {
    errors.push('Missing or invalid "run" property (function required)');
  }

  // Check optional fields
  if (plugin.description && typeof plugin.description !== 'string') {
    errors.push('Invalid "description" property (must be string)');
  }

  if (plugin.aliases && !Array.isArray(plugin.aliases)) {
    errors.push('Invalid "aliases" property (must be array)');
  }

  if (plugin.category && typeof plugin.category !== 'string') {
    errors.push('Invalid "category" property (must be string)');
  }

  if (plugin.usage && typeof plugin.usage !== 'string') {
    errors.push('Invalid "usage" property (must be string)');
  }

  if (plugin.ownerOnly && typeof plugin.ownerOnly !== 'boolean') {
    errors.push('Invalid "ownerOnly" property (must be boolean)');
  }

  // Check run function signature
  if (plugin.run) {
    const runStr = plugin.run.toString();
    if (!runStr.includes('async')) {
      console.log(chalk.yellow(`   ⚠️  "${plugin.name}" run() is not async - consider making it async`));
    }
  }

  // Warn about template file
  if (filename === '_template.js') {
    console.log(chalk.yellow(`   ℹ️  Template file - not loaded by bot`));
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Analyze plugin categories
 */
async function analyzeCategories(files) {
  const categories = new Map();

  for (const file of files) {
    if (file === '_template.js') continue;

    try {
      const pluginPath = path.join(PLUGINS_DIR, file);
      const plugin = await import(`file://${pluginPath}?t=${Date.now()}`);
      
      if (plugin.default?.category) {
        const cat = plugin.default.category;
        categories.set(cat, (categories.get(cat) || 0) + 1);
      }
    } catch (error) {
      // Skip invalid plugins
    }
  }

  return categories;
}

/**
 * Get category icon
 */
function getCategoryIcon(category) {
  const icons = {
    general: '📱',
    owner: '👑',
    admin: '⚙️',
    utility: '🛠️',
    fun: '🎮',
    media: '🎬',
    download: '⬇️',
    search: '🔍',
    ai: '🤖',
    tools: '🔧',
    group: '👥',
    moderation: '🛡️',
    economy: '💰',
    games: '🎯',
    music: '🎵',
    info: 'ℹ️',
    system: '⚡'
  };

  return icons[category.toLowerCase()] || '📦';
}

// Run tests
testPlugins();
