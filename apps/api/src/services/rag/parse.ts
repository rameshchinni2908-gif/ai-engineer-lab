/**
 * Parses an uploaded document's raw content into plain text.
 *
 * PDF parsing uses `pdf-parse` (v2, pure JS/pdf.js-based - no native
 * bindings, verified to install and run cleanly offline on Windows in this
 * repo). This route is JSON-only (no multipart file upload - see
 * `routes/rag/index.ts` for that decision): for `mimeType ===
 * "application/pdf"`, `text` is the BASE64-encoded PDF bytes (the frontend
 * reads the file client-side and base64-encodes it); for `md`/`txt`
 * (and anything else), `text` is already-decoded plain text passed through
 * untouched. A PDF that fails to parse (corrupted/encrypted/unsupported)
 * degrades gracefully: the document is still created, with an empty body
 * and a clear `metadata.parseWarning`, rather than failing the whole upload.
 */

export interface ParsedDocument {
  text: string;
  warning?: string;
}

const PAGE_FOOTER_RE = /\n--\s*\d+ of \d+\s*--\n?/g;

export async function parseDocumentInput(input: { mimeType: string; text: string }): Promise<ParsedDocument> {
  if (input.mimeType === "application/pdf") {
    try {
      const buffer = Buffer.from(input.text, "base64");
      if (buffer.length === 0) {
        return { text: "", warning: "Uploaded PDF content was empty after base64 decoding." };
      }
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        const cleaned = result.text.replace(PAGE_FOOTER_RE, "\n").trim();
        return { text: cleaned };
      } finally {
        await parser.destroy();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        text: "",
        warning: `PDF text extraction failed (${message}). Upload as .md or .txt for full support, or try a different PDF.`,
      };
    }
  }
  return { text: input.text };
}
