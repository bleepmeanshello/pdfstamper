// netlify/functions/stamp.js
import { PDFDocument, StandardFonts } from 'pdf-lib';

export const handler = async (event) => {
    try {
        // 1) Pak pdfUrl, text en pages uit het request-body
        const { pdfUrl, text, pages } = JSON.parse(event.body || '{}');
        if (!pdfUrl) throw new Error('`pdfUrl` ontbreekt in de payload');
        if (!pages)  throw new Error('`pages` ontbreekt in de payload');

        // 2) Haal de PDF op
        const res = await fetch(pdfUrl);
        if (!res.ok) throw new Error(`Kan PDF niet ophalen (status ${res.status})`);
        const arrayBuffer = await res.arrayBuffer();
        const pdfBytes = Buffer.from(arrayBuffer);

        // 3) Laad de PDF in pdf-lib
        const pdfDoc = await PDFDocument.load(pdfBytes);

        // 4) Embed een font
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        // 5) Split op komma’s en parse elke “a-b” range
        const ranges    = pages.split(',').map(r => r.trim());
        const pageCount = pdfDoc.getPageCount();

        // 6) Voor elke range: stempel de tekst op de juiste pagina's
        for (const range of ranges) {
            // range als '2-5' of '7'
            let [a, b] = range.split('-').map(n => parseInt(n, 10) - 1);
            if (isNaN(a)) continue;      // skip lege of ongeldige stukken
            if (b === undefined) b = a; // één pagina

            // skip ranges buiten het document
            if (a < 0 || b < 0 || a >= pageCount || b >= pageCount) {
                console.warn(`Overslaan: pagina-range "${range}" ligt buiten 1–${pageCount}`);
                continue;
            }

            // stempel de tekst op alle pagina's in deze range
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

        // 7) Sla de gewijzigde PDF op en geef hem als Base64 terug
        const modifiedPdf = await pdfDoc.save();
        const modifiedB64 = Buffer.from(modifiedPdf).toString('base64');

        return {
            statusCode: 200,
            body: JSON.stringify({ pdfBase64: modifiedB64 }),
        };

    } catch (err) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message }),
        };
    }
};