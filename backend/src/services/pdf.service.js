import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import logger from '../config/logger.js';

export class PdfService {
  /**
   * Wraps pdf-parse so tests can spy on this method instead of mocking CJS require.
   * Note: This uses the modern class-based API of pdf-parse (v2.4.5+).
   */
  static async basicParse(buffer) {
    try {
      const instance = new pdfParse.PDFParse({ data: buffer });
      const result = await instance.getText();
      const text = result.text || '';
      logger.info(`Basic PDF extraction result: ${text.length} characters`);
      return text;
    } catch (error) {
      logger.error(`pdf-parse failed: ${error.message}`);
      return '';
    }
  }

  static normalizeText(text) {
    return text
      // Replace non-breaking spaces and other whitespace variations with standard space
      .replace(/[\s\u00A0]+/g, ' ')
      // Clean up common header/footer junk (basic heuristic)
      .replace(/(?:page|pg\.?)\s*\d+/gi, '')
      .trim();
  }

  static async extractTextLayoutAware(buffer) {
    try {
      // Set worker source for Node.js (uses the top-level require already declared)
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
      }

      const data = new Uint8Array(buffer);
      const loadingTask = pdfjsLib.getDocument({
        data,
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true,
        disableFontFace: true,
      });

      const pdf = await loadingTask.promise;
      logger.info(`Layout-aware PDF loaded: ${pdf.numPages} pages`);
      let fullText = '';

      const numPages = Math.min(2, pdf.numPages);

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1.0 });
        const midPoint = viewport.width / 2;

        const items = textContent.items.filter(item => item.str.trim().length > 0);

        const leftColumn = [];
        const rightColumn = [];

        items.forEach(item => {
          const x = item.transform[4];
          const y = item.transform[5];
          if (x < midPoint) {
            leftColumn.push({ str: item.str, y });
          } else {
            rightColumn.push({ str: item.str, y });
          }
        });

        leftColumn.sort((a, b) => b.y - a.y);
        rightColumn.sort((a, b) => b.y - a.y);

        const joinItems = (colItems) => {
          if (colItems.length === 0) return '';
          let out = '';
          let lastY = colItems[0].y;
          colItems.forEach(item => {
            out += (Math.abs(lastY - item.y) > 10) ? '\n' : ' ';
            out += item.str;
            lastY = item.y;
          });
          return out.trim();
        };

        fullText += joinItems(leftColumn) + '\n\n' + joinItems(rightColumn) + '\n\n';
      }

      return fullText;
    } catch (error) {
      logger.error(`Layout-aware extraction failed: ${error.message}`);
      return '';
    }
  }

  static tryExtractAbstractFromText(text) {
    const normalized = this.normalizeText(text);

    // Boundaries: Abstract, ABSTRACT, Abstract—, Abstract., Abstract:
    // Endings: Introduction, 1 Introduction, I. Introduction, 1., Keywords, Index Terms, CCS Concepts, References
    const abstractRegex = /(?:abstract—|abstract\.|abstract:|abstract)\s*(.*?)(?=\b(?:1\.\s*|i\.\s*|1\s*)?introduction\b|\bkeywords?\b|\bindex terms\b|\bccs concepts\b|\breference?s?\b|$)/is;

    let match = normalized.match(abstractRegex);
    let abstract = '';
    let source = 'abstract';

    if (match && match[1] && match[1].length > 100) {
      abstract = match[1].trim();
      // Cap length to avoid grabbing half the paper
      if (abstract.length > 2500) {
        abstract = abstract.substring(0, 2500) + '...';
      }
    } else {
      // Fallback strategy if structured abstract boundary is not found or is too short
      const fallbackRegex = /abstract\s*(.{500,2500})/is;
      const fallbackMatch = normalized.match(fallbackRegex);

      if (fallbackMatch && fallbackMatch[1]) {
        abstract = fallbackMatch[1].trim() + '...';
        source = 'fallback';
      } else {
        // If all else fails, take a safe chunk from the beginning
        abstract = normalized.substring(0, 1500).trim();
        if (abstract.length > 0) abstract += '...';
        source = 'fallback';
      }
    }

    logger.info(`tryExtractAbstractFromText: source=${source}, length=${abstract.length}`);

    if (abstract.length < 150) {
      return null; // Garbage
    }

    return { abstract, source };
  }

  /**
   * Parses the uploaded PDF buffer and extracts the abstract text.
   * Uses pdf-parse first, then falls back to layout-aware pdfjs-dist extraction
   * only when the basic parse yields no usable result.
   */
  static async extractAbstract(buffer) {
    let result = null;
    let basicText = '';

    try {
      basicText = await this.basicParse(buffer);
      if (basicText) {
        result = this.tryExtractAbstractFromText(basicText);
      }
    } catch (error) {
      logger.error(`Initial extraction pass failed: ${error.message}`);
    }

    // Determine if we need the expensive layout-aware path.
    // Only trigger when:
    //  1. Basic parse returned null (garbage / too short)
    //  2. Basic text didn't contain "abstract" at all (likely a column-merge issue)
    const hasAbstractMarker = /abstract/i.test(basicText);
    const needsLayoutFallback = !result || (!hasAbstractMarker && result.source === 'fallback');

    if (needsLayoutFallback) {
      try {
        const layoutStart = Date.now();
        const layoutText = await this.extractTextLayoutAware(buffer);
        const layoutMs = Date.now() - layoutStart;
        logger.info(`Layout-aware PDF extraction completed in ${layoutMs}ms`);

        const layoutResult = this.tryExtractAbstractFromText(layoutText);

        // If layout aware produced a better structured abstract, prefer it
        if (layoutResult && layoutResult.source === 'abstract') {
          return { abstract: layoutResult.abstract, source: 'layout-aware' };
        }

        // If basic failed completely but layout succeeded with fallback, use layout
        if (!result && layoutResult) {
          return { abstract: layoutResult.abstract, source: 'layout-aware-fallback' };
        }
      } catch (error) {
        // Silently continue if layout-aware extraction fails
      }
    }

    if (!result) {
      const basicLen = (basicText || '').length;
      logger.error(`Abstract extraction failed. Basic text length: ${basicLen}`);
      throw new Error(`Could not confidently extract a meaningful abstract from this document. (Extracted text length: ${basicLen}). Please ensure the PDF contains selectable text and not just images.`);
    }

    return result;
  }
}
