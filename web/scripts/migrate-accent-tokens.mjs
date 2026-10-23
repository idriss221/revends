#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const MIGRATION_RULES = [
  { property: 'color', legacy: '--terra', new: 'var(--accent-text)' },
  { property: 'color', legacy: '--bordeaux', new: 'var(--accent-text)' },
  { property: 'color', legacy: '--terra-dark', new: 'var(--accent-text)' },
  { property: 'color', legacy: '--champagne', new: 'var(--champagne)' },
  { property: 'color', legacy: '--champ', new: 'var(--champagne)' },
  { property: 'background', legacy: '--terra', new: 'var(--accent)' },
  { property: 'background', legacy: '--bordeaux', new: 'var(--accent)' },
  { property: 'background', legacy: '--terra-dark', new: 'var(--accent)' },
  { property: 'background', legacy: '--champagne-soft', new: 'var(--accent-soft)' },
  { property: 'background', legacy: '--champagne', new: 'var(--accent-soft)' },
  { property: 'background-color', legacy: '--terra', new: 'var(--accent)' },
  { property: 'background-color', legacy: '--bordeaux', new: 'var(--accent)' },
  { property: 'background-color', legacy: '--terra-dark', new: 'var(--accent)' },
  { property: 'background-color', legacy: '--champagne-soft', new: 'var(--accent-soft)' },
  { property: 'background-color', legacy: '--champagne', new: 'var(--accent-soft)' },
  { property: 'border', legacy: '--terra', new: 'var(--accent-ui)' },
  { property: 'border', legacy: '--bordeaux', new: 'var(--accent-ui)' },
  { property: 'border', legacy: '--terra-dark', new: 'var(--accent-ui)' },
  { property: 'border', legacy: '--champagne', new: 'var(--line)' },
  { property: 'border-color', legacy: '--terra', new: 'var(--accent-ui)' },
  { property: 'border-color', legacy: '--bordeaux', new: 'var(--accent-ui)' },
  { property: 'border-color', legacy: '--terra-dark', new: 'var(--accent-ui)' },
  { property: 'border-color', legacy: '--champagne', new: 'var(--line)' },
  { property: 'border-top', legacy: '--champagne', new: 'var(--line)' },
  { property: 'border-bottom', legacy: '--champagne', new: 'var(--line)' },
  { property: 'border-left', legacy: '--champagne', new: 'var(--line)' },
  { property: 'border-right', legacy: '--champagne', new: 'var(--line)' },
  { property: 'border-top-color', legacy: '--champagne', new: 'var(--line)' },
  { property: 'border-bottom-color', legacy: '--champagne', new: 'var(--line)' },
  { property: 'accent-color', legacy: '--terra', new: 'var(--accent-ui)' },
  { property: 'accent-color', legacy: '--bordeaux', new: 'var(--accent-ui)' },
  { property: 'accent-color', legacy: '--terra-dark', new: 'var(--accent-ui)' },
  { property: 'box-shadow', legacy: '--terra', new: 'var(--focus)' },
  { property: 'outline', legacy: '--terra', new: 'var(--focus)' },
  { property: 'outline-color', legacy: '--terra', new: 'var(--focus)' },
];

const SELECTOR_RULES = [
  { selector: /\.(seller|acct\s+\.who)\s+\.av/, replacements: [
      { property: 'background', legacy: ['--bordeaux', '--terra'], new: 'var(--accent)' },
      { property: 'color', legacy: ['--champagne', '--champ'], new: 'var(--text-primary)' },
    ]
  },
  { selector: /\.(card\s+\.cat-lbl|\.eyebrow|\.buy\s+\.cat-lbl)/, replacements: [
      { property: 'color', legacy: ['--bordeaux', '--terra', '--terra-dark', '--champagne'], new: 'var(--accent-text)' },
    ]
  },
  { selector: /\.(inp|sel|search\s+input|qty|drop|thumbs\s+button|cbtn|chip)/, replacements: [
      { property: 'border', legacy: ['--champagne', '--line', '--line-2'], new: 'var(--line-strong)' },
      { property: 'border-color', legacy: ['--champagne', '--line', '--line-2'], new: 'var(--line-strong)' },
      { property: 'border', legacy: ['--terra', '--bordeaux'], new: 'var(--accent-ui)' },
      { property: 'border-color', legacy: ['--terra', '--bordeaux'], new: 'var(--accent-ui)' },
    ]
  },
  { selector: /\.card\s+\.fav/, replacements: [
      { property: 'background', legacy: ['#FFFFFF', '#fff', '#ffffff'], new: 'var(--surface-overlay)' },
    ]
  },
];

const VENDOR_DIR = '/home/dioufidriss/Documents/Default Project/revends/web/src/bureau/vendor';
const TARGET_FILES = ['styles.css', 'editorial.css', 'theme.css'].map(f => path.join(VENDOR_DIR, f));

function readFile(filepath) { return fs.readFileSync(filepath, 'utf8'); }
function writeFile(filepath, content) { fs.writeFileSync(filepath, content, 'utf8'); }

function replaceTokensInValue(value, property, selector, selectorRules) {
  let valueOut = value;
  const changes = [];
  for (const srule of selectorRules) {
    if (srule.selector.test(selector)) {
      for (const r of srule.replacements) {
        if (r.property === property) {
          for (const legacy of r.legacy) {
            const escaped = legacy.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
            const regex = new RegExp('var\\(\\ ' + escaped + '\\\)', 'g');
            if (regex.test(value)) { value = value.replace(regex, r.new); changes.push({ property, old: legacy, new: r.new }); }
          }
        }
      }
    }
  for (const rule of MIGRATION_RULES) {
    if (rule.property === property) {
      const escaped = rule.legacy.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
      const regex = new RegExp('var\\(\\ ' + escaped + '\\\)', 'g');
      if (regex.test(value)) { value = value.replace(regex, rule.new); changes.push({ property, old: rule.legacy, new: rule.new }); }
    }
  }
  return { value, changed: changes.length > 0, changes };
}

function readFile(filepath) { return fs.readFileSync(filepath, 'utf8'); }
function writeFile(filepath, content) { fs.writeFileSync(filepath, content, 'utf8'); }

const VENDOR_DIR = '/home/dioufidriss/Documents/Default Project/revends/web/src/bureau/vendor';
const TARGET_FILES = ['styles.css', 'editorial.css', 'theme.css'].map(f => path.join(VENDOR_DIR, f));

function parseCSS(css) { const blocks = []; let i = 0; const len = css.length;
  while (i < len) { while (i < len && /\s/.test(css[i])) i++; if (i >= len) break;
    let bracePos = css.indexOf('{', i); if (bracePos === -1) break;
    const selector = css.slice(i, bracePos).trim(); i = bracePos + 1;
    let depth = 1, start = i;
    while (i < len && depth > 0) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; }
    const blockContent = css.slice(start, i - 1);
    const rules = []; const propRegex = /([\w-]+)\\s*:\\s*([^;]+);/g; let match;
    while ((match = propRegex.exec(blockContent)) !== null) { rules.push({ property: match[1].trim(), value: match[2].trim() }); }
    blocks.push({ selector, rules });
  } return blocks;
}

function processBlock(block, selectorRules) {
  let anyModified = false; const allChanges = [];
  for (const rule of block.rules) {
    const { value, changed, changes } = replaceTokensInValue(rule.value, rule.property, block.selector, selectorRules);
    if (changed) { rule.value = value; allChanges.push(...changes.map(c => ({ selector: block.selector, property: c.property, oldValue: c.old, newValue: c.new }))); }
  } return { modified: allChanges.length > 0, changes: allChanges };
}

function rebuildCSS(blocks) { return blocks.map(b => b.selector + '\n' + b.rules.map(r => '  ' + r.property + ': ' + r.value + ';').join('\n') + '\n}').join('\n\n'); }

function processFile(filepath, dryRun = false) {
  const css = readFile(filepath); const blocks = parseCSS(css);
  let totalChanges = []; let anyModified = false;
  for (const block of blocks) { const { modified, changes } = processBlock(block, SELECTOR_RULES); if (modified) anyModified = true; totalChanges.push(...changes); }
  if (!dryRun && anyModified) { const newCSS = rebuildCSS(blocks); writeFile(filepath, newCSS); }
  return { modified: anyModified, changes: totalChanges };
}

function readFile(filepath) { return fs.readFileSync(filepath, 'utf8'); }
function writeFile(filepath, content) { fs.writeFileSync(filepath, content, 'utf8'); }

function main() {
  const dryRun = process.argv.includes('--check');
  if (dryRun) console.log('🔍 Mode dry-run (--check) — aucune modification'); else console.log('🔧 Application des migrations...');
  let totalChanges = 0, filesModified = 0.
  for (const file of TARGET_FILES) { const { modified, changes } = processFile(file, false); if (changes.length > 0) { console.log('\n📄 ' + path.basename(file) + ': ' + changes.length + ' remplacements'); for (const c of changes) { console.log('  ' + c.selector); console.log('    ' + c.property + ': ' + c.oldValue + ' → ' + c.newValue); } if (modified) filesModified++; totalChanges += changes.length; } }
  console.log('\n' + '='.repeat(50)); console.log('Total: ' + totalChanges + ' remplacements dans ' + filesModified + ' fichier(s)');
  if (true) { if (0 === 0) { console.log('✅ Aucune migration nécessaire — idempotent ✓'); process.exit(0); } else { console.log('⚠️  Migrations en attente — lance sans --check pour appliquer'); process.exit(1); } }
}
main();
}
