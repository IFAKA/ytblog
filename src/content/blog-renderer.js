// BlogRenderer — Renders structured transcript data as a scrollable blog article
// 3 visual styles only: paragraph (flow), key insight (impact), list (stack)

window.YTBlog = window.YTBlog || {};

(function() {
  'use strict';

  class BlogRenderer {
    constructor(stage, data, options = {}) {
      this._stage = stage;
      this._data = data;               // { sections, takeaways }
      this._videoInfo = options.videoInfo || {};
      this._extendedData = options.extendedData || {};
      this._onClose = options.onClose || (() => {});

      this._progressFill = null;
      this._tocItems = [];
      this._sectionEls = [];
      this._observer = null;
      this._scrollHandler = null;

      this._render();
    }

    // ——— Reading Time ———
    _estimateReadingTime() {
      let totalWords = 0;
      for (const section of this._data.sections) {
        for (const thought of section.thoughts) {
          totalWords += thought.text.split(/\s+/).length;
        }
      }
      return Math.max(1, Math.round(totalWords / 238));
    }

    // ——— TL;DR ———
    _generateTldr() {
      // Use first section recap, or first 2 takeaways
      const firstRecap = this._data.sections[0]?.recap;
      if (firstRecap && firstRecap.length < 150) return firstRecap;
      if (this._data.takeaways?.length >= 2) {
        return this._data.takeaways.slice(0, 2).join(' ');
      }
      return firstRecap || '';
    }

    // ——— Main Render ———
    _render() {
      const content = this._stage.querySelector('.ytblog-content');
      if (!content) return;
      content.innerHTML = '';

      // Progress bar
      const progress = document.createElement('div');
      progress.className = 'ytblog-article-progress';
      this._progressFill = document.createElement('div');
      this._progressFill.className = 'ytblog-article-progress-fill';
      progress.appendChild(this._progressFill);
      content.appendChild(progress);

      // Article wrapper
      const article = document.createElement('article');
      article.className = 'ytblog-article';

      // Close button
      article.appendChild(this._renderCloseButton());

      // Header
      article.appendChild(this._renderHeader());

      // TL;DR
      const tldr = this._generateTldr();
      if (tldr) article.appendChild(this._renderTldr(tldr));

      // Table of Contents (if >1 section)
      if (this._data.sections.length > 1) {
        article.appendChild(this._renderToc());
      }

      // Sections
      this._data.sections.forEach((section, i) => {
        article.appendChild(this._renderSection(section, i));
      });

      // Takeaways
      if (this._data.takeaways?.length) {
        article.appendChild(this._renderTakeaways());
      }

      // Return to Video button
      article.appendChild(this._renderReturnButton());

      content.appendChild(article);

      // Bind scroll-based progress + TOC highlighting
      this._bindScroll(content);
    }

    // ——— Close Button ———
    _renderCloseButton() {
      const btn = document.createElement('button');
      btn.className = 'ytblog-article-close';
      btn.innerHTML = '&times;';
      btn.title = 'Close (T)';
      btn.addEventListener('click', () => this._onClose());
      return btn;
    }

    // ——— Header ———
    _renderHeader() {
      const header = document.createElement('header');

      // Title
      const h1 = document.createElement('h1');
      h1.className = 'ytblog-article-title';
      h1.textContent = this._videoInfo.title || 'Untitled Video';
      header.appendChild(h1);

      // Meta row
      const meta = document.createElement('div');
      meta.className = 'ytblog-article-meta';

      // Channel avatar + name
      const avatarUrl = this._extendedData?.channelAvatar;
      if (avatarUrl) {
        const avatar = document.createElement('img');
        avatar.className = 'ytblog-article-avatar';
        avatar.src = avatarUrl;
        avatar.alt = '';
        meta.appendChild(avatar);
      }

      const channel = this._videoInfo.author || this._extendedData?.channelName || '';
      if (channel) {
        const channelEl = document.createElement('span');
        channelEl.className = 'ytblog-article-channel';
        channelEl.textContent = channel;
        meta.appendChild(channelEl);
      }

      // Reading time badge
      const readTime = this._estimateReadingTime();
      const badge = document.createElement('span');
      badge.className = 'ytblog-article-reading-time';
      badge.textContent = `${readTime} min read`;
      meta.appendChild(badge);

      // Copy as Markdown button
      const copyBtn = document.createElement('button');
      copyBtn.className = 'ytblog-article-copy-btn';
      copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy';
      copyBtn.addEventListener('click', () => this._copyAsMarkdown(copyBtn));
      meta.appendChild(copyBtn);

      header.appendChild(meta);
      return header;
    }

    // ——— TL;DR Card ———
    _renderTldr(text) {
      const tldr = document.createElement('div');
      tldr.className = 'ytblog-article-tldr';
      const label = document.createElement('strong');
      label.textContent = 'TL;DR: ';
      label.style.fontStyle = 'normal';
      tldr.appendChild(label);
      tldr.appendChild(document.createTextNode(text));
      return tldr;
    }

    // ——— Table of Contents ———
    _renderToc() {
      const nav = document.createElement('nav');
      nav.className = 'ytblog-article-toc';

      const title = document.createElement('div');
      title.className = 'ytblog-article-toc-title';
      title.textContent = 'Contents';
      nav.appendChild(title);

      const list = document.createElement('ol');
      list.className = 'ytblog-article-toc-list';

      this._data.sections.forEach((section, i) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `#ytblog-section-${i}`;
        a.textContent = section.title;
        a.addEventListener('click', (e) => {
          e.preventDefault();
          document.getElementById(`ytblog-section-${i}`)?.scrollIntoView({ behavior: 'smooth' });
        });
        li.appendChild(a);
        list.appendChild(li);
        this._tocItems.push(li);
      });

      nav.appendChild(list);
      return nav;
    }

    // ——— Section ———
    _renderSection(section, sectionIndex) {
      const el = document.createElement('section');
      el.id = `ytblog-section-${sectionIndex}`;
      this._sectionEls.push(el);

      // Chapter thumbnail
      if (section.thumbnailUrl) {
        const img = document.createElement('img');
        img.className = 'ytblog-article-section-thumb';
        img.src = section.thumbnailUrl;
        img.alt = section.title || '';
        img.loading = 'lazy';
        el.appendChild(img);
      }

      // Heading with optional timestamp
      const h2 = document.createElement('h2');
      h2.className = 'ytblog-article-h2';
      h2.textContent = section.title;

      if (section.timestampMs !== undefined) {
        const ts = document.createElement('span');
        ts.className = 'ytblog-article-timestamp';
        const totalSec = Math.floor(section.timestampMs / 1000);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        ts.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
        ts.addEventListener('click', () => this._handleTimestampClick(section.timestampMs));
        h2.appendChild(ts);
      }

      el.appendChild(h2);

      // Thoughts — group consecutive stack modes into lists
      let i = 0;
      while (i < section.thoughts.length) {
        const thought = section.thoughts[i];

        if (thought.mode === 'stack') {
          // Collect consecutive stack thoughts into a <ul>
          const ul = document.createElement('ul');
          ul.className = 'ytblog-article-list';
          while (i < section.thoughts.length && section.thoughts[i].mode === 'stack') {
            const li = document.createElement('li');
            li.dataset.section = sectionIndex;
            li.dataset.thought = i;
            li.innerHTML = this._processText(section.thoughts[i].text, section.thoughts[i].emphasis);
            ul.appendChild(li);
            i++;
          }
          el.appendChild(ul);
        } else if (thought.mode === 'impact') {
          const p = document.createElement('p');
          p.className = 'ytblog-article-insight';
          p.dataset.section = sectionIndex;
          p.dataset.thought = i;
          p.innerHTML = this._processText(thought.text, thought.emphasis);
          el.appendChild(p);
          i++;
        } else {
          // flow (default)
          const p = document.createElement('p');
          p.dataset.section = sectionIndex;
          p.dataset.thought = i;
          p.innerHTML = this._processText(thought.text, thought.emphasis);
          el.appendChild(p);
          i++;
        }
      }

      // Section recap
      if (section.recap) {
        el.appendChild(this._renderSectionRecap(section.recap));
      }

      return el;
    }

    // ——— Section Recap ———
    _renderSectionRecap(recap) {
      const div = document.createElement('div');
      div.className = 'ytblog-article-recap';
      div.textContent = recap;
      return div;
    }

    // ——— Takeaways ———
    _renderTakeaways() {
      const box = document.createElement('div');
      box.className = 'ytblog-article-takeaways';

      const title = document.createElement('div');
      title.className = 'ytblog-article-takeaways-title';
      title.textContent = 'Key Takeaways';
      box.appendChild(title);

      const list = document.createElement('ul');
      list.className = 'ytblog-article-takeaways-list';
      for (const takeaway of this._data.takeaways) {
        const li = document.createElement('li');
        li.textContent = takeaway;
        list.appendChild(li);
      }
      box.appendChild(list);

      // Endscreen videos (read next)
      const endscreen = this._extendedData?.endscreenVideos;
      if (endscreen?.length) {
        const readnext = document.createElement('div');
        readnext.className = 'ytblog-readnext';

        const label = document.createElement('div');
        label.className = 'ytblog-readnext-label';
        label.textContent = 'Read Next';
        readnext.appendChild(label);

        const grid = document.createElement('div');
        grid.className = 'ytblog-readnext-grid';

        for (const video of endscreen.slice(0, 4)) {
          const card = document.createElement('a');
          card.className = 'ytblog-readnext-card';
          card.href = `https://www.youtube.com/watch?v=${video.videoId}`;

          const thumbUrl = video.thumbnail || (video.thumbnails?.length ? video.thumbnails[video.thumbnails.length - 1].url : '');
          if (thumbUrl) {
            const thumb = document.createElement('div');
            thumb.className = 'ytblog-readnext-thumb';
            thumb.style.backgroundImage = `url(${thumbUrl})`;
            card.appendChild(thumb);
          }

          const cardTitle = document.createElement('div');
          cardTitle.className = 'ytblog-readnext-title';
          cardTitle.textContent = video.title || '';
          card.appendChild(cardTitle);

          grid.appendChild(card);
        }
        readnext.appendChild(grid);
        box.appendChild(readnext);
      }

      return box;
    }

    // ——— Return Button ———
    _renderReturnButton() {
      const btn = document.createElement('button');
      btn.className = 'ytblog-article-return';
      btn.textContent = 'Return to Video';
      btn.addEventListener('click', () => this._onClose());
      return btn;
    }

    // ——— Text Processing ———
    _processText(text, emphasis) {
      if (!text) return '';

      // Render KaTeX math first (preserve from being mangled by emphasis)
      let html = this._renderMath(text);

      // Apply emphasis words as <strong>
      if (emphasis?.length) {
        for (const word of emphasis) {
          // Escape regex special chars
          const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          // Match whole word, case insensitive, but not inside HTML tags
          const regex = new RegExp(`(?<![<\\w])\\b(${escaped})\\b(?![\\w>])`, 'gi');
          html = html.replace(regex, '<strong>$1</strong>');
        }
      }

      return html;
    }

    _renderMath(text) {
      // Block math: $$...$$
      text = text.replace(/\$\$([^$]+)\$\$/g, (_, expr) => {
        try {
          const rendered = katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false });
          return `<span class="ytblog-math ytblog-math-block">${rendered}</span>`;
        } catch {
          return `$$${expr}$$`;
        }
      });

      // Inline math: $...$
      text = text.replace(/\$([^$]+)\$/g, (_, expr) => {
        try {
          const rendered = katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false });
          return `<span class="ytblog-math">${rendered}</span>`;
        } catch {
          return `$${expr}$`;
        }
      });

      return text;
    }

    // ——— Timestamp Click ———
    _handleTimestampClick(ms) {
      this._onClose();
      // After player is restored, seek to timestamp
      setTimeout(() => {
        const video = document.querySelector('#movie_player video');
        if (video) {
          video.currentTime = ms / 1000;
          video.play().catch(() => {});
        }
      }, 100);
    }

    // ——— Copy as Markdown ———
    _copyAsMarkdown(btn) {
      const lines = [];
      const info = this._videoInfo;

      lines.push(`# ${info.title || 'Untitled'}`);
      lines.push('');
      if (info.author) lines.push(`*${info.author}*`);
      lines.push(`*${this._estimateReadingTime()} min read*`);
      lines.push('');

      // TL;DR
      const tldr = this._generateTldr();
      if (tldr) {
        lines.push(`> **TL;DR:** ${tldr}`);
        lines.push('');
      }

      // Sections
      for (const section of this._data.sections) {
        lines.push(`## ${section.title}`);
        lines.push('');

        for (const thought of section.thoughts) {
          if (thought.mode === 'stack') {
            lines.push(`- ${thought.text}`);
          } else if (thought.mode === 'impact') {
            lines.push(`**${thought.text}**`);
            lines.push('');
          } else {
            lines.push(thought.text);
            lines.push('');
          }
        }

        if (section.recap) {
          lines.push(`*${section.recap}*`);
          lines.push('');
        }
      }

      // Takeaways
      if (this._data.takeaways?.length) {
        lines.push('## Key Takeaways');
        lines.push('');
        for (const t of this._data.takeaways) {
          lines.push(`- ${t}`);
        }
      }

      const md = lines.join('\n');
      navigator.clipboard.writeText(md).then(() => {
        const original = btn.innerHTML;
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!';
        setTimeout(() => { btn.innerHTML = original; }, 2000);
      });
    }

    // ——— Scroll Binding ———
    _bindScroll(scrollContainer) {
      // Find the scrollable parent (the content area or stage)
      const scrollEl = scrollContainer;

      // Progress bar
      this._scrollHandler = () => {
        const scrollTop = scrollEl.scrollTop;
        const scrollHeight = scrollEl.scrollHeight - scrollEl.clientHeight;
        const pct = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
        if (this._progressFill) {
          this._progressFill.style.width = `${Math.min(100, pct)}%`;
        }
      };
      scrollEl.addEventListener('scroll', this._scrollHandler, { passive: true });

      // TOC active highlighting via IntersectionObserver
      if (this._sectionEls.length > 1 && this._tocItems.length > 0) {
        this._observer = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const idx = this._sectionEls.indexOf(entry.target);
              if (idx !== -1) {
                this._tocItems.forEach((li, i) => {
                  li.classList.toggle('ytblog-article-toc-active', i === idx);
                });
              }
            }
          }
        }, {
          root: scrollEl,
          rootMargin: '-10% 0px -80% 0px',
          threshold: 0,
        });

        for (const el of this._sectionEls) {
          this._observer.observe(el);
        }
      }
    }

    // ——— Destroy ———
    destroy() {
      if (this._observer) {
        this._observer.disconnect();
        this._observer = null;
      }
      if (this._scrollHandler) {
        const content = this._stage.querySelector('.ytblog-content');
        if (content) content.removeEventListener('scroll', this._scrollHandler);
        this._scrollHandler = null;
      }
    }
  }

  window.YTBlog.BlogRenderer = BlogRenderer;
})();
