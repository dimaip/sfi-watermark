const http = require("http");
const url = require("url");
const atob = require("atob");
const { PDFDocument, rgb, degrees } = require("pdf-lib");
const fetch = require("node-fetch");
const fontkit = require("@pdf-lib/fontkit");
const md5 = require("md5");

const makeCompensateRotation = ({ pageRotation, dimensions }) => ({
  x,
  y,
  height,
}) => {
  let drawX = null;
  let drawY = null;
  if (pageRotation.angle === 90) {
    drawX = y + height;
    drawY = dimensions.height - x;
  } else if (pageRotation.angle === 180) {
    drawX = dimensions.width - x;
    drawY = dimensions.height - y - height;
  } else if (pageRotation.angle === 270) {
    drawX = dimensions.width - y - height;
    drawY = x;
  } else {
    drawX = x;
    drawY = y;
  }
  return { x: drawX, y: dimensions.height - drawY };
};

const blue = rgb(86 / 255, 107 / 255, 255 / 255);

const config = {
  port: process.env.PORT || 8088,
};

fetch(
  "https://github.com/googlefonts/opensans/raw/main/fonts/ttf/OpenSans-Regular.ttf"
)
  .then((res) => res.arrayBuffer())
  .then((openSansBytes) => {
    const server = http.createServer(async (req, res) => {
      const queryObject = url.parse(req.url, true).query;

      if (!queryObject.data) {
        return res.end("Howdy!");
      }

      const signature = JSON.parse(decodeURIComponent(atob(queryObject.data)));

      if (
        !signature.url.startsWith(
          "https://psmb-neos-resources.hb.bizmrg.com/"
        ) &&
        !signature.url.startsWith("https://sfi.ru/")
      ) {
        throw new Error("Invalid URL");
      }

      const existingPdfBytes = await fetch(signature.url).then((res) =>
        res.arrayBuffer()
      );

      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      pdfDoc.registerFontkit(fontkit);
      const openSansFont = await pdfDoc.embedFont(openSansBytes);

      const pages = pdfDoc.getPages();
      const firstPage = pages[0];

      const { height } = firstPage.getSize();

      const dimensions = firstPage.getSize();
      const pageRotation = firstPage.getRotation();

      const compensateRotation = makeCompensateRotation({
        pageRotation,
        dimensions,
      });

      firstPage.drawRectangle({
        ...compensateRotation({
          x: 30,
          y: 30,
          height: 100,
        }),
        width: 320,
        height: 100,
        borderWidth: 2,
        borderColor: blue,
        rotate: pageRotation,
      });
      const title =
        "Документ подписан простой электронной подписью\nДата и время подписания: " +
        signature.signDate +
        "\nФИО подписавшего документ: " +
        signature.signee +
        "\nДолжность: " +
        signature.signeePosition +
        "\nУникальный программный ключ:\n" +
        md5(signature.signee);

      firstPage.drawText(title, {
        ...compensateRotation({
          x: 35,
          y: 35,
          height: 10,
        }),
        size: 10,
        font: openSansFont,
        color: blue,
        lineHeight: 15,
        rotate: pageRotation,
      });
      const pdfBytes = await pdfDoc.save();

      res.statusCode = 200;
      res.contentType = "application/pdf";
      res.end(Buffer.from(pdfBytes));
    });

    server.listen(config.port, () => {
      console.info(`Server running at http://localhost:${config.port}/`);
    });
  });
