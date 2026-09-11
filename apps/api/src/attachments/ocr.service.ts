import { Injectable, Logger } from '@nestjs/common';
import { createWorker } from 'tesseract.js';
import pdfParse from 'pdf-parse';
import * as fs from 'fs/promises';

export interface ExtractionField<T> {
  value: T | null;
  confidence: number;
}

export interface ExtractionResult {
  status: 'COMPLETE' | 'FAILED' | 'UNSUPPORTED';
  rawText: string;
  vendor: ExtractionField<string>;
  amount: ExtractionField<number>;
  date: ExtractionField<string>;
  currency: ExtractionField<string>;
}

const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const AMOUNT_KEYWORD_RE = /(total|amount due|grand total|balance due)[^0-9]{0,15}([\d,]+\.\d{2})/i;
const AMOUNT_FALLBACK_RE = /(?:LKR|Rs\.?|USD|\$|€|EUR)?\s?([\d]{1,3}(?:,\d{3})*\.\d{2})/g;
const DATE_RES: RegExp[] = [
  /\b(\d{4}-\d{2}-\d{2})\b/, // 2026-09-11
  /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/, // 11/09/2026
  /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i,
];
const CURRENCY_RE = /\b(LKR|USD|EUR|GBP|Rs\.?)\b|\$|€|£/i;
const CURRENCY_MAP: Record<string, string> = { rs: 'LKR', 'rs.': 'LKR', $: 'USD', '€': 'EUR', '£': 'GBP' };

// Rules-only extraction: regex heuristics anchored on receipt/invoice
// conventions, each field scored so low-confidence guesses never silently
// overwrite what the user typed. No ML model, no external API call —
// keeps this self-hostable with zero paid dependencies.
@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  async extract(filePath: string, mimeType: string): Promise<ExtractionResult> {
    try {
      const rawText = await this.getRawText(filePath, mimeType);
      if (rawText === null) {
        return {
          status: 'UNSUPPORTED',
          rawText: '',
          vendor: { value: null, confidence: 0 },
          amount: { value: null, confidence: 0 },
          date: { value: null, confidence: 0 },
          currency: { value: null, confidence: 0 },
        };
      }

      return {
        status: 'COMPLETE',
        rawText,
        vendor: this.extractVendor(rawText),
        amount: this.extractAmount(rawText),
        date: this.extractDate(rawText),
        currency: this.extractCurrency(rawText),
      };
    } catch (err) {
      this.logger.warn(`OCR extraction failed for ${filePath}: ${err}`);
      return {
        status: 'FAILED',
        rawText: '',
        vendor: { value: null, confidence: 0 },
        amount: { value: null, confidence: 0 },
        date: { value: null, confidence: 0 },
        currency: { value: null, confidence: 0 },
      };
    }
  }

  private async getRawText(filePath: string, mimeType: string): Promise<string | null> {
    if (mimeType === 'application/pdf') {
      const buffer = await fs.readFile(filePath);
      const parsed = await pdfParse(buffer);
      // A near-empty text layer means this is a scanned/image-only PDF.
      // Rasterizing + OCRing scanned PDFs is a real feature on its own;
      // out of scope here, so we surface it as unsupported rather than
      // guessing on nothing.
      if (parsed.text.trim().length < 20) {
        return null;
      }
      return parsed.text;
    }

    if (IMAGE_MIME_TYPES.includes(mimeType)) {
      const worker = await createWorker('eng');
      try {
        const { data } = await worker.recognize(filePath);
        return data.text;
      } finally {
        await worker.terminate();
      }
    }

    return null;
  }

  private extractAmount(text: string): ExtractionField<number> {
    const keywordMatch = text.match(AMOUNT_KEYWORD_RE);
    if (keywordMatch) {
      return { value: parseFloat(keywordMatch[2].replace(/,/g, '')), confidence: 0.9 };
    }

    const candidates = [...text.matchAll(AMOUNT_FALLBACK_RE)].map((m) => parseFloat(m[1].replace(/,/g, '')));
    if (candidates.length === 0) return { value: null, confidence: 0 };
    return { value: Math.max(...candidates), confidence: 0.5 };
  }

  private extractDate(text: string): ExtractionField<string> {
    for (const re of DATE_RES) {
      const match = text.match(re);
      if (match) {
        const parsed = new Date(match[1]);
        if (!isNaN(parsed.getTime())) {
          return { value: parsed.toISOString().slice(0, 10), confidence: 0.8 };
        }
      }
    }
    return { value: null, confidence: 0 };
  }

  private extractVendor(text: string): ExtractionField<string> {
    const line = text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 2 && l.length < 60 && !/^\d+$/.test(l) && !DATE_RES.some((re) => re.test(l)));
    return line ? { value: line, confidence: 0.5 } : { value: null, confidence: 0 };
  }

  private extractCurrency(text: string): ExtractionField<string> {
    const match = text.match(CURRENCY_RE);
    if (!match) return { value: null, confidence: 0 };
    const token = match[0].toLowerCase();
    const code = CURRENCY_MAP[token] ?? match[0].toUpperCase();
    return { value: code, confidence: 0.6 };
  }
}
