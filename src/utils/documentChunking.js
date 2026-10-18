const DEFAULT_CHUNK_SIZE = 1400;
const DEFAULT_CHUNK_OVERLAP = 180;

function stableHash(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function splitParagraph(paragraph, maxChunkSize) {
  if (paragraph.length <= maxChunkSize) {
    return [paragraph];
  }

  const sentences = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [paragraph];
  const pieces = [];
  let buffer = "";

  for (const sentence of sentences) {
    const part = sentence.trim();

    if (buffer && buffer.length + part.length + 1 > maxChunkSize) {
      pieces.push(buffer);
      buffer = "";
    }

    if (part.length > maxChunkSize) {
      const words = part.split(/\s+/);
      for (const word of words) {
        if (buffer && buffer.length + word.length + 1 > maxChunkSize) {
          pieces.push(buffer);
          buffer = "";
        }
        buffer = buffer ? `${buffer} ${word}` : word;
      }
    } else {
      buffer = buffer ? `${buffer} ${part}` : part;
    }
  }

  if (buffer) {
    pieces.push(buffer);
  }

  return pieces;
}

function overlapTail(text, overlapSize) {
  if (!text || overlapSize <= 0) {
    return "";
  }

  const tail = text.slice(-overlapSize);
  const firstSpace = tail.search(/\s/);
  return firstSpace >= 0 ? tail.slice(firstSpace + 1).trim() : tail;
}

export function hashDocumentContent(text) {
  return stableHash(text.replace(/\r/g, "").trim());
}

export function chunkDocument(
  text,
  documentId,
  { chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP } = {},
) {
  const normalized = typeof text === "string" ? text.replace(/\r/g, "").trim() : "";

  if (!normalized) {
    return [];
  }

  const chunks = [];
  let section = "";
  let currentText = "";
  let currentSection = "";

  const emit = () => {
    const content = currentText.trim();

    if (!content) {
      return;
    }

    const chunkIndex = chunks.length;
    chunks.push({
      id: `${documentId}:${chunkIndex}:${stableHash(content)}`,
      documentId,
      text: content,
      chunkIndex,
      source: {
        ...(currentSection ? { section: currentSection } : {}),
        pageNumber: null,
        passageNumber: chunkIndex + 1,
      },
    });
  };

  const paragraphs = normalized.split(/\n\s*\n/);

  for (const rawParagraph of paragraphs) {
    const paragraph = rawParagraph.trim();

    if (!paragraph) {
      continue;
    }

    const heading = paragraph.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) {
      section = heading[1].trim();
    }

    for (const piece of splitParagraph(paragraph, chunkSize)) {
      const addition = currentText ? `\n\n${piece}` : piece;

      if (currentText && currentText.length + addition.length > chunkSize) {
        const tail = overlapTail(currentText, overlap);
        emit();
        currentText = tail ? `${tail}\n\n${piece}` : piece;
        currentSection = section;
      } else {
        currentText += addition;
        if (section) {
          currentSection = section;
        }
      }
    }
  }

  emit();
  return chunks;
}

export { DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE };
