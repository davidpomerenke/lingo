import { NextRequest, NextResponse } from "next/server";
import { initDb, createConcept, getConcepts, countConcepts } from "@/lib/db";

export async function POST(request: NextRequest) {
  await initDb();

  try {
    const body = await request.json();
    const { userId, language, concept, type, context, notes } = body;

    if (!userId || !language || !concept || !type) {
      return NextResponse.json(
        { error: "Missing required fields: userId, language, concept, type" },
        { status: 400 }
      );
    }

    if (!["vocabulary", "grammar", "phrase"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid type. Must be: vocabulary, grammar, or phrase" },
        { status: 400 }
      );
    }

    const newConcept = await createConcept(
      userId,
      language,
      concept,
      type,
      context,
      notes
    );

    return NextResponse.json({ success: true, concept: newConcept });
  } catch (error) {
    console.error("Error creating flashcard:", error);
    return NextResponse.json(
      { error: "Failed to create flashcard" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  await initDb();

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const language = searchParams.get("language") || undefined;

    if (!userId) {
      return NextResponse.json(
        { error: "Missing required parameter: userId" },
        { status: 400 }
      );
    }

    const concepts = await getConcepts(userId, language);
    const count = await countConcepts(userId, language);

    return NextResponse.json({ concepts, count });
  } catch (error) {
    console.error("Error fetching flashcards:", error);
    return NextResponse.json(
      { error: "Failed to fetch flashcards" },
      { status: 500 }
    );
  }
}

