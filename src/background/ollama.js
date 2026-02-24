const OLLAMA_BASE = 'http://localhost:11434';

export async function checkHealth() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { running: false, models: [] };
    const data = await res.json();
    const rawModels = data.models || [];
    const modelDetails = rawModels.map(m => ({
      name: m.name,
      paramSize: m.details?.parameter_size || '',
      quantization: m.details?.quantization_level || '',
      family: m.details?.family || '',
      sizeBytes: m.size || 0,
    }));
    return {
      running: true,
      models: rawModels.map(m => m.name),
      modelDetails,
    };
  } catch {
    return { running: false, models: [] };
  }
}

export async function checkModel(name) {
  const health = await checkHealth();
  if (!health.running) return { available: false, reason: 'ollama_not_running' };
  const match = health.models.find(m => m === name || m.startsWith(name + ':'));
  return { available: !!match, resolvedModel: match || null, reason: match ? null : 'model_not_found', models: health.models };
}

export async function generate({ model, prompt, system, format = 'json', stream = false }) {
  const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, system, format, stream }),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }

  const data = await res.json();
  let parsed;
  try {
    parsed = typeof data.response === 'string' ? JSON.parse(data.response) : data.response;
  } catch {
    throw new Error('Failed to parse Ollama JSON response');
  }

  // Validate expected structure (sections array with thoughts)
  if (parsed && parsed.sections) {
    if (!Array.isArray(parsed.sections)) {
      throw new Error('Invalid response: sections must be an array');
    }
    for (let i = 0; i < parsed.sections.length; i++) {
      const s = parsed.sections[i];
      if (!s.thoughts || !Array.isArray(s.thoughts)) {
        parsed.sections[i].thoughts = [];
      }
      if (!s.title) {
        parsed.sections[i].title = `Section ${i + 1}`;
      }
    }
    // Filter out empty sections
    parsed.sections = parsed.sections.filter(s => s.thoughts.length > 0);
    if (!Array.isArray(parsed.takeaways)) {
      parsed.takeaways = [];
    }
  }

  return parsed;
}
