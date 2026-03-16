import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const sourcePath = path.join(rootDir, 'index.html');
const distPath = path.join(rootDir, 'dist', 'index.html');

function readFileOrFail(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${filePath}`);
  }

  return fs.readFileSync(filePath, 'utf8');
}

function extractTag(html, regex, label) {
  const match = html.match(regex);
  if (!match) {
    throw new Error(`Missing required ${label}`);
  }

  return match[0].replace(/\s+/g, ' ').trim();
}

function normalizeAttributeValue(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function extractMetaContent(html, name, label) {
  const regex = new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i');
  const match = html.match(regex);
  if (!match) {
    throw new Error(`Missing required ${label}`);
  }

  return normalizeAttributeValue(match[1]);
}

function extractLinkHref(html, rel, label) {
  const regex = new RegExp(`<link[^>]*rel=["']${rel}["'][^>]*href=["']([^"']+)["'][^>]*>`, 'i');
  const match = html.match(regex);
  if (!match) {
    throw new Error(`Missing required ${label}`);
  }

  return normalizeAttributeValue(match[1]);
}

function extractTitle(html) {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!match) {
    throw new Error('Missing required <title>');
  }

  return normalizeAttributeValue(match[1]);
}

function validateContract(sourceHtml, distHtml) {
  const source = {
    title: extractTitle(sourceHtml),
    description: extractMetaContent(sourceHtml, 'description', 'description meta tag'),
    themeColor: extractMetaContent(sourceHtml, 'theme-color', 'theme-color meta tag'),
    iconHref: extractLinkHref(sourceHtml, 'icon', 'icon link'),
    manifestHref: extractLinkHref(sourceHtml, 'manifest', 'manifest link'),
    noscript: extractTag(sourceHtml, /<noscript>[\s\S]*?<\/noscript>/i, 'noscript fallback'),
  };

  const dist = {
    title: extractTitle(distHtml),
    description: extractMetaContent(distHtml, 'description', 'description meta tag in dist'),
    themeColor: extractMetaContent(distHtml, 'theme-color', 'theme-color meta tag in dist'),
    iconHref: extractLinkHref(distHtml, 'icon', 'icon link in dist'),
    manifestHref: extractLinkHref(distHtml, 'manifest', 'manifest link in dist'),
    noscript: extractTag(distHtml, /<noscript>[\s\S]*?<\/noscript>/i, 'noscript fallback in dist'),
  };

  const diffs = [];

  for (const key of Object.keys(source)) {
    if (source[key] !== dist[key]) {
      diffs.push(`Mismatch for ${key}: source="${source[key]}" dist="${dist[key]}"`);
    }
  }

  if (diffs.length > 0) {
    throw new Error(`Head contract validation failed. ${diffs.join('; ')}`);
  }
}

try {
  const sourceHtml = readFileOrFail(sourcePath);
  const distHtml = readFileOrFail(distPath);

  validateContract(sourceHtml, distHtml);
  console.log('Head contract validation passed. Source and dist metadata are aligned.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
