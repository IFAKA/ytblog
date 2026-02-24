import { checkHealth, checkModel, generate } from './ollama.js';
import { buildRestructureRequest, splitIntoSentenceChunks, buildChapterRequest, splitChapterIntoSubChunks } from './prompts.js';

const DEFAULT_MODEL = 'qwen2.5:7b';

// Single pass if video is under 90 minutes OR transcript under 10k words
// Chunk only for very long content where output JSON gets unreliable
const SINGLE_PASS_DURATION = 90 * 60;  // 90 minutes in seconds
const SINGLE_PASS_WORD_LIMIT = 10000;  // fallback if duration unknown

async function getModel() {
  try {
    const result = await chrome.storage.local.get('model');
    if (result.model) return result.model;
    // No saved model — try to auto-select the best available
    const health = await checkHealth();
    if (health.running && health.modelDetails?.length) {
      const best = pickBestModel(health.modelDetails);
      if (best) return best.name;
    }
    return DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

function parseParamSize(str) {
  if (!str) return 0;
  const match = str.match(/([\d.]+)\s*([BMK])/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  if (unit === 'B') return num;
  if (unit === 'M') return num / 1000;
  if (unit === 'K') return num / 1000000;
  return 0;
}

function pickBestModel(modelDetails) {
  if (!modelDetails?.length) return null;
  const ranked = modelDetails
    .map(m => ({ ...m, paramNum: parseParamSize(m.paramSize) }))
    .sort((a, b) => a.paramNum - b.paramNum);
  // Largest model <= 9B, or smallest available if all > 9B
  const sweet = ranked.filter(m => m.paramNum <= 9);
  return sweet.length ? sweet[sweet.length - 1] : ranked[0];
}

// Full pipeline: single pass for short/normal videos, sentence-chunked for long ones
async function processTranscript(transcript, sendProgress, durationSeconds = 0, videoContext = null) {
  const model = await getModel();

  const health = await checkHealth();
  if (!health.running) {
    throw new Error('OLLAMA_NOT_RUNNING');
  }

  const modelCheck = await checkModel(model);
  if (!modelCheck.available) {
    throw new Error('MODEL_NOT_FOUND');
  }
  const resolvedModel = modelCheck.resolvedModel;

  const wordCount = transcript.split(/\s+/).length;
  const useSinglePass = durationSeconds > 0
    ? durationSeconds <= SINGLE_PASS_DURATION
    : wordCount <= SINGLE_PASS_WORD_LIMIT;

  if (useSinglePass) {
    // Single pass — model sees the full transcript
    sendProgress({ stage: 'processing', total: 1, completed: 0 });
    const req = buildRestructureRequest(transcript, resolvedModel, videoContext);
    const result = await generate(req);
    sendProgress({ stage: 'processing', total: 1, completed: 1 });
    return validateAndNormalize(result);
  }

  // Long transcript — split on sentence boundaries, process sequentially
  const chunks = splitIntoSentenceChunks(transcript);
  sendProgress({ stage: 'processing', total: chunks.length, completed: 0 });

  const results = [];
  for (let i = 0; i < chunks.length; i++) {
    // Only pass videoContext to the first chunk
    const req = buildRestructureRequest(chunks[i], resolvedModel, i === 0 ? videoContext : null);
    const result = await generate(req);
    results.push(result);
    sendProgress({ stage: 'processing', total: chunks.length, completed: i + 1 });
  }

  return validateAndNormalize(mergeResults(results));
}

const VALID_ENERGIES = new Set([
  'calm_intro', 'explanation', 'building_tension', 'climax',
  'enumeration', 'contrast', 'emotional', 'question', 'resolution',
]);
const VALID_MODES = new Set(['flow', 'stack', 'impact']);

function validateAndNormalize(data) {
  if (!data || !Array.isArray(data.sections) || data.sections.length === 0) {
    throw new Error('AI_PROCESSING_FAILED');
  }

  for (const section of data.sections) {
    if (!section.title || typeof section.title !== 'string') {
      throw new Error('AI_PROCESSING_FAILED');
    }
    if (!section.recap || typeof section.recap !== 'string') {
      section.recap = '';
    }
    if (!Array.isArray(section.thoughts) || section.thoughts.length === 0) {
      throw new Error('AI_PROCESSING_FAILED');
    }

    for (const thought of section.thoughts) {
      if (!thought || typeof thought.text !== 'string' || !thought.text.trim()) {
        throw new Error('AI_PROCESSING_FAILED');
      }
      if (!VALID_ENERGIES.has(thought.energy)) {
        thought.energy = 'explanation';
      }
      if (!VALID_MODES.has(thought.mode)) {
        thought.mode = 'flow';
      }
      if (typeof thought.complexity !== 'number' || thought.complexity < 0 || thought.complexity > 1) {
        thought.complexity = Math.min(1, Math.max(0, Number(thought.complexity) || 0.5));
      }
      if (!Array.isArray(thought.emphasis)) {
        thought.emphasis = [];
      }
    }
  }

  if (!Array.isArray(data.takeaways)) {
    data.takeaways = [];
  }

  return data;
}

// Chapter-aware pipeline: process each chapter independently
async function processWithChapters(chapters, sendProgress) {
  const model = await getModel();

  const health = await checkHealth();
  if (!health.running) throw new Error('OLLAMA_NOT_RUNNING');

  const modelCheck = await checkModel(model);
  if (!modelCheck.available) throw new Error('MODEL_NOT_FOUND');
  const resolvedModel = modelCheck.resolvedModel;

  // Count total LLM calls for progress (chapters may be sub-chunked)
  const chapterChunks = chapters.map(ch => splitChapterIntoSubChunks(ch.text));
  const totalCalls = chapterChunks.reduce((sum, chunks) => sum + chunks.length, 0);
  let completed = 0;
  sendProgress({ stage: 'processing', total: totalCalls, completed: 0 });

  const sections = [];
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    const chunks = chapterChunks[i];

    if (chunks.length === 1) {
      // Single call for this chapter
      const req = buildChapterRequest(chapter.title, chunks[0], resolvedModel);
      const result = await generate(req);
      completed++;
      sendProgress({ stage: 'processing', total: totalCalls, completed });

      sections.push({
        title: chapter.title,
        recap: result.recap || '',
        thoughts: result.thoughts || [],
      });
    } else {
      // Sub-chunked chapter — merge thoughts, use last chunk's recap
      const allThoughts = [];
      let recap = '';
      for (const chunk of chunks) {
        const req = buildChapterRequest(chapter.title, chunk, resolvedModel);
        const result = await generate(req);
        completed++;
        sendProgress({ stage: 'processing', total: totalCalls, completed });

        if (result.thoughts) allThoughts.push(...result.thoughts);
        if (result.recap) recap = result.recap;
      }

      sections.push({
        title: chapter.title,
        recap,
        thoughts: allThoughts,
      });
    }
  }

  return { sections, takeaways: [] };
}

function mergeResults(results) {
  const merged = { sections: [], takeaways: [] };

  for (const result of results) {
    if (result.sections) {
      merged.sections.push(...result.sections);
    }
  }

  // Takeaways from the last chunk — it has the most complete view
  // but ideally the final chunk covers the conclusion
  const last = results[results.length - 1];
  if (last?.takeaways) {
    merged.takeaways = last.takeaways;
  }

  return merged;
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'HEALTH_CHECK') {
    checkHealth().then(sendResponse);
    return true;
  }

  if (message.type === 'CHECK_MODEL') {
    checkModel(message.model || DEFAULT_MODEL).then(sendResponse);
    return true;
  }

  if (message.type === 'PROCESS_TRANSCRIPT') {
    const tabId = sender.tab?.id;
    const sendProgressToTab = (progress) => {
      if (tabId) {
        try { chrome.tabs.sendMessage(tabId, { type: 'PROCESSING_PROGRESS', ...progress }); } catch {}
      }
    };

    const pipeline = message.chapters?.length
      ? processWithChapters(message.chapters, sendProgressToTab).then(validateAndNormalize)
      : processTranscript(message.transcript, sendProgressToTab, message.durationSeconds || 0, message.videoContext || null);

    pipeline
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));

    return true;
  }
});
