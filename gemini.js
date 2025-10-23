// gemini.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

export async function summarizeEmail(emailText) {
  const prompt = `Summarize this email in 3 short sentences:\n\n${emailText}`;
  const result = await model.generateContent(prompt);
  return result.response.text();
}
