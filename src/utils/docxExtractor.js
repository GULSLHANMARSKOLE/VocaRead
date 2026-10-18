export const extractTextFromDocx = async (file) => {
  if (!file) {
    return "";
  }

  if (!file.name.toLowerCase().endsWith(".docx")) {
    throw new Error("Only DOCX files are supported.");
  }

  return "DOCX extraction is not implemented yet. Please upload a text file or another supported format.";
};
