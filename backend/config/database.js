
import mongoose from "mongoose";

export async function connectDatabase() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing from the backend .env file.");
  }

  await mongoose.connect(mongoUri, { dbName: "vocaread" });

  console.log("Connected to MongoDB Atlas.");
  return mongoose.connection.getClient();
}

