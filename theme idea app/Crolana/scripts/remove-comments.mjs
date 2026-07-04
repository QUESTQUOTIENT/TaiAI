#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');


const JS_LIKE = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs', '.d.ts', '.prisma'];
const CSS_LIKE = ['.css', '.scss', '.sass', '.less'];
const HTML_LIKE = ['.html', '.htm'];


const CONFIGS = {
  js: {
    patterns: [
      { start: '//', end: '\n' },
      { start: '/*', end: '*/' }
    ],
    stringQuotes: ['"', "'", '`']
  },
  css: {
    patterns: [
      { start: '/*', end: '*/' }
    ],
    stringQuotes: ['"', "'"]
  },
  html: {
    patterns: [
      { start: '<!--', end: '-->' }
    ],
    stringQuotes: ['"', "'", '`']
  }
};

function getConfig(ext) {
  if (JS_LIKE.includes(ext)) return CONFIGS.js;
  if (CSS_LIKE.includes(ext)) return CONFIGS.css;
  if (HTML_LIKE.includes(ext)) return CONFIGS.html;
  return null;
}


function findCommentRanges(text, patterns, stringQuotes) {
  const ranges = [];
  let inString = false;
  let stringChar = '';
  let commentStart = null;
  let commentEnd = null; 

  let i = 0;
  while (i < text.length) {
    if (inString) {
      
      if (text[i] === '\\' && i + 1 < text.length) {
        i += 2;
        continue;
      }
      if (text[i] === stringChar) {
        inString = false;
        stringChar = '';
      }
      i++;
      continue;
    }

    if (commentStart !== null) {
      
      if (commentEnd === '\n') {
        if (text[i] === '\n') {
          ranges.push({ start: commentStart, end: i });
          commentStart = null;
          commentEnd = null;
        }
        i++;
        continue;
      } else {
        if (text.startsWith(commentEnd, i)) {
          const endLen = commentEnd.length;
          ranges.push({ start: commentStart, end: i + endLen });
          commentStart = null;
          commentEnd = null;
          i += endLen;
          continue;
        } else {
          i++;
          continue;
        }
      }
    } else {
      
      if (stringQuotes.includes(text[i])) {
        inString = true;
        stringChar = text[i];
        i++;
        continue;
      }

      
      let matched = false;
      for (const p of patterns) {
        if (text.startsWith(p.start, i)) {
          commentStart = i;
          commentEnd = p.end;
          i += p.start.length;
          matched = true;
          break;
        }
      }
      if (matched) {
        continue;
      }

      i++;
    }
  }

  
  if (commentStart !== null) {
    ranges.push({ start: commentStart, end: text.length });
  }

  return ranges;
}


function stripComments(text, config) {
  const ranges = findCommentRanges(text, config.patterns, config.stringQuotes);
  if (ranges.length === 0) return text;

  let last = 0;
  let result = '';
  for (const r of ranges) {
    result += text.slice(last, r.start);
    last = r.end;
  }
  result += text.slice(last);
  return result;
}


function processFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const config = getConfig(ext);
  if (!config) {
    return; 
  }

  const text = fs.readFileSync(filePath, 'utf8');
  let newText = text;

  
  if (ext === '.html' || ext === '.htm') {
    
    newText = newText.replace(/<script([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs, inner) => {
      const cleanedInner = stripComments(inner, CONFIGS.js);
      return `<script${attrs}>${cleanedInner}</script>`;
    });

    
    newText = newText.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (match, attrs, inner) => {
      const cleanedInner = stripComments(inner, CONFIGS.css);
      return `<style${attrs}>${cleanedInner}</style>`;
    });

    
    newText = stripComments(newText, CONFIGS.html);
  } else {
    
    newText = stripComments(text, config);
  }

  if (newText !== text) {
    fs.writeFileSync(filePath, newText, 'utf8');
    console.log(`Processed: ${path.relative(ROOT, filePath)}`);
  }
}


function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      
      const dirName = entry.name;
      if (dirName === 'node_modules' || dirName === 'dist' || dirName === 'build' ||
          dirName === '.git' || dirName === '.claude' ||
          dirName === 'infra' || dirName === '.next' ||
          dirName === 'coverage' || dirName === 'tmp' || dirName === 'temp') {
        continue;
      }
      walk(fullPath);
    } else if (entry.isFile()) {
      processFile(fullPath);
    }
  }
}


console.log('Starting comment removal...');
walk(ROOT);
console.log('Done.');
