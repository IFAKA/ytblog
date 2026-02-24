export const RESTRUCTURE_PROMPT = `You are transforming a messy video transcript into clean, structured prose for a blog article reader. Return a JSON object with this exact format:

{
  "sections": [
    {
      "title": "Section Title",
      "recap": "One sentence summary of this section.",
      "thoughts": [
        {
          "text": "A clean, complete thought. One to three sentences.",
          "emphasis": ["keyWord1", "keyWord2"],
          "mode": "flow",
          "energy": "explanation",
          "complexity": 0.4
        }
      ]
    }
  ],
  "takeaways": [
    "Key takeaway 1",
    "Key takeaway 2",
    "Key takeaway 3"
  ]
}

Rules for "text":
- Remove ALL filler words: um, uh, like (as filler), you know, basically, sort of, kind of, I mean, right?, so basically
- Remove false starts, repetitions, and verbal tics
- Restructure rambling sentences into clear, concise prose
- Each thought should be 1-3 sentences, a complete idea
- Preserve the speaker's meaning and personality, just make it crisp
- Never add information that wasn't in the original

Rules for "emphasis":
- 1-3 words per thought that carry the most semantic weight
- These will be visually highlighted

Rules for "mode":
- "flow" — default, for prose and explanations
- "impact" — for dramatic moments, key insights, short punchy statements (3-8 words)
- "stack" — for lists, enumerations, step-by-step content

Rules for "energy":
- "calm_intro" — opening, setting context
- "explanation" — teaching, explaining concepts
- "building_tension" — leading up to a key point
- "climax" — the key insight or dramatic moment
- "enumeration" — listing items
- "contrast" — comparing/contrasting ideas
- "emotional" — personal stories, feelings
- "question" — rhetorical or real questions
- "resolution" — wrapping up, concluding

Rules for "complexity":
- 0.0-1.0 score
- Higher for technical jargon, dense ideas, multi-clause sentences
- Lower for simple statements, transitions

Rules for narrative arc:
- Energy states should follow natural arcs: calm_intro at openings, building_tension before climax, resolution at section ends
- Limit climax to ~10% of thoughts — overuse dilutes impact
- Every climax should be preceded by at least one building_tension thought

Rules for mode-energy alignment:
- impact mode pairs with climax or building_tension (short punchy statements only)
- stack mode pairs with enumeration
- Never use impact for explanation or calm_intro — those need room to breathe in flow mode

Rules for emphasis specificity:
- Choose words with unique semantic weight — proper nouns, numbers, technical terms, emotionally charged words
- Never emphasize articles, prepositions, or common verbs (the, a, is, was, have, do, get, make)
- 1-3 emphasis words per thought maximum

Rules for mathematical content:
- When the transcript contains spoken math (e.g. "x squared plus 2x equals zero"), convert it to LaTeX notation wrapped in dollar signs: $x^2 + 2x = 0$
- Use single $ for inline math within sentences
- Use double $$ for standalone equations that deserve their own line
- Common patterns: "x squared" → $x^2$, "square root of x" → $\\sqrt{x}$, "integral from a to b" → $\\int_a^b$, "f of x" → $f(x)$, "sum from i equals 1 to n" → $\\sum_{i=1}^{n}$
- Preserve the surrounding prose — only the math notation itself goes inside dollar signs
- If unsure whether something is math, leave it as prose

Rules for "recap":
- One sentence summarizing the section's key point
- Shown at section breaks as a comprehension checkpoint

Rules for "takeaways":
- 3-5 key points from the entire transcript
- Shown at the end as a summary card`;

export function buildRestructureRequest(transcript, model, videoContext) {
  let prompt = transcript;
  if (videoContext) {
    const parts = ['[VIDEO CONTEXT]'];
    if (videoContext.title) parts.push(`Title: ${videoContext.title}`);
    if (videoContext.category) parts.push(`Category: ${videoContext.category}`);
    if (videoContext.keywords?.length) parts.push(`Keywords: ${videoContext.keywords.slice(0, 15).join(', ')}`);
    if (videoContext.description) parts.push(`Description: ${videoContext.description.slice(0, 500)}`);
    parts.push('', '[TRANSCRIPT]');
    prompt = parts.join('\n') + '\n' + transcript;
  }
  return {
    model,
    prompt,
    system: RESTRUCTURE_PROMPT,
    format: 'json',
    stream: false,
  };
}

// Chapter-aware prompt: processes a single chapter into thoughts + recap (no section splitting)
export const CHAPTER_RESTRUCTURE_PROMPT = `You are transforming a messy video transcript excerpt into clean, structured prose for a blog article reader. This excerpt is from a single chapter of the video. Return a JSON object with this exact format:

{
  "thoughts": [
    {
      "text": "A clean, complete thought. One to three sentences.",
      "emphasis": ["keyWord1", "keyWord2"],
      "mode": "flow",
      "energy": "explanation",
      "complexity": 0.4
    }
  ],
  "recap": "One sentence summary of this chapter."
}

Rules for "text":
- Remove ALL filler words: um, uh, like (as filler), you know, basically, sort of, kind of, I mean, right?, so basically
- Remove false starts, repetitions, and verbal tics
- Restructure rambling sentences into clear, concise prose
- Each thought should be 1-3 sentences, a complete idea
- Preserve the speaker's meaning and personality, just make it crisp
- Never add information that wasn't in the original

Rules for "emphasis":
- 1-3 words per thought that carry the most semantic weight
- These will be visually highlighted

Rules for "mode":
- "flow" — default, for prose and explanations
- "impact" — for dramatic moments, key insights, short punchy statements (3-8 words)
- "stack" — for lists, enumerations, step-by-step content

Rules for "energy":
- "calm_intro" — opening, setting context
- "explanation" — teaching, explaining concepts
- "building_tension" — leading up to a key point
- "climax" — the key insight or dramatic moment
- "enumeration" — listing items
- "contrast" — comparing/contrasting ideas
- "emotional" — personal stories, feelings
- "question" — rhetorical or real questions
- "resolution" — wrapping up, concluding

Rules for "complexity":
- 0.0-1.0 score
- Higher for technical jargon, dense ideas, multi-clause sentences
- Lower for simple statements, transitions

Rules for narrative arc:
- Energy states should follow natural arcs within this chapter
- Limit climax to ~10% of thoughts
- Every climax should be preceded by at least one building_tension thought

Rules for mode-energy alignment:
- impact mode pairs with climax or building_tension (short punchy statements only)
- stack mode pairs with enumeration
- Never use impact for explanation or calm_intro

Rules for emphasis specificity:
- Choose words with unique semantic weight — proper nouns, numbers, technical terms, emotionally charged words
- Never emphasize articles, prepositions, or common verbs (the, a, is, was, have, do, get, make)
- 1-3 emphasis words per thought maximum

Rules for mathematical content:
- When the transcript contains spoken math (e.g. "x squared plus 2x equals zero"), convert it to LaTeX notation wrapped in dollar signs: $x^2 + 2x = 0$
- Use single $ for inline math within sentences
- Use double $$ for standalone equations that deserve their own line
- Common patterns: "x squared" → $x^2$, "square root of x" → $\\sqrt{x}$, "integral from a to b" → $\\int_a^b$, "f of x" → $f(x)$, "sum from i equals 1 to n" → $\\sum_{i=1}^{n}$
- Preserve the surrounding prose — only the math notation itself goes inside dollar signs
- If unsure whether something is math, leave it as prose

Rules for "recap":
- One sentence summarizing this chapter's key point`;

export function buildChapterRequest(title, text, model) {
  return {
    model,
    prompt: text,
    system: `The following transcript is from the chapter titled "${title}".\n\n${CHAPTER_RESTRUCTURE_PROMPT}`,
    format: 'json',
    stream: false,
  };
}

// Sub-chunk a single chapter if it exceeds the word limit
export function splitChapterIntoSubChunks(text, targetWords = 8000) {
  const wordCount = text.split(/\s+/).length;
  if (wordCount <= targetWords) return [text];
  return splitIntoSentenceChunks(text, targetWords);
}

// Split long transcripts on sentence boundaries
// Target ~8000 words per chunk with ~2 sentence overlap
export function splitIntoSentenceChunks(text, targetWords = 8000) {
  // Split into sentences (handles ., !, ? followed by space or end)
  const sentences = text.match(/[^.!?]*[.!?]+[\s]?|[^.!?]+$/g) || [text];

  const chunks = [];
  let currentChunk = [];
  let currentWordCount = 0;
  let overlapSentences = []; // last 2 sentences from previous chunk

  for (const sentence of sentences) {
    const sentenceWords = sentence.trim().split(/\s+/).length;
    currentChunk.push(sentence);
    currentWordCount += sentenceWords;

    if (currentWordCount >= targetWords) {
      chunks.push(currentChunk.join(''));
      // Keep last 2 sentences as overlap for next chunk
      overlapSentences = currentChunk.slice(-2);
      currentChunk = [...overlapSentences];
      currentWordCount = overlapSentences.join(' ').split(/\s+/).length;
    }
  }

  // Push remaining sentences as final chunk
  if (currentChunk.length > overlapSentences.length) {
    chunks.push(currentChunk.join(''));
  }

  return chunks;
}
