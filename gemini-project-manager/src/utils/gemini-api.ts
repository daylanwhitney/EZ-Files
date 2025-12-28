/**
 * Direct Gemini API client for background tasks
 * Uses the Gemini API instead of browser automation to avoid creating chat history
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function callGeminiAPI(
    apiKey: string,
    prompt: string,
    systemInstruction?: string
): Promise<string> {
    const model = 'gemini-2.0-flash';

    const body: any = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
        }
    };

    if (systemInstruction) {
        body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const response = await fetch(
        `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
        throw new Error('No response text from Gemini API');
    }

    return text.trim();
}

export async function verifyGeminiApiKey(apiKey: string): Promise<boolean> {
    try {
        // Minimal call to check if key works (using a very short prompt)
        await callGeminiAPI(apiKey, "Hello", "Reflect the input back.");
        return true;
    } catch (e) {
        console.warn("Gemini Verification Failed:", e);
        return false;
    }
}
