// Manages swapping between YouTube's video player and the YTBlog stage
// Uses theater mode for full-width reading area when available

window.YTBlog = window.YTBlog || {};

(function() {
  let originalPlayerDisplay = null;
  let forcedTheater = false;
  let hiddenElements = [];

  window.YTBlog.replacePlayer = function() {
    const watchFlexy = document.querySelector('ytd-watch-flexy');
    const player = document.getElementById('movie_player');
    const fullBleed = document.getElementById('full-bleed-container');

    // Theater mode approach
    if (watchFlexy && player && fullBleed) {
      // Store original state
      forcedTheater = !watchFlexy.hasAttribute('theater');
      originalPlayerDisplay = player.style.display;

      // Force theater mode if not already
      if (forcedTheater) {
        watchFlexy.setAttribute('theater', '');
        watchFlexy.setAttribute('full-bleed-player', '');
      }

      // Pause and hide video
      const video = player.querySelector('video');
      if (video) video.pause();
      player.style.display = 'none';

      // Hide YouTube's below-player UI (title, description, comments, sidebar)
      hiddenElements = [];
      const below = document.getElementById('below');
      const secondary = document.getElementById('secondary');
      if (below) { hiddenElements.push([below, below.style.display]); below.style.display = 'none'; }
      if (secondary) { hiddenElements.push([secondary, secondary.style.display]); secondary.style.display = 'none'; }

      // Create stage inside full-bleed container
      const stage = document.createElement('div');
      stage.id = 'ytblog-stage';
      stage.className = 'ytblog-root';

      const content = document.createElement('div');
      content.className = 'ytblog-content';
      stage.appendChild(content);

      fullBleed.appendChild(stage);
      return stage;
    }

    // Fallback: insert before player (same as yt-presenter)
    if (!player) return null;

    const video = player.querySelector('video');
    if (video) video.pause();

    originalPlayerDisplay = player.style.display;
    const rect = player.getBoundingClientRect();
    player.style.display = 'none';

    const stage = document.createElement('div');
    stage.id = 'ytblog-stage';
    stage.className = 'ytblog-root';
    stage.style.width = `${rect.width}px`;
    stage.style.minHeight = '400px';

    const content = document.createElement('div');
    content.className = 'ytblog-content';
    stage.appendChild(content);

    player.parentElement.insertBefore(stage, player);
    return stage;
  };

  window.YTBlog.restorePlayer = function() {
    const stage = document.getElementById('ytblog-stage');
    if (stage) stage.remove();

    const player = document.getElementById('movie_player');
    if (player) {
      player.style.display = originalPlayerDisplay || '';
      const video = player.querySelector('video');
      if (video) video.play().catch(() => {});
    }

    // Restore hidden YouTube UI elements
    for (const [el, origDisplay] of hiddenElements) {
      el.style.display = origDisplay || '';
    }
    hiddenElements = [];

    // Restore non-theater mode if we forced it
    if (forcedTheater) {
      const watchFlexy = document.querySelector('ytd-watch-flexy');
      if (watchFlexy) {
        watchFlexy.removeAttribute('theater');
        watchFlexy.removeAttribute('full-bleed-player');
      }
      forcedTheater = false;
    }

    originalPlayerDisplay = null;
  };

  window.YTBlog.getStage = function() {
    return document.getElementById('ytblog-stage');
  };

  window.YTBlog.getContentArea = function() {
    const stage = window.YTBlog.getStage();
    return stage?.querySelector('.ytblog-content') || null;
  };
})();
