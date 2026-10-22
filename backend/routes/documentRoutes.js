import express from "express";
import mongoose from "mongoose";
import UserData from "../models/UserData.js";
import requireAuth from "../middleware/requireAuth.js";

const router = express.Router();
const CATEGORIES = ["documents", "studyIndexes", "assessments", "assessmentAttempts"];

router.use(requireAuth);

function ownerFilter(req, category, recordId) {
  return {
    ownerId: new mongoose.Types.ObjectId(req.session.userId),
    category,
    ...(recordId ? { recordId } : {}),
  };
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function saveRecord(req, category, recordId, payload) {
  const record = await UserData.findOneAndUpdate(
    ownerFilter(req, category, recordId),
    { $set: { payload } },
    { upsert: true, returnDocument: "after", runValidators: true },
  ).lean();
  return record.payload;
}

async function getRecord(req, category, recordId) {
  const record = await UserData.findOne(ownerFilter(req, category, recordId)).lean();
  return record?.payload || null;
}

async function listRecords(req, category) {
  const records = await UserData.find(ownerFilter(req, category)).lean();
  return records.map((record) => record.payload);
}

function validId(id) {
  return typeof id === "string" && id.trim().length > 0 && id.length <= 160;
}

router.get("/documents", asyncRoute(async (req, res) => {
  const documents = await listRecords(req, "documents");
  documents.sort((first, second) =>
    (second.lastOpenedAt || second.updatedAt || "").localeCompare(
      first.lastOpenedAt || first.updatedAt || "",
    ),
  );
  return res.json({ documents });
}));

router.get("/documents/:id", asyncRoute(async (req, res) => {
  const document = await getRecord(req, "documents", req.params.id);
  return document
    ? res.json({ document })
    : res.status(404).json({ error: "The saved document could not be found." });
}));

router.post("/documents", asyncRoute(async (req, res) => {
  const document = req.body;
  if (!validId(document?.id) || typeof document?.name !== "string" || !document.name.trim()) {
    return res.status(400).json({ error: "A document ID and name are required." });
  }
  if (!(document.sourceText || "").trim() && !(document.structuredMarkdown || "").trim()) {
    return res.status(400).json({ error: "There is no document content to save." });
  }

  const existing = await getRecord(req, "documents", document.id);
  const now = new Date().toISOString();
  const saved = {
    ...existing,
    ...document,
    name: document.name.trim(),
    createdAt: existing?.createdAt || document.createdAt || now,
    updatedAt: now,
  };
  return res.json({ document: await saveRecord(req, "documents", saved.id, saved) });
}));

router.patch("/documents/:id", asyncRoute(async (req, res) => {
  const existing = await getRecord(req, "documents", req.params.id);
  if (!existing) return res.status(404).json({ error: "The saved document could not be found." });

  const allowedUpdates = [
    "name", "lastOpenedAt", "currentSentenceIndex", "sentenceCount",
    "readingSpeed", "readingProgress", "isCompleted",
  ];
  const updates = Object.fromEntries(
    allowedUpdates
      .filter((key) => Object.hasOwn(req.body || {}, key))
      .map((key) => [key, req.body[key]]),
  );
  if (Object.hasOwn(updates, "name")) {
    if (typeof updates.name !== "string" || !updates.name.trim()) {
      return res.status(400).json({ error: "A document name cannot be empty." });
    }
    updates.name = updates.name.trim();
  }
  const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  return res.json({ document: await saveRecord(req, "documents", req.params.id, updated) });
}));

router.delete("/documents/:id", asyncRoute(async (req, res) => {
  const documentId = req.params.id;
  const assessmentRecords = await UserData.find({
    ...ownerFilter(req, "assessments"),
    "payload.documentId": documentId,
  }).lean();
  const assessmentIds = assessmentRecords.map((record) => record.recordId);

  await UserData.deleteMany({
    ...ownerFilter(req, "documents", documentId),
  });
  await UserData.deleteMany({
    ...ownerFilter(req, "studyIndexes", documentId),
  });
  await UserData.deleteMany({
    ...ownerFilter(req, "assessments"),
    "payload.documentId": documentId,
  });
  if (assessmentIds.length) {
    await UserData.deleteMany({
      ...ownerFilter(req, "assessmentAttempts"),
      "payload.assessmentId": { $in: assessmentIds },
    });
  }
  return res.json({ deleted: true });
}));

router.get("/study-index/:documentId", asyncRoute(async (req, res) => {
  const index = await getRecord(req, "studyIndexes", req.params.documentId);
  return res.json(index || { metadata: null, chunks: [] });
}));

router.patch("/study-index/:documentId", asyncRoute(async (req, res) => {
  const documentId = req.params.documentId;
  const existing = await getRecord(req, "studyIndexes", documentId);
  const metadata = {
    ...(existing?.metadata || {}),
    ...(req.body || {}),
    documentId,
    updatedAt: new Date().toISOString(),
  };
  const index = { metadata, chunks: existing?.chunks || [] };
  await saveRecord(req, "studyIndexes", documentId, index);
  return res.json({ metadata });
}));

router.put("/study-index/:documentId", asyncRoute(async (req, res) => {
  const documentId = req.params.documentId;
  const chunks = req.body?.chunks;
  if (!Array.isArray(chunks)) {
    return res.status(400).json({ error: "A study index needs a chunk list." });
  }
  const metadata = {
    ...(req.body?.metadata || {}),
    documentId,
    status: "ready",
    updatedAt: new Date().toISOString(),
  };
  await saveRecord(req, "studyIndexes", documentId, { metadata, chunks });
  return res.json({ metadata });
}));

router.delete("/study-index/:documentId", asyncRoute(async (req, res) => {
  await UserData.deleteMany(ownerFilter(req, "studyIndexes", req.params.documentId));
  return res.json({ deleted: true });
}));

router.get("/assessments", asyncRoute(async (req, res) => {
  const assessments = await listRecords(req, "assessments");
  assessments.sort((first, second) =>
    (second.createdAt || "").localeCompare(first.createdAt || ""),
  );
  return res.json({ assessments });
}));

router.post("/assessments", asyncRoute(async (req, res) => {
  const assessment = req.body;
  if (!validId(assessment?.id) || !validId(assessment?.documentId) || !Array.isArray(assessment?.questions)) {
    return res.status(400).json({ error: "Assessment data is incomplete." });
  }
  const saved = await saveRecord(req, "assessments", assessment.id, assessment);
  return res.json({ assessment: saved });
}));

router.get("/assessments/:id", asyncRoute(async (req, res) => {
  const assessment = await getRecord(req, "assessments", req.params.id);
  return assessment
    ? res.json({ assessment })
    : res.status(404).json({ error: "The saved assessment could not be found." });
}));

router.delete("/assessments/:id", asyncRoute(async (req, res) => {
  const assessmentId = req.params.id;
  await UserData.deleteMany(ownerFilter(req, "assessments", assessmentId));
  await UserData.deleteMany({
    ...ownerFilter(req, "assessmentAttempts"),
    "payload.assessmentId": assessmentId,
  });
  return res.json({ deleted: true });
}));

router.get("/assessments/:id/attempts", asyncRoute(async (req, res) => {
  const attempts = await UserData.find({
    ...ownerFilter(req, "assessmentAttempts"),
    "payload.assessmentId": req.params.id,
  }).lean();
  const sorted = attempts.map((record) => record.payload).sort((first, second) =>
    (second.submittedAt || "").localeCompare(first.submittedAt || ""),
  );
  return res.json({ attempts: sorted });
}));

router.post("/assessments/:id/attempts", asyncRoute(async (req, res) => {
  const assessmentId = req.params.id;
  const assessment = await getRecord(req, "assessments", assessmentId);
  if (!assessment) return res.status(404).json({ error: "The saved assessment could not be found." });
  const attempt = req.body;
  if (!validId(attempt?.id) || attempt.assessmentId !== assessmentId) {
    return res.status(400).json({ error: "Attempt data is incomplete." });
  }
  const saved = await saveRecord(req, "assessmentAttempts", attempt.id, attempt);
  return res.json({ attempt: saved });
}));

router.post("/import", asyncRoute(async (req, res) => {
  const imported = {};
  const source = req.body || {};
  const idFor = {
    documents: (record) => record.id,
    studyIndexes: (record) => record.documentId,
    assessments: (record) => record.id,
    assessmentAttempts: (record) => record.id,
  };

  for (const category of CATEGORIES) {
    const records = source[category] || [];
    if (!Array.isArray(records)) {
      return res.status(400).json({ error: `Invalid legacy ${category} data.` });
    }
    let count = 0;
    for (const payload of records) {
      const recordId = idFor[category](payload || {});
      if (!validId(recordId)) continue;
      await UserData.updateOne(
        ownerFilter(req, category, recordId),
        { $setOnInsert: { payload } },
        { upsert: true, runValidators: true },
      );
      count += 1;
    }
    imported[category] = count;
  }

  return res.json({ imported });
}));

export default router;
