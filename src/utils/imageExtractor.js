export const extractTextFromImage = async (file) => {
  if (!file) {
    return "";
  }

  const validTypes = ["image/png", "image/jpeg", "image/jpg"];

  if (!validTypes.includes(file.type)) {
    throw new Error("Only PNG/JPG/JPEG images are supported.");
  }

  return "Image OCR is not implemented yet. Please upload a text file or another supported format.";
};
