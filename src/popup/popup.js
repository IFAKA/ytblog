// Popup — routes all Ollama checks through the service worker (CSP-safe)

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

// Estimate max param size based on device memory
// navigator.deviceMemory returns approximate RAM in GB (capped at 8 for privacy)
// Rule of thumb: quantized models need ~0.6GB per 1B params
function getDeviceMaxParams() {
  const ram = navigator.deviceMemory || 4; // default assume 4GB if unavailable
  if (ram <= 2) return 1;
  if (ram <= 4) return 3;
  if (ram >= 8) return 14;  // 8GB+ can handle up to ~14B quantized
  return 7;
}

function getTierLabel(paramNum) {
  if (paramNum <= 3) return 'Fast';
  if (paramNum <= 9) return 'Balanced';
  if (paramNum <= 30) return 'Quality';
  return 'Best quality, slow';
}

function getTierDot(paramNum) {
  if (paramNum <= 3) return '\u{1F7E2}';   // green circle
  if (paramNum <= 9) return '\u{1F535}';   // blue circle
  if (paramNum <= 30) return '\u{1F7E3}';  // purple circle
  return '\u{1F7E0}';                      // orange circle
}

function pickBestModel(details, maxParams) {
  if (!details?.length) return null;
  const ranked = details
    .map(m => ({ ...m, paramNum: parseParamSize(m.paramSize) }))
    .filter(m => m.paramNum <= maxParams)
    .sort((a, b) => a.paramNum - b.paramNum);
  // Largest model that fits in the sweet spot (<=9B) AND within device cap
  const sweet = ranked.filter(m => m.paramNum <= 9);
  if (sweet.length) return sweet[sweet.length - 1];
  // If no sweet spot models fit, pick smallest that fits device
  if (ranked.length) return ranked[0];
  // Nothing fits device cap — fall back to smallest installed overall
  const all = details
    .map(m => ({ ...m, paramNum: parseParamSize(m.paramSize) }))
    .sort((a, b) => a.paramNum - b.paramNum);
  return all[0];
}

function populateModelDropdown(modelDetails, savedModel) {
  const select = document.getElementById('model-select');
  select.innerHTML = '';

  if (!modelDetails || modelDetails.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.disabled = true;
    opt.selected = true;
    opt.textContent = 'No models installed';
    select.appendChild(opt);
    return null;
  }

  const maxParams = getDeviceMaxParams();

  // Sort by param size ascending
  const sorted = modelDetails
    .map(m => ({ ...m, paramNum: parseParamSize(m.paramSize) }))
    .sort((a, b) => a.paramNum - b.paramNum);

  // Split into recommended (fits device) and oversized
  const recommended = sorted.filter(m => m.paramNum <= maxParams);
  const oversized = sorted.filter(m => m.paramNum > maxParams);

  for (const m of recommended) {
    const opt = document.createElement('option');
    opt.value = m.name;
    const sizeLabel = m.paramSize ? ` (${m.paramSize})` : '';
    const tier = getTierLabel(m.paramNum);
    const dot = getTierDot(m.paramNum);
    opt.textContent = `${dot} ${m.name}${sizeLabel} \u00B7 ${tier}`;
    select.appendChild(opt);
  }

  // Show oversized models with warning, but still selectable
  for (const m of oversized) {
    const opt = document.createElement('option');
    opt.value = m.name;
    const sizeLabel = m.paramSize ? ` (${m.paramSize})` : '';
    opt.textContent = `\u26A0\uFE0F ${m.name}${sizeLabel} \u00B7 May be slow`;
    select.appendChild(opt);
  }

  // Determine which model to select
  if (savedModel) {
    const match = sorted.find(m => m.name === savedModel || m.name.startsWith(savedModel + ':'));
    if (match) {
      select.value = match.name;
      return match.name;
    }
  }

  // Auto-select best model within device limits
  const best = pickBestModel(modelDetails, maxParams);
  if (best) {
    select.value = best.name;
    chrome.storage.local.set({ model: best.name });
    return best.name;
  }

  return sorted[0].name;
}

async function checkStatus() {
  const ollamaDot = document.getElementById('ollama-dot');
  const ollamaStatus = document.getElementById('ollama-status');
  const modelDot = document.getElementById('model-dot');
  const modelStatus = document.getElementById('model-status');
  const setupGuide = document.getElementById('setup-guide');
  const cmdPull = document.getElementById('cmd-pull');

  try {
    const health = await chrome.runtime.sendMessage({ type: 'HEALTH_CHECK' });

    if (!health || !health.running) throw new Error('Not running');

    ollamaDot.className = 'status-dot connected';
    ollamaStatus.textContent = 'Connected';

    const saved = (await chrome.storage.local.get('model')).model;
    const selectedModel = populateModelDropdown(health.modelDetails, saved);

    if (selectedModel) {
      modelDot.className = 'status-dot connected';
      modelStatus.textContent = selectedModel.split(':')[0];
      setupGuide.classList.remove('visible');
    } else {
      modelDot.className = 'status-dot disconnected';
      modelStatus.textContent = 'No models';
      setupGuide.classList.add('visible');
      cmdPull.textContent = 'ollama pull llama3.2';
    }
  } catch {
    ollamaDot.className = 'status-dot disconnected';
    ollamaStatus.textContent = 'Not running';
    modelDot.className = 'status-dot disconnected';
    modelStatus.textContent = '\u2014';
    setupGuide.classList.add('visible');
  }
}

document.querySelectorAll('.setup-guide code').forEach(el => {
  el.addEventListener('click', () => {
    navigator.clipboard.writeText(el.textContent);
    const original = el.textContent;
    el.textContent = 'Copied!';
    setTimeout(() => el.textContent = original, 1500);
  });
});

document.getElementById('model-select').addEventListener('change', () => {
  const value = document.getElementById('model-select').value;
  if (value) {
    chrome.storage.local.set({ model: value });
    checkStatus();
  }
});

document.getElementById('speed-select').addEventListener('change', () => {
  chrome.storage.local.set({ wpm: parseInt(document.getElementById('speed-select').value) });
});

// Load saved settings
chrome.storage.local.get(['wpm'], (result) => {
  if (result.wpm) document.getElementById('speed-select').value = String(result.wpm);
  checkStatus();
});
