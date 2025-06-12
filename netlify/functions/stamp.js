const fetch = require('node-fetch');
const { PDFDocument, StandardFonts } = require('pdf-lib');

function createErrorResponse(statusCode, message) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: message })
  };
}

function validatePageNumbers(pageNumbers, totalPages) {
  const invalidPages = pageNumbers.filter(num => num < 1 || num > totalPages);
  if (invalidPages.length > 0) {
    return `Page number(s) out of range: ${invalidPages.join(', ')}`;
  }
  return null;
}

function parsePages(str) {
  if (typeof str !== 'string') {
    throw new Error('Page input must be a string');
  }

  const pages = new Set();
  const trimmedStr = str.trim();
  if (!trimmedStr) {
    throw new Error('Page input cannot be empty');
  }

  trimmedStr.split(',').forEach(part => {
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
  console.log('Incoming event.body:', event.body);
  try {
    body = JSON.parse(event.body);
  } catch {
    return createErrorResponse(400, 'Invalid JSON payload');
  }

  const { pdfUrl, text, pages } = body;
  if (!pdfUrl || typeof pdfUrl !== 'string') {
    return createErrorResponse(400, 'Missing or invalid "pdfUrl"');
  }
  if (!text || typeof text !== 'string') {
    return createErrorResponse(400, 'Missing or invalid "text"');
  }
  if (!pages || typeof pages !== 'string') {
    return createErrorResponse(400, 'Missing or invalid "pages"');
  }

  let pageNumbers;
  try {
    pageNumbers = parsePages(pages);
  } catch (err) {
    return createErrorResponse(400, err.message);
  }

  console.log('Parsed pageNumbers:', pageNumbers);

  try {
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      return createErrorResponse(400, `Failed to download PDF (status ${response.status})`);
    }

    const pdfBytes = await response.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const allPages = pdfDoc.getPages();
    console.log('PDF loaded, total pages =', allPages.length);

    // Valideer paginanummers
    const validationError = validatePageNumbers(pageNumbers, allPages.length);
    if (validationError) {
      return createErrorResponse(400, validationError);
    }

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Verwerk dan alle pagina's
    for (const num of pageNumbers) {
      const page = allPages[num - 1];
      page.drawText(text, {
        x: 50,
        y: page.getHeight() - 50,
        size: 12,
        font
      });
    }

    const modifiedPdfBytes = await pdfDoc.save();
    const pdfBase64 = Buffer.from(modifiedPdfBytes).toString('base64');
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfBase64 })
    };
  } catch (err) {
    return createErrorResponse(500, err.message);
  }
};
