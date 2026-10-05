// src/lib/payload.js — JSON/XML body helpers. Magnit accepts and returns both.

import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { MagnitCliError } from './errors.js';

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  ignoreDeclaration: true,
  removeNSPrefix: true,
  parseTagValue: false,
  isArray: (name) => name === 'DataRecord' || name === 'Field',
});

export const MIME = { json: 'application/json', xml: 'application/xml' };

/**
 * Parse a response body of unknown format. XML documents are unwrapped from their single root element.
 * Returns null for an empty body and the raw string if it is neither XML nor JSON.
 */
export function parseBody(text) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('<')) {
    const parsed = xmlParser.parse(trimmed);
    const keys = Object.keys(parsed);
    return keys.length === 1 ? parsed[keys[0]] : parsed;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

/** Case-insensitive property lookup — Magnit's casing differs between feeds (CorrelationId / correlationId). */
export function pick(obj, ...names) {
  if (obj === null || typeof obj !== 'object') return undefined;
  const wanted = names.map((n) => n.toLowerCase());
  const key = Object.keys(obj).find((k) => wanted.includes(k.toLowerCase()));
  return key === undefined ? undefined : obj[key];
}

/** Decide json vs xml from an explicit --format, else the file extension, else the content. */
export function detectFormat({ explicit, file, content }) {
  if (explicit) {
    const f = explicit.toLowerCase();
    if (!MIME[f]) throw new MagnitCliError(`Unknown format "${explicit}".`, 'Use --format json or --format xml.');
    return f;
  }
  if (file) {
    const ext = extname(file).toLowerCase();
    if (ext === '.xml') return 'xml';
    if (ext === '.json') return 'json';
  }
  if (content && content.trim().startsWith('<')) return 'xml';
  return 'json';
}

/** Read a payload file, check JSON parses, and report its format. */
export function readPayloadFile(file, explicitFormat) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch (error) {
    throw new MagnitCliError(`Cannot read payload file "${file}": ${error.message}`);
  }
  const format = detectFormat({ explicit: explicitFormat, file, content });
  if (format === 'json') {
    try {
      JSON.parse(content);
    } catch (error) {
      throw new MagnitCliError(`"${file}" is not valid JSON: ${error.message}`);
    }
  }
  return { content, format };
}
