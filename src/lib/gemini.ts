import { GoogleGenAI, Type } from "@google/genai";
import { QuizQuestion, Flashcard } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateStudyMaterials(content: string, imageBase64?: string, mimeType?: string): Promise<{ quiz: QuizQuestion[], flashcards: Flashcard[] }> {
  const model = "gemini-3.1-pro-preview";

  const parts: any[] = [
    { text: `
    Analyze the following content and generate a comprehensive study set.
    The study set should include:
    1. A quiz with 5-10 multiple choice questions.
    2. A set of 10-15 flashcards (front and back).

    Content:
    ${content}
    ` }
  ];

  if (imageBase64 && mimeType) {
    parts.push({
      inlineData: {
        data: imageBase64,
        mimeType: mimeType
      }
    });
  }

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          quiz: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                correctAnswer: { type: Type.INTEGER, description: "Index of the correct option (0-3)" }
              },
              required: ["question", "options", "correctAnswer"]
            }
          },
          flashcards: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                front: { type: Type.STRING },
                back: { type: Type.STRING }
              },
              required: ["front", "back"]
            }
          }
        },
        required: ["quiz", "flashcards"]
      }
    }
  });

  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Failed to parse AI response", e);
    throw new Error("Failed to generate study materials. Please try again.");
  }
}
