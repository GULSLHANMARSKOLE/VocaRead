export const extractTextFromPdf = async (file) => {
  if (!file) {
    return "";
  }

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Only PDF files are supported.");
  }

  return "PDF extraction is not implemented yet. Please upload a text file or another supported format.";
};
