import mongoose from "mongoose";

const userDataSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    category: {
      type: String,
      enum: ["documents", "studyIndexes", "assessments", "assessmentAttempts"],
      required: true,
    },
    recordId: { type: String, required: true, maxlength: 160 },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

userDataSchema.index(
  { ownerId: 1, category: 1, recordId: 1 },
  { unique: true },
);

const UserData =
  mongoose.models.UserData || mongoose.model("UserData", userDataSchema);

export default UserData;
