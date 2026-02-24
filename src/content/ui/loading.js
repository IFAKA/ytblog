// Loading state: shows video title + channel with shimmer animation

window.YTBlog = window.YTBlog || {};

(function() {
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatViewCount(n) {
    const num = parseInt(n, 10);
    if (!num) return '';
    if (num >= 1e9) return (num / 1e9).toFixed(1).replace(/\.0$/, '') + 'B views';
    if (num >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M views';
    if (num >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K views';
    return num.toLocaleString() + ' views';
  }

  function formatDate(str) {
    if (!str) return '';
    try {
      const d = new Date(str);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return ''; }
  }

  window.YTBlog.showLoading = function(stage, videoInfo, extended) {
    const content = stage.querySelector('.ytblog-content');
    if (!content) return;

    content.innerHTML = '';

    // Backdrop from maxres thumbnail
    if (extended?.maxThumbnail) {
      const backdrop = document.createElement('div');
      backdrop.className = 'ytblog-loading-backdrop';
      backdrop.style.backgroundImage = `url(${extended.maxThumbnail})`;
      stage.appendChild(backdrop);
    }

    const loader = document.createElement('div');
    loader.className = 'ytblog-loading';

    // Social proof row
    let socialHtml = '';
    if (extended?.channelAvatar || extended?.channelSubscribers) {
      const avatarHtml = extended.channelAvatar
        ? `<img class="ytblog-loading-avatar" src="${escapeHtml(extended.channelAvatar)}" alt="">`
        : '';
      const channelHtml = videoInfo.channelName
        ? `<span>${escapeHtml(videoInfo.channelName)}</span>`
        : '';
      const subsHtml = extended.channelSubscribers
        ? `<span class="ytblog-loading-subs">${escapeHtml(extended.channelSubscribers)}</span>`
        : '';
      socialHtml = `<div class="ytblog-loading-social">${avatarHtml}${channelHtml}${subsHtml}</div>`;
    } else if (videoInfo.channelName) {
      socialHtml = `<div class="ytblog-loading-channel">${escapeHtml(videoInfo.channelName)}</div>`;
    }

    // Metadata row
    let metaParts = [];
    if (extended?.viewCount) metaParts.push(formatViewCount(extended.viewCount));
    if (extended?.publishDate) metaParts.push(formatDate(extended.publishDate));
    if (extended?.category) metaParts.push(escapeHtml(extended.category));
    const metaHtml = metaParts.length
      ? `<div class="ytblog-loading-meta">${metaParts.join(' &middot; ')}</div>`
      : '';

    loader.innerHTML = `
      <div class="ytblog-loading-title">${escapeHtml(videoInfo.title || 'Processing...')}</div>
      ${socialHtml}
      ${metaHtml}
      <div class="ytblog-loading-status">
        <span class="ytblog-loading-text">Processing with AI</span>
        <span class="ytblog-loading-dots"><span>.</span><span>.</span><span>.</span></span>
      </div>
      <div class="ytblog-loading-progress">
        <div class="ytblog-loading-bar"></div>
      </div>
    `;

    content.appendChild(loader);
  };

  window.YTBlog.updateLoadingProgress = function(stage, progress) {
    const bar = stage?.querySelector('.ytblog-loading-bar');
    const statusText = stage?.querySelector('.ytblog-loading-text');

    if (bar && progress.total > 0) {
      const pct = Math.round((progress.completed / progress.total) * 100);
      bar.style.width = `${pct}%`;
    }

    if (statusText && progress.stage) {
      const stageLabels = { structure: 'Analyzing structure', restructure: 'Restructuring prose' };
      statusText.textContent = stageLabels[progress.stage] || 'Processing with AI';
    }
  };

  window.YTBlog.hideLoading = function(stage) {
    const loader = stage?.querySelector('.ytblog-loading');
    if (loader) {
      loader.classList.add('ytblog-loading-exit');
      setTimeout(() => loader.remove(), 400);
    }
    const backdrop = stage?.querySelector('.ytblog-loading-backdrop');
    if (backdrop) {
      backdrop.style.opacity = '0';
      setTimeout(() => backdrop.remove(), 400);
    }
  };
})();
