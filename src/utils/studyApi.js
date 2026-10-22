const API_BASE_URL = "/api/study";

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();

  if (!body.trim()) {
    throw new Error(`The study service returned an empty response (HTTP ${response.status}).`);
  }

  if (!contentType.toLowerCase().includes("json")) {
    throw new Error(
      `The study service returned a non-JSON response (HTTP ${response.status}). Restart the VocaRead backend and retry.`,
    );
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`The study service returned malformed JSON (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(data?.error || `Study request failed (HTTP ${response.status}).`);
  }

  return data;
}

async function postJson(path, body, signal) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      signal,
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw error;
    }
    throw new Error("Could not reach the VocaRead study backend on port 5000.", { cause: error });
  }

  return readJsonResponse(response);
}

export async function getStudyConfig(signal) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/config`, {
      credentials: "include",
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw error;
    }
    throw new Error("Could not reach the VocaRead study backend on port 5000.", { cause: error });
  }
  return readJsonResponse(response);
}

export function embedStudyChunks(chunks, signal) {
  return postJson("/embed-chunks", { chunks }, signal);
}

export function embedStudyQuestion(question, signal) {
  return postJson("/embed-question", { question }, signal);
}

export function askStudyQuestion(question, passages, signal) {
  return postJson("/answer", { question, passages }, signal);
}

export function generateStudyAssessment(document, questionCount, chunks, signal) {
  return postJson(
    "/generate-mcqs",
    {
      documentId: document.id,
      documentName: document.name,
      questionCount,
      chunks,
    },
    signal,
  );
}
