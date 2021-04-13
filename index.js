const http = require('http');
const url = require('url');
const atob = require('atob');
const {PDFDocument, rgb} = require('pdf-lib');
const fetch = require('node-fetch');
const fontkit = require('@pdf-lib/fontkit');
const md5 = require('md5');

const blue = rgb(86 / 255, 107 / 255, 255 / 255)

const config = {
  port: process.env.PORT || 8088
}

fetch('https://github.com/googlefonts/opensans/raw/main/fonts/ttf/OpenSans-Regular.ttf').then((res) => res.arrayBuffer()).then(openSansBytes => {

  const server = http.createServer(async (req, res) => {
    const queryObject = url.parse(req.url, true).query;

    if (!queryObject.data) {
      return res.end('Howdy!')
    }


    const signature = JSON.parse(decodeURIComponent(atob(queryObject.data)));

    if (!signature.url.startsWith("https://psmb-neos-resources.hb.bizmrg.com/") && !signature.url.startsWith("https://sfi.ru/")) {
      throw new Error('Invalid URL')
    }

    const existingPdfBytes = await fetch(signature.url).then(res => res.arrayBuffer())

    const pdfDoc = await PDFDocument.load(existingPdfBytes)
    pdfDoc.registerFontkit(fontkit);
    const openSansFont = await pdfDoc.embedFont(openSansBytes);

    const pages = pdfDoc.getPages()
    const firstPage = pages[0]
    const {height} = firstPage.getSize()

    firstPage.drawRectangle({
      x: 25,
      y: height - 125,
      width: 320,
      height: 100,
      borderWidth: 2,
      borderColor: blue,
    })
    const title = 'Документ подписан простой электронной подписью\nДата и время подписания: ' + signature.signDate + '\nФИО подписавшего документ: ' + signature.signee + '\nДолжность: ' + signature.signeePosition + '\nУникальный программный ключ:\n' + md5(signature.signee)

    firstPage.drawText(title, {size: 10, font: openSansFont, x: 30, y: height - 40, color: blue, lineHeight: 15})
    const pdfBytes = await pdfDoc.save()

    res.statusCode = 200;
    res.contentType = "application/pdf"
    res.end(Buffer.from(pdfBytes))
  });

  server.listen(config.port, () => {
    console.info(`Server running at http://localhost:${config.port}/`);
  });
});
