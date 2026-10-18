export const normalizeText = (text = "") => {
  return text
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export const splitIntoSentences = (text = "") => {
  const normalized = normalizeText(text);

  if (!normalized) {
    return [];
  }

  return normalized
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) || [];
};

export const cleanTextForReading = (text = "") => {
  return normalizeText(text)
    .replace(/\s+/g, " ")
    .trim();
};
