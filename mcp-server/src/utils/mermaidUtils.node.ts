import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import zlib from "zlib";
import { THEMES, cleanMermaidCode } from "./mermaidUtils.js";
export { THEMES, cleanMermaidCode };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = path.resolve(__dirname, "../../mermaid_error.log");

/**
 * Generates a Kroki.io image URL for a given mermaid code string.
 * Kroki uses zlib compression (deflate) + base64url which handles long diagrams better.
 * NODE-ONLY: Uses zlib.
 */
export const getKrokiImageUrl = (mermaidCode: string, format: 'svg' | 'png' = 'png'): string => {
  try {
    const cleanedCode = cleanMermaidCode(mermaidCode);
    const compressed = zlib.deflateSync(cleanedCode, { level: 9 });
    const base64url = compressed.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return `https://kroki.io/mermaid/${format}/${base64url}`;
  } catch (error) {
    console.error('[Archy] Error generating Kroki URL:', error);
    return '';
  }
};

/**
 * Generates a mermaid.ink image URL for a given mermaid code string.
 * Browser-safe implementation using btoa for base64 encoding.
 */
export const getMermaidInkUrl = (mermaidCode: string, themeId: keyof typeof THEMES = 'dark'): string => {
  try {
    const themeConfig = THEMES[themeId] || THEMES.dark;
    const styledCode = mermaidCode.trim();

    // Node-safe base64 encoding
    const base64 = Buffer.from(styledCode).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const bgColor = themeConfig.bg.replace('#', '');
    return `https://mermaid.ink/img/${base64}?theme=${themeConfig.config.theme}&bgColor=${bgColor}`;
  } catch (error) {
    console.error('[Archy] Error generating Mermaid.ink URL:', error);
    return '';
  }
};

/**
 * Attempts to fetch image from a URL and returns base64 result.
 */
async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': `ArchMind-MCP/${process.env.npm_package_version || '1.2.3'}`
      }
    });

    if (!response.ok) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString('base64');
  } catch {
    return null;
  }
}

/**
 * Logs error to file for debugging.
 */
function logError(url: string, status: number, body: string): void {
  const logMsg = `[${new Date().toISOString()}] URL: ${url}\nStatus: ${status}\nBody: ${body}\n\n`;
  try {
    fs.appendFileSync(LOG_FILE, logMsg);
  } catch (e) {
    console.error(`[Archy] Failed to write to log file: ${e}`);
  }
}

/**
 * Fetches the rendered image and returns it as a base64 string.
 * Tries multiple rendering services in order: kroki.io -> mermaid.ink
 * NODE-ONLY: Uses fs, path, Buffer, zlib.
 */
export const getMermaidImageBase64 = async (
  mermaidCode: string,
  themeId: keyof typeof THEMES = 'dark'
): Promise<{ data: string; mimeType: string; service?: string } | null> => {
  try {
    // 1. Try Kroki.io (deflate compression - better for complex diagrams)
    const krokiUrl = getKrokiImageUrl(mermaidCode, 'png');
    if (krokiUrl) {
      const krokiResult = await fetchImageAsBase64(krokiUrl);
      if (krokiResult) {
        return { data: krokiResult, mimeType: "image/png", service: 'kroki' };
      }
      // Log kroki failure for debugging
      try {
        const response = await fetch(krokiUrl);
        const body = await response.text().catch(() => 'Unable to read body');
        logError(krokiUrl, response.status, body);
      } catch { /* ignore */ }
    }

    // 2. Fallback to mermaid.ink (base64 encoding)
    const inkUrl = getMermaidInkUrl(mermaidCode, themeId);
    if (inkUrl) {
      const inkResult = await fetchImageAsBase64(inkUrl);
      if (inkResult) {
        return { data: inkResult, mimeType: "image/png", service: 'mermaid.ink' };
      }
      try {
        const response = await fetch(inkUrl);
        const body = await response.text().catch(() => 'Unable to read body');
        logError(inkUrl, response.status, body);
      } catch { /* ignore */ }
    }

    console.error('[Archy] All rendering services failed for mermaid code');
    return null;
  } catch (error: any) {
    console.error(`[Archy] Fatal error rendering mermaid:`, error.message);
    return null;
  }
};
