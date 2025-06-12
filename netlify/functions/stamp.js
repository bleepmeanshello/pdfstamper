const fetch = globalThis.fetch;
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { google } = require('googleapis');

function createErrorResponse(statusCode, message) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: message })
  };
}

function validatePageNumbers(pageNumbers, totalPages) {
  const invalid = pageNumbers.filter(n => n < 1 || n > totalPages);
  return invalid.length
      ? `Page number(s) out of range: ${invalid.join(', ')}`
      : null;
}

function parsePages(str) {
  if (typeof str !== 'string') throw new Error('Page input must be a string');
  const pages = new Set();
  str.trim().split(',').forEach(part => {
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const [_, s, e] = range.map(Number);
      if (s < 1 || e < s) throw new Error(`Invalid page range: "${part}"`);
      for (let i = s; i <= e; i++) pages.add(i);
    } else {
      const n = parseInt(part, 10);
      if (isNaN(n) || n < 1) throw new Error(`Invalid page number: "${part}"`);
      pages.add(n);
    }
  });
  return [...pages].sort((a, b) => a - b);
}

exports.handler = async function(event) {
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return createErrorResponse(400, 'Invalid JSON');
  }
  const { pdfUrl, text, pages, folderId, fileName } = body;
  if (!pdfUrl || !text || !pages || !folderId || !fileName) {
    return createErrorResponse(400, 'Missing one of: pdfUrl, text, pages, folderId, fileName');
  }
  let pageNumbers;
  try { pageNumbers = parsePages(pages); }
  catch (err) { return createErrorResponse(400, err.message); }

  try {
    const res = await fetch(pdfUrl);
    if (!res.ok) return createErrorResponse(400, `Failed download: ${res.status}`);
    const pdfBytes = await res.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const allPages = pdfDoc.getPages();
    const errMsg = validatePageNumbers(pageNumbers, allPages.length);
    if (errMsg) return createErrorResponse(400, errMsg);

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    for (const n of pageNumbers) {
      const p = allPages[n - 1];
      p.drawText(text, { x: 50, y: p.getHeight() - 50, size: 12, font });
    }

    const modified = await pdfDoc.save();

    // -- Google Drive upload --
    const creds = JSON.parse(process.env.GOOGLE_CREDS_JSON);
    const auth = new google.auth.JWT(
        creds.client_email,
        null,
        creds.private_key,
        ['https://www.googleapis.com/auth/drive']
    );
    const drive = google.drive({ version: 'v3', auth });

    const requestBody = {
      requestBody: { name: fileName, parents: [folderId] },
      media: { mimeType: 'application/pdf', body: Buffer.from(modified) },
      fields: 'id'
    };
    const upload = await drive.files.create(requestBody);

    return {
      statusCode: 200,
      body: JSON.stringify({ fileId: upload.data.id })
    };

  } catch (err) {
    return createErrorResponse(500, err.message);
  }
};
