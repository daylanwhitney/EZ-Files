import React, { useState } from 'react';
import { SnippetList } from './SnippetList';
import { Wand2, Github, Loader2, Copy, Send, CheckCircle2 } from 'lucide-react';
import { fetchRepoContext, fetchUserRepos } from '../utils/github';
import { callGeminiAPI } from '../utils/gemini-api';
import { constructClarificationPrompt, constructRefinedPrompt } from '../utils/prompts';
import { storage } from '../utils/storage';

export const PromptsPanel: React.FC = () => {
    const [view, setView] = useState<'list' | 'enhancer'>('list');

    return (
        <div className="flex flex-col h-full bg-gray-900/50">
            {/* Top Toggle Switch */}
            <div className="p-3 border-b border-gray-800 bg-gray-900 sticky top-0 z-10">
                <div className="flex bg-gray-800 rounded-lg p-1">
                    <button
                        onClick={() => setView('list')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${view === 'list'
                            ? 'bg-gray-700 text-white shadow-sm'
                            : 'text-gray-400 hover:text-gray-300'
                            }`}
                    >
                        Saved Prompts
                    </button>
                    <button
                        onClick={() => setView('enhancer')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-2 ${view === 'enhancer'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-gray-400 hover:text-gray-300'
                            }`}
                    >
                        <Wand2 size={12} />
                        Enhancer
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden relative">
                {view === 'list' ? (
                    <SnippetList />
                ) : (
                    <PromptEnhancer onSave={() => setView('list')} />
                )}
            </div>
        </div>
    );
};

// Internal State Machine Types
type EnhancerState = 'INPUT' | 'ANALYZING' | 'QUESTIONS' | 'FINALIZING' | 'RESULT';

interface ContextData {
    structure: string;
    dependencies: string;
    readme: string;
}

interface Question {
    question: string;
    options: string[];
}

const PromptEnhancer: React.FC<{ onSave: () => void }> = ({ onSave }) => {
    // UI State
    const [state, setState] = useState<EnhancerState>('INPUT');
    const [statusText, setStatusText] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Data State
    const [draft, setDraft] = useState('');
    const [repoUrl, setRepoUrl] = useState('');
    const [recentRepos, setRecentRepos] = useState<string[]>([]);
    const [userRepos, setUserRepos] = useState<string[]>([]); // NEW: Repos from GitHub API
    const [showHistory, setShowHistory] = useState(false);
    const [context, setContext] = useState<ContextData | undefined>(undefined);

    // Load history & user repos on mount
    React.useEffect(() => {
        storage.getRecentRepos().then(setRecentRepos);
        fetchUserRepos().then(setUserRepos);
    }, []);

    // Clarification Flow
    const [questions, setQuestions] = useState<Question[]>([]);
    const [answers, setAnswers] = useState<string[]>(['', '', '']);
    // Track if user selected "Custom" for a question
    const [customMode, setCustomMode] = useState<boolean[]>([false, false, false]);

    // Final Result
    const [finalPrompt, setFinalPrompt] = useState('');

    // --- STEP 1: INITIAL ANALYSIS & CLARIFICATION ---
    const handleInitialAnalysis = async () => {
        if (!draft) return;
        setError(null);
        setState('ANALYZING');
        setStatusText('Initializing...');

        try {
            const apiKey = await storage.getApiKey();
            if (!apiKey) throw new Error("Please add API Key in Settings");

            let currentContext: ContextData | undefined = undefined;

            // 1. Fetch GitHub Context if provided
            if (repoUrl.trim().includes('github.com')) {
                setStatusText('Scouting GitHub Repo...');
                const repoData = await fetchRepoContext(repoUrl);

                // Save to history on success
                await storage.addRecentRepo(repoUrl);
                // Refresh local list
                const updated = await storage.getRecentRepos();
                setRecentRepos(updated);

                currentContext = repoData;
                setContext(currentContext);
                setStatusText('Analyzing Code Structure...');
            }

            // 2. Generate Clarifying Questions
            setStatusText('Formulating questions...');

            const contextForPrompt = currentContext ? {
                structure: currentContext.structure,
                deps: currentContext.dependencies,
                readme: currentContext.readme
            } : undefined;

            const clarificationPrompt = constructClarificationPrompt(draft, contextForPrompt);
            const rawResponse = await callGeminiAPI(apiKey, clarificationPrompt);

            // Parse JSON response
            let parsedQuestions: Question[] = [];
            try {
                // Try to find JSON array in the response (handle potential markdown fences)
                const jsonMatch = rawResponse.match(/\[[\s\S]*\]/);
                const jsonStr = jsonMatch ? jsonMatch[0] : rawResponse;
                parsedQuestions = JSON.parse(jsonStr);

                // Validate structure
                if (!Array.isArray(parsedQuestions) || parsedQuestions.length < 3) {
                    throw new Error("Invalid question format");
                }
                parsedQuestions = parsedQuestions.slice(0, 3); // Ensure exactly 3
            } catch (jsonError) {
                console.warn("Failed to parse JSON questions, falling back to defaults", jsonError);
                parsedQuestions = [
                    { question: "What is the primary goal?", options: ["Create new code", "Debug existing code", "Explain concepts"] },
                    { question: "Who is the audience?", options: ["Beginner Developer", "Senior Engineer", "Non-technical User"] },
                    { question: "What is the desired output format?", options: ["Full script file", "Step-by-step guide", "Conceptual explanation"] }
                ];
            }

            setQuestions(parsedQuestions);
            // Reset answers state
            setAnswers(['', '', '']);
            setCustomMode([false, false, false]);
            setState('QUESTIONS');

        } catch (e: any) {
            setError(e.message);
            setState('INPUT');
        }
    };

    // --- STEP 2: GENERATE FINAL PROMPT ---
    const handleFinalize = async () => {
        setError(null);
        setState('FINALIZING');
        setStatusText('Engineering Final Prompt...');

        try {
            const apiKey = await storage.getApiKey();
            if (!apiKey) throw new Error("API Key missing");

            const contextForPrompt = context ? {
                structure: context.structure,
                deps: context.dependencies,
                readme: context.readme
            } : undefined;

            const promptToSend = constructRefinedPrompt(draft, answers, contextForPrompt);
            const enhanced = await callGeminiAPI(apiKey, promptToSend);

            setFinalPrompt(enhanced);
            setState('RESULT');

        } catch (e: any) {
            setError(e.message);
            setState('QUESTIONS'); // Go back to allow retry
        }
    };

    const handleOptionSelect = (qIndex: number, option: string) => {
        const newAnswers = [...answers];
        newAnswers[qIndex] = option;
        setAnswers(newAnswers);

        // Disable custom mode if they picked a preset
        const newCustomMode = [...customMode];
        newCustomMode[qIndex] = false;
        setCustomMode(newCustomMode);
    };

    const handleCustomInput = (qIndex: number, value: string) => {
        const newAnswers = [...answers];
        newAnswers[qIndex] = value;
        setAnswers(newAnswers);

        // Ensure custom mode is active
        if (!customMode[qIndex]) {
            const newCustomMode = [...customMode];
            newCustomMode[qIndex] = true;
            setCustomMode(newCustomMode);
        }
    };

    const toggleCustomMode = (qIndex: number) => {
        // Toggle custom input visibility
        const newCustomMode = [...customMode];
        newCustomMode[qIndex] = !newCustomMode[qIndex];
        setCustomMode(newCustomMode);

        // Clear answer if switching to custom to prompt typing
        if (newCustomMode[qIndex]) {
            const newAnswers = [...answers];
            newAnswers[qIndex] = '';
            setAnswers(newAnswers);
        }
    }

    const allQuestionsAnswered = answers.every(a => a && a.trim().length > 0);

    // --- RENDER HELPERS ---

    // 1. INPUT STATE
    if (state === 'INPUT' || state === 'ANALYZING') {
        return (
            <div className="p-4 h-full overflow-y-auto space-y-4">
                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-medium text-gray-400 mb-1 block">Your Goal</label>
                        <textarea
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none resize-none h-24"
                            placeholder="e.g. Create a Python script to scrape stock prices..."
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            disabled={state === 'ANALYZING'}
                        />
                    </div>

                    <div className="relative">
                        <label className="text-xs font-medium text-gray-400 mb-1 block flex items-center gap-1">
                            <Github size={12} /> GitHub Context (Optional)
                        </label>
                        <input
                            type="text"
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-xs text-gray-300 focus:ring-1 focus:ring-blue-500 outline-none font-mono"
                            placeholder="https://github.com/username/repo"
                            value={repoUrl}
                            onChange={e => setRepoUrl(e.target.value)}
                            onFocus={() => setShowHistory(true)}
                            onBlur={() => setTimeout(() => setShowHistory(false), 200)}
                            disabled={state === 'ANALYZING'}
                        />
                        {showHistory && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-[#2b2d30] border border-gray-600 rounded-lg shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto">
                                {/* Section 1: RECENT HISTORY */}
                                {recentRepos.filter(r => r.includes(repoUrl.trim())).length > 0 && (
                                    <>
                                        <div className="px-3 py-2 text-[10px] font-bold text-gray-500 border-b border-gray-700 bg-gray-800/50 sticky top-0">
                                            RECENTLY SCANNED
                                        </div>
                                        {recentRepos.filter(r => r.includes(repoUrl.trim())).map((repo) => (
                                            <button
                                                key={`recent-${repo}`}
                                                className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-blue-600 hover:text-white transition-colors truncate font-mono block"
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    setRepoUrl(repo);
                                                    setShowHistory(false);
                                                }}
                                            >
                                                {repo}
                                            </button>
                                        ))}
                                    </>
                                )}

                                {/* Section 2: AUTHORIZED REPOS */}
                                {userRepos.length > 0 && (
                                    <>
                                        <div className="px-3 py-2 text-[10px] font-bold text-gray-500 border-b border-gray-700 bg-gray-800/50 sticky top-0 border-t">
                                            YOUR REPOSITORIES
                                        </div>
                                        {userRepos
                                            .filter(r => r.toLowerCase().includes(repoUrl.toLowerCase()) && !recentRepos.includes(r)) // Filter & Dedup
                                            .map((repo) => (
                                                <button
                                                    key={`user-${repo}`}
                                                    className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-blue-600 hover:text-white transition-colors truncate font-mono block"
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        setRepoUrl(repo);
                                                        setShowHistory(false);
                                                    }}
                                                >
                                                    {repo.replace('https://github.com/', '')}
                                                </button>
                                            ))}
                                        {userRepos.filter(r => r.toLowerCase().includes(repoUrl.toLowerCase()) && !recentRepos.includes(r)).length === 0 && (
                                            <div className="px-3 py-2 text-xs text-gray-500 italic">No matching repos</div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {error && <div className="text-xs text-red-400 bg-red-900/20 p-2 rounded">{error}</div>}

                    <button
                        onClick={handleInitialAnalysis}
                        disabled={state === 'ANALYZING' || !draft}
                        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {state === 'ANALYZING' ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                        {state === 'ANALYZING' ? statusText : 'Start Enhancement'}
                    </button>

                    <p className="text-[10px] text-gray-500 text-center leading-relaxed px-4">
                        We will analyze your request (and repo) and ask 3 clarifying questions to build the perfect prompt.
                    </p>
                </div>
            </div>
        );
    }

    // 2. QUESTIONS STATE (MCQ)
    if (state === 'QUESTIONS' || state === 'FINALIZING') {
        return (
            <div className="p-4 h-full overflow-y-auto flex flex-col">
                <button
                    onClick={() => setState('INPUT')}
                    className="text-xs text-gray-500 hover:text-white mb-4 flex items-center gap-1 w-fit"
                >
                    ← Back to input
                </button>

                <h3 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
                    <CheckCircle2 size={14} /> Reasoning First
                </h3>
                <p className="text-xs text-gray-400 mb-4">
                    Refine your request by choosing the best options:
                </p>

                <div className="space-y-6 flex-1">
                    {questions.map((q, idx) => (
                        <div key={idx} className="space-y-2 animate-in fade-in slide-in-from-bottom-2" style={{ animationDelay: `${idx * 100}ms` }}>
                            <div className="text-xs font-medium text-gray-300 p-2 border-l-2 border-blue-500/50">
                                <span className="text-blue-500 font-bold mr-1">{idx + 1}.</span> {q.question}
                            </div>

                            {/* Options Grid */}
                            <div className="grid grid-cols-1 gap-2 pl-3">
                                {q.options.map((opt, optIdx) => (
                                    <button
                                        key={optIdx}
                                        onClick={() => handleOptionSelect(idx, opt)}
                                        className={`text-xs text-left px-3 py-2 rounded border transition-all ${!customMode[idx] && answers[idx] === opt
                                            ? 'bg-blue-600 border-blue-500 text-white shadow-md'
                                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                                            }`}
                                    >
                                        <span className="font-mono opacity-50 mr-2">{String.fromCharCode(65 + optIdx)}.</span>
                                        {opt}
                                    </button>
                                ))}

                                {/* Custom Option */}
                                <div className="relative">
                                    <button
                                        onClick={() => toggleCustomMode(idx)}
                                        className={`w-full text-xs text-left px-3 py-2 rounded border transition-all ${customMode[idx]
                                            ? 'bg-blue-900/40 border-blue-500/50 text-blue-200'
                                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                                            }`}
                                    >
                                        <span className="font-mono opacity-50 mr-2">D.</span>
                                        Custom Answer...
                                    </button>

                                    {customMode[idx] && (
                                        <input
                                            autoFocus
                                            type="text"
                                            className="mt-2 w-full bg-gray-900 border border-gray-600 rounded p-2 text-xs text-white focus:border-blue-500 outline-none animate-in fade-in zoom-in-95 duration-200"
                                            placeholder="Type your custom answer..."
                                            value={answers[idx]}
                                            onChange={e => handleCustomInput(idx, e.target.value)}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {error && <div className="text-xs text-red-400 bg-red-900/20 p-2 rounded mt-2">{error}</div>}

                <div className="pt-4 mt-6 border-t border-gray-800">
                    <button
                        onClick={handleFinalize}
                        disabled={state === 'FINALIZING' || !allQuestionsAnswered}
                        className="w-full bg-green-600 hover:bg-green-500 text-white font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {state === 'FINALIZING' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        {state === 'FINALIZING' ? statusText : 'Generate Final Prompt'}
                    </button>
                </div>
            </div>
        );
    }

    // 3. RESULT STATE
    if (state === 'RESULT') {
        return (
            <div className="p-4 h-full overflow-y-auto flex flex-col">
                <button
                    onClick={() => setState('INPUT')}
                    className="text-xs text-gray-500 hover:text-white mb-4 flex items-center gap-1 w-fit"
                >
                    ← Start Over
                </button>

                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wider">Optimized Result</h3>
                    <button
                        onClick={() => { navigator.clipboard.writeText(finalPrompt); }}
                        className="text-xs flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
                    >
                        <Copy size={12} /> Copy
                    </button>
                </div>

                <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 relative group flex-1 overflow-y-auto custom-scrollbar">
                    <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed pb-8">
                        {finalPrompt}
                    </pre>
                    {/* Floating Save Button */}
                    <div className="absolute bottom-4 right-4 flex gap-2">
                        <button
                            onClick={() => {
                                storage.addSnippet("Enhanced Prompt", finalPrompt);
                                onSave(); // Switch view back to list
                            }}
                            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg shadow-lg hover:bg-blue-500 text-xs font-medium flex items-center gap-1"
                        >
                            <CheckCircle2 size={12} /> Save
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return null;
}
