const fetch = global.fetch || require('node-fetch');
const { PDFDocument, StandardFonts } = require('pdf-lib');

// Parse a string like "2-5,8,10-12" into an array of page numbers
function parsePages(str) {
  const pages = new Set();
  // split on commas
  for (const part of str.split(',')) {
    const trimmed = part.trim();
    const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start < 1 || end < start) {
        throw new Error(`Invalid page range: "${trimmed}"`);
      }
      for (let i = start; i <= end; i++) pages.add(i);
    } else {
      const num = Number(trimmed);
      if (!Number.isInteger(num) || num < 1) {
        throw new Error(`Invalid page number: "${trimmed}"`);
      }
      pages.add(num);
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}

exports.handler = async function (event) {
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON payload' }),
    };
  }

  const { pdfUrl, text, pages } = body;
  if (!pdfUrl || typeof pdfUrl !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid "pdfUrl"' }) };
  }
  if (!text || typeof text !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid "text"' }) };
  }
  if (!pages || typeof pages !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid "pages"' }) };
  }

  let pageNumbers;
  try {
    pageNumbers = parsePages(pages);
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: err.message }) };
  }

  try {
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Error(`Failed to download PDF (status ${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const allPages = pdfDoc.getPages();
    for (const num of pageNumbers) {
      if (num > allPages.length) {
        throw new Error(`Page number out of range: ${num}`);
      }
      const page = allPages[num - 1];
      page.drawText(text, {
        x: 50,
        y: page.getHeight() - 50,
        size: 12,
        font,
      });
    }

    const modifiedBytes = await pdfDoc.save();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfBase64: Buffer.from(modifiedBytes).toString('base64') }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};