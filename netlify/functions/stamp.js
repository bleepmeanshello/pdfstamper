// netlify/functions/stamp.js
import { PDFDocument, StandardFonts } from 'pdf-lib';

export const handler = async (event) => {
    try {
        // 1) payload uitlezen
        const { pdfUrl, text, pages } = JSON.parse(event.body || '{}');
        if (!pdfUrl) throw new Error('`pdfUrl` ontbreekt in de payload');
        if (!pages)  throw new Error('`pages` ontbreekt in de payload');

        // 2) PDF ophalen
        const res = await fetch(pdfUrl);
        if (!res.ok) throw new Error(`Kan PDF niet ophalen (status ${res.status})`);
        const arrayBuffer = await res.arrayBuffer();

        // 3) PDF laden en font embedden
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const font   = await pdfDoc.embedFont(StandardFonts.Helvetica);

        // 4) pagina-ranges parsen
        const ranges    = pages.split(',').map(r => r.trim());
        const pageCount = pdfDoc.getPageCount();

        // 5) tekst stempelen
        for (const range of ranges) {
            let [a, b] = range.split('-').map(n => parseInt(n, 10) - 1);
            if (isNaN(a)) continue;
            if (b === undefined) b = a;
            if (a < 0 || b < 0 || a >= pageCount || b >= pageCount) {
                console.warn(`Overslaan: pagina-range "${range}" ligt buiten 1–${pageCount}`);
                continue;
            }
            for (let i = a; i <= b; i++) {
                const page = pdfDoc.getPage(i);
                page.drawText(text, {
                    x: 20,
                    y: 20,
                    size: 12,
                    font,
                });
            }
        }

        // 6) gewijzigde PDF serializen
        const modifiedPdf = await pdfDoc.save();
        const pdfBase64   = Buffer.from(modifiedPdf).toString('base64');

        // 7) return Base64
        return {
            statusCode: 200,
            body: JSON.stringify({ pdfBase64 }),
        };

    } catch (err) {
        return {
            statusCode: err.message.startsWith('`') ? 400 : 500,
            body: JSON.stringify({ error: err.message }),
        };
    }
};