// YTBlog Content Script — Orchestrator
// ISOLATED world: manages the full pipeline from transcript to blog article

(function() {
  'use strict';

  const YT = window.YTBlog;

  // ——— Service worker messaging with retry ———
  async function sendToSW(message, retries = 2) {
    for (let i = 0; i <= retries; i++) {
      try {
        return await chrome.runtime.sendMessage(message);
      } catch (err) {
        if (i < retries && /receiving end|could not establish/i.test(err.message)) {
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        throw err;
      }
    }
  }

  // ——— State ———
  let captionTracks = null;
  let videoInfo = null;
  let chapters = null;
  let extendedData = null;
  let blogRenderer = null;
  let highlighter = null;
  let active = false;
  let cachedResult = null;   // { videoId, processedData } — survives close/reopen

  // ——— Listen for caption data from MAIN world ———
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    if (event.data?.type === 'YTBLOG_CAPTION_DATA') {
      captionTracks = event.data.tracks;
      videoInfo = event.data.videoInfo;
      chapters = event.data.chapters || null;
      extendedData = event.data.extended || null;

      // Description timestamps as chapter fallback
      if (!chapters && extendedData?.descriptionTimestamps?.length >= 2) {
        chapters = extendedData.descriptionTimestamps.map(ts => ({
          title: ts.title,
          startMs: ts.startTimeSeconds * 1000,
          thumbnails: [],
        }));
      }

      YT.injectReadButton(handleReadClick, captionTracks);
    }
  });

  // ——— Listen for progress updates from service worker ———
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'PROCESSING_PROGRESS') {
      const stage = YT.getStage();
      if (stage) YT.updateLoadingProgress(stage, message);
    }
  });

  // ——— Main Read Click Handler ———
  async function handleReadClick() {
    if (active) {
      closeReader();
      return;
    }

    if (!captionTracks) {
      showError('no_captions');
      return;
    }

    active = true;

    const videoId = videoInfo?.videoId || new URLSearchParams(location.search).get('v');
    const stage = YT.replacePlayer();
    if (!stage) { active = false; return; }

    try {
      let processedData;

      // Reuse cached result if same video
      if (cachedResult && cachedResult.videoId === videoId) {
        processedData = cachedResult.processedData;
      } else {
        YT.showLoading(stage, videoInfo || {}, extendedData);

        // Fetch and parse transcript
        const selectedLang = document.getElementById('ytblog-lang-select')?.value || 'en';
        const { segments } = await YT.fetchTranscript(captionTracks, videoId, selectedLang);
        const plainText = YT.segmentsToPlainText(segments);

        if (!plainText.trim()) throw new Error('NO_CAPTIONS');

        // Map segments to chapters if available
        const chapterData = chapters ? YT.mapSegmentsToChapters(segments, chapters) : null;

        // AI processing — no fallback, quality or nothing
        const swMessage = {
          type: 'PROCESS_TRANSCRIPT',
          transcript: plainText,
          durationSeconds: videoInfo?.lengthSeconds || 0,
        };
        if (chapterData && chapterData.length > 0) {
          swMessage.chapters = chapterData;
        }
        if (extendedData) {
          swMessage.videoContext = {
            title: videoInfo?.title || '',
            description: extendedData.description || '',
            keywords: extendedData.keywords || [],
            category: extendedData.category || '',
          };
        }
        const response = await sendToSW(swMessage);

        if (!response?.success || !response.data?.sections?.length) {
          throw new Error(response?.error || 'AI_PROCESSING_FAILED');
        }

        processedData = response.data;

        // Map chapter data onto sections (thumbnails + timestamps)
        if (chapters) {
          for (let i = 0; i < Math.min(chapters.length, processedData.sections.length); i++) {
            const thumbs = chapters[i].thumbnails;
            if (thumbs?.length) {
              processedData.sections[i].thumbnailUrl = thumbs[thumbs.length - 1].url;
            }
            if (chapters[i].startMs !== undefined) {
              processedData.sections[i].timestampMs = chapters[i].startMs;
            }
          }
        }

        // Hide loading, wait for exit animation
        YT.hideLoading(stage);
        await new Promise(r => setTimeout(r, 450));

        // Cache for instant reopen
        cachedResult = { videoId, processedData };
      }

      // Render blog article
      blogRenderer = new YT.BlogRenderer(stage, processedData, {
        videoInfo,
        extendedData,
        onClose: closeReader,
      });

      // Initialize highlighter
      highlighter = new YT.Highlighter(stage, videoId);

    } catch (err) {
      console.error('[YTBlog] Error:', err);
      const type = err.message === 'NO_CAPTIONS' ? 'no_captions' : err.message;
      showError(type, null, err.message);
    }
  }

  // ——— Close Reader ———
  function closeReader() {
    if (blogRenderer) { blogRenderer.destroy(); blogRenderer = null; }
    if (highlighter) { highlighter.destroy(); highlighter = null; }

    YT.restorePlayer();
    active = false;
  }

  // ——— Error UI ———
  function showError(type, stage, detail) {
    if (!stage) {
      stage = YT.getStage() || YT.replacePlayer();
      if (!stage) return;
    }

    const content = stage.querySelector('.ytblog-content') || stage;
    content.innerHTML = '';

    const errors = {
      no_captions: {
        title: 'No Captions Available',
        message: 'This video doesn\'t have captions. YTBlog needs captions to create the reading experience.',
        actions: '<button class="ytblog-error-btn" id="ytblog-close-error-btn">Close</button>',
      },
      OLLAMA_NOT_RUNNING: {
        title: 'Ollama Not Running',
        message: 'YTBlog requires Ollama for AI-restructured prose. Start it and try again.',
        actions: `
          <code data-cmd="ollama serve">ollama serve</code>
          <div class="ytblog-error-actions">
            <button class="ytblog-error-btn" id="ytblog-close-error-btn">Close</button>
          </div>
        `,
      },
      MODEL_NOT_FOUND: {
        title: 'Model Not Found',
        message: 'Pull the required model and try again.',
        actions: `
          <code data-cmd="ollama pull llama3.2">ollama pull llama3.2</code>
          <div class="ytblog-error-actions">
            <button class="ytblog-error-btn" id="ytblog-close-error-btn">Close</button>
          </div>
        `,
      },
      AI_PROCESSING_FAILED: {
        title: 'AI Processing Failed',
        message: 'The AI couldn\'t process this transcript. Make sure Ollama is running and try again.',
        actions: '<button class="ytblog-error-btn" id="ytblog-close-error-btn">Close</button>',
      },
      generic: {
        title: 'Something Went Wrong',
        message: detail || 'An unexpected error occurred.',
        actions: '<button class="ytblog-error-btn" id="ytblog-close-error-btn">Close</button>',
      },
    };

    const err = errors[type] || errors.generic;

    const el = document.createElement('div');
    el.className = 'ytblog-error';
    el.innerHTML = `
      <div class="ytblog-error-title">${err.title}</div>
      <div class="ytblog-error-message">${err.message}</div>
      ${err.actions}
    `;
    content.appendChild(el);

    // Copy command on click
    el.querySelectorAll('code[data-cmd]').forEach(code => {
      code.addEventListener('click', () => {
        const cmd = code.dataset.cmd;
        navigator.clipboard.writeText(cmd);
        const original = code.textContent;
        code.textContent = 'Copied!';
        setTimeout(() => code.textContent = original, 1500);
      });
    });

    el.querySelector('#ytblog-close-error-btn')?.addEventListener('click', closeReader);
  }

  // ——— Keyboard Shortcuts ———
  document.addEventListener('keydown', (e) => {
    if (!active) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

    // Stop event from reaching YouTube's player controls
    e.stopPropagation();

    switch (e.key) {
      case 't':
      case 'T':
        closeReader();
        break;
      case 'Escape':
        closeReader();
        break;
      // H and Z handled by highlighter
    }
  }, true);

  // ——— SPA Cleanup ———
  document.addEventListener('yt-navigate-start', () => {
    if (active) closeReader();
    cachedResult = null;
    YT.removeReadButton();
  });
})();
