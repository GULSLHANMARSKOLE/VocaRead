
import { useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth";
import { createWorker } from "tesseract.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

function FileUploader({ onTextExtracted }) {
  const [isLoading, setIsLoading] = useState(false);

  const extractPdfText = async (file) => {
    const pdf = await pdfjsLib.getDocument({
      data: await file.arrayBuffer(),
    }).promise;

    const pages = [];
    let ocrWorker = null;

    const imageOperations = new Set(
      [
        "paintImageXObject",
        "paintInlineImageXObject",
        "paintImageMaskXObject",
        "paintImageMaskXObjectGroup",
        "paintSolidColorImageMask",
      ]
        .map((name) => pdfjsLib.OPS[name])
        .filter((operation) => operation !== undefined),
    );

    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();

        const pageText = content.items
          .map((item) =>
            "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
          )
          .join("")
          .trim();

        const operators = await page.getOperatorList();
        const containsImages = operators.fnArray.some((operation) =>
          imageOperations.has(operation),
        );

        let finalPageText = pageText;

        if (containsImages || !pageText) {
          if (!ocrWorker) {
            ocrWorker = await createWorker("eng");
          }

          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);

          const context = canvas.getContext("2d");

          if (!context) {
            throw new Error("Unable to create PDF page canvas.");
          }

          try {
            await page.render({ canvasContext: context, viewport }).promise;
            const result = await ocrWorker.recognize(canvas);
            finalPageText = result.data.text.trim();
          } finally {
            canvas.width = 0;
            canvas.height = 0;
            canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
          }
        }

        pages.push(finalPageText);
      }

      return pages.join("\n\n").trim();
    } finally {
      if (ocrWorker) {
        await ocrWorker.terminate();
      }
    }
  };

  const extractDocxText = async (file) => {
    const result = await mammoth.extractRawText({
      arrayBuffer: await file.arrayBuffer(),
    });

    return result.value.trim();
  };

  const extractImageText = async (file) => {
    const worker = await createWorker("eng");

    try {
      const result = await worker.recognize(file);
      return result.data.text.trim();
    } finally {
      await worker.terminate();
    }
  };

  const handleFileUpload = async (event) => {
    const input = event.target;
    const file = input.files?.[0];

    if (!file) return;

    const name = file.name.toLowerCase();
    const isText = name.endsWith(".txt");
    const isPdf = name.endsWith(".pdf");
    const isDocx = name.endsWith(".docx");
    const isImage = /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(name);

    if (!isText && !isPdf && !isDocx && !isImage) {
      alert("Please upload a TXT, PDF, DOCX, PNG, JPG, JPEG, WEBP, BMP, TIF, or TIFF file.");
      input.value = "";
      return;
    }

    setIsLoading(true);

    try {
      let extractedText = "";

      if (isText) {
        extractedText = await file.text();
      } else if (isPdf) {
        extractedText = await extractPdfText(file);
      } else if (isDocx) {
        extractedText = await extractDocxText(file);
      } else if (isImage) {
        extractedText = await extractImageText(file);
      }

      if (!extractedText.trim()) {
        alert("No readable text was extracted. Try a clearer file or image.");
        return;
      }

      onTextExtracted(extractedText, file);
    } catch (error) {
      console.error("File extraction error:", {
        message: error?.message,
        name: error?.name,
      });
      alert(
        error?.message ||
          "Unable to extract text. Please check the file and try again.",
      );
    } finally {
      setIsLoading(false);
      input.value = "";
    }
  };

  return (
    <label
      className="upload-button"
      style={{
        opacity: isLoading ? 0.65 : 1,
        cursor: isLoading ? "wait" : "pointer",
      }}
    >
      <span>{isLoading ? "Extracting text..." : "📄 Upload File"}</span>

      <input
        type="file"
        accept=".txt,.pdf,.docx,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff"
        onChange={handleFileUpload}
        disabled={isLoading}
        hidden
      />
    </label>
  );
}

export default FileUploader;