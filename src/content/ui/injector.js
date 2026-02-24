// Injects the "Read" button into YouTube's action bar

window.YTBlog = window.YTBlog || {};

window.YTBlog.injectReadButton = function(onClick, captionTracks) {
  const existing = document.getElementById('ytblog-read-btn');
  if (existing) existing.remove();
  const existingLang = document.getElementById('ytblog-lang-select');
  if (existingLang) existingLang.remove();

  const button = document.createElement('button');
  button.id = 'ytblog-read-btn';
  button.className = 'ytblog-read-btn';
  button.innerHTML = `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
    </svg>
    <span>Read</span>
  `;
  button.addEventListener('click', onClick);

  // Language selector dropdown
  let langSelect = null;
  if (captionTracks && captionTracks.length >= 2) {
    langSelect = document.createElement('select');
    langSelect.id = 'ytblog-lang-select';
    langSelect.className = 'ytblog-lang-select';

    // Deduplicate by languageCode, prefer non-asr
    const seen = new Map();
    for (const track of captionTracks) {
      const code = track.languageCode;
      if (!seen.has(code) || (seen.get(code).kind === 'asr' && track.kind !== 'asr')) {
        seen.set(code, track);
      }
    }

    for (const [code, track] of seen) {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = track.name?.simpleText || code;
      if (code === 'en') opt.selected = true;
      langSelect.appendChild(opt);
    }
  }

  const insertButton = () => {
    // Insert as a sibling before the actions row, inside the menu-renderer
    // which is a flex container that can hold our button
    const menuRenderer = document.querySelector(
      'ytd-watch-metadata ytd-menu-renderer.ytd-watch-metadata'
    );
    if (menuRenderer) {
      menuRenderer.insertBefore(button, menuRenderer.firstChild);
      if (langSelect) menuRenderer.insertBefore(langSelect, button.nextSibling);
      return true;
    }
    // Fallback: insert before the actions flex container
    const flexContainer = document.querySelector(
      '#top-level-buttons-computed'
    );
    if (flexContainer?.parentElement) {
      flexContainer.parentElement.insertBefore(button, flexContainer);
      if (langSelect) flexContainer.parentElement.insertBefore(langSelect, button.nextSibling);
      return true;
    }
    return false;
  };

  if (!insertButton()) {
    const observer = new MutationObserver((_, obs) => {
      if (insertButton()) obs.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10000);
  }

  return button;
};

window.YTBlog.removeReadButton = function() {
  const btn = document.getElementById('ytblog-read-btn');
  if (btn) btn.remove();
  const lang = document.getElementById('ytblog-lang-select');
  if (lang) lang.remove();
};
