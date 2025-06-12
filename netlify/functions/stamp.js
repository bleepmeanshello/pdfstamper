const { PDFDocument, StandardFonts } = require('pdf-lib');

function parsePages(str) {
  const pages = new Set();
  str.split(',').forEach(part => {
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (start < 1 || end < start) {
        throw new Error(`Invalid page range: "${part}"`);
      }
      for (let i = start; i <= end; i++) {
        pages.add(i);
      }
    } else {
      const num = parseInt(part, 10);
      if (isNaN(num) || num < 1) {
        throw new Error(`Invalid page number: "${part}"`);
      }
      pages.add(num);
    }
  });
  return Array.from(pages).sort((a, b) => a - b);
}

exports.handler = async function(event) {
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON payload' })
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
    const pdfBytes = await response.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const allPages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    pageNumbers.forEach(num => {
      if (num < 1 || num > allPages.length) {
        throw new Error(`Page number out of range: ${num}`);
      }
      const page = allPages[num - 1];
      page.drawText(text, {
        x: 50,
        y: page.getHeight() - 50,
        size: 12,
        font
      });
    });

    const modifiedPdfBytes = await pdfDoc.save();
    const pdfBase64 = Buffer.from(modifiedPdfBytes).toString('base64');
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfBase64 })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};