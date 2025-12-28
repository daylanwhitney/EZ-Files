export const PROMPT_ENGINEER_SYSTEM = `
You are a world-class Prompt Engineer and System Architect.
Your goal is to take a simple user intent and transform it into a highly sophisticated, robust System Instruction for an LLM.

Follow this framework to engineer the perfect prompt:
1. **Persona Analysis**: Determine the ideal role (e.g., "Senior Forensic Accountant" vs "Accountant").
2. **Contextual Constraints**: Define strict rules for behavior, tone, and accuracy.
3. **Operational Protocols**: Specify how to handle data, formatting, and uncertainty.

INPUT: The user's rough goal (e.g., "be a virtual accountant").
OUTPUT: A single, professionally engineered system prompt. Do not output anything else. No markdown fences.
`;

export function constructMetaPrompt(userDraft: string): string {
    return `
${PROMPT_ENGINEER_SYSTEM}

USER DRAFT: "${userDraft}"

INSTRUCTION:
Rewrite the user's draft into a highly specific System Instruction.

ENGINEERED PROMPT:
`;
}

// STAGE 1: Reasoning & Clarification
export function constructClarificationPrompt(userDraft: string, context?: { structure: string, deps: string, readme: string }): string {
    let contextBlock = "";
    if (context) {
        contextBlock = `
Additional Technical Context:
- **Project Structure**:
${context.structure}

- **Key Dependencies**:
${context.deps}

- **Project Goal (README Summary)**:
${context.readme.slice(0, 500)}... (truncated)
`;
    }

    return `
You are an expert Requirements Analyst.
Your goal is to ask 3 relevant, highly specific clarifying questions to the user to understand their intent better before writing a prompt for them.

USER GOAL: "${userDraft}"
${contextBlock}

INSTRUCTION:
Based on the User Goal and the Context provided (if any), generate exactly 3 clarifying questions.
Each question MUST have 3 distinct options (A, B, C) that the user can choose from.
- If context is provided, ask about specific files or patterns found in the structure.
- If no context, ask about tone, audience, or format.
- **CRITICAL**: Return the result as a raw JSON array of objects. Do not use Markdown blocks.

JSON SCHEMA:
[
  {
    "question": "The question text?",
    "options": ["Option A", "Option B", "Option C"]
  }
]
`;
}

// STAGE 2: Final Refinement
export function constructRefinedPrompt(
    userDraft: string,
    answers: string[],
    context?: { structure: string, deps: string, readme: string }
): string {
    let contextBlock = "";
    if (context) {
        contextBlock = `
Additional Technical Context:
- **Project Structure**:
${context.structure}

- **Key Dependencies**:
${context.deps}

- **Project Goal (README Summary)**:
${context.readme.slice(0, 800)}...
`;
    }

    return `
${PROMPT_ENGINEER_SYSTEM}

USER RAW DRAFT: "${userDraft}"

USER ANSWERS TO CLARIFYING QUESTIONS:
1. ${answers[0] || "N/A"}
2. ${answers[1] || "N/A"}
3. ${answers[2] || "N/A"}

${contextBlock}

INSTRUCTION:
Synthesize the User Draft, the User's Answers, and the Technical Context (if available) into the SINGLE BEST SYSTEM PROMPT possible.
Ensure the prompt explicitly references the project structure and dependencies if they are relevant to the user's goal.

ENGINEERED PROMPT:
`;
}
