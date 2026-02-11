const http = require("http");
const url = require("url");
const atob = require("atob");
const { PDFDocument, rgb } = require("pdf-lib");
const fetch = require("node-fetch");
const fontkit = require("@pdf-lib/fontkit");

const pipe =
  (...funcs) =>
  (firstArg) =>
    funcs.reduce((acc, curr) => curr(acc), firstArg);

const makeCompensateRotation =
  ({ pageRotation, dimensions }) =>
  ({ x, y, height }) =>
    pipe(
      () => {
        if (pageRotation.angle === 90) {
          return {
            x: y + height,
            y: dimensions.height - x,
          };
        } else if (pageRotation.angle === 180) {
          return {
            x: dimensions.width - x,
            y: dimensions.height - y - height,
          };
        } else if (pageRotation.angle === 270) {
          return {
            x: dimensions.width - y - height,
            y: x,
          };
        }

        return {
          x,
          y: y + height,
        };
      },
      ({ x, y }) => ({ x, y: dimensions.height - y }),
    )();

const blue = rgb(86 / 255, 107 / 255, 255 / 255);

const config = {
  port: process.env.PORT || 8088,
};

fetch(
  "https://github.com/googlefonts/opensans/raw/main/fonts/ttf/OpenSans-Regular.ttf",
)
  .then((res) => res.arrayBuffer())
  .then((openSansBytes) => {
    const server = http.createServer(async (req, res) => {
      try {
        const queryObject = url.parse(req.url, true).query;

        if (!queryObject.data) {
          return res.end("Howdy!");
        }


        const signature = JSON.parse(decodeURIComponent(atob(queryObject.data)));

        if (
          !signature.url ||
          (!signature.url.startsWith(
            "https://psmb-neos-resources.hb.bizmrg.com/",
          ) &&
            !signature.url.startsWith("https://sfi.ru/"))
        ) {
          res.statusCode = 400;
          return res.end("Invalid URL");
        }


        if (!signature.url.toLowerCase().endsWith(".pdf")) {
          res.statusCode = 400;
          return res.end("Not a PDF file");
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        let pdfResponse;
        try {
          pdfResponse = await fetch(signature.url, { signal: controller.signal });
        } finally {
          clearTimeout(timeout);
        }


        if (!pdfResponse.ok) {
          res.statusCode = 404;
          return res.end("PDF not found: " + pdfResponse.status);
        }


        const existingPdfBytes = await pdfResponse.arrayBuffer();

        if (!existingPdfBytes || existingPdfBytes.byteLength === 0) {
          res.statusCode = 404;
          return res.end("Empty PDF response");
        }


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
          width: 350,
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
          signature.signKey;

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
        res.setHeader("Content-Type", "application/pdf");
        res.end(Buffer.from(pdfBytes));
      } catch (err) {
        console.error("Error processing request:", err.message);
        if (!res.headersSent) {
          res.statusCode = err.name === "AbortError" ? 504 : 500;
          res.end(err.name === "AbortError" ? "PDF fetch timed out" : "Error: " + err.message);
        }

      }
    });

    server.listen(config.port, () => {
      console.info(`Server running at http://localhost:${config.port}/`);
    });
  });
