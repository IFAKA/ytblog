// Highlighter — Text highlighting system for blog articles
// Select text → floating toolbar → one-click highlight
// Stored by video ID + thought index in chrome.storage.local

window.YTBlog = window.YTBlog || {};

(function() {
  'use strict';

  class Highlighter {
    constructor(stage, videoId) {
      this._stage = stage;
      this._videoId = videoId;
      this._storageKey = `highlights_${videoId}`;
      this._highlights = [];   // persisted items
      this._undoStack = [];    // for Z undo
      this._toolbar = null;
      this._countEl = null;

      this._onMouseUp = this._onMouseUp.bind(this);
      this._onKeyDown = this._onKeyDown.bind(this);

      stage.addEventListener('mouseup', this._onMouseUp);
      document.addEventListener('keydown', this._onKeyDown, true);

      this._loadHighlights();
    }

    // ——— Storage ———
    async _loadHighlights() {
      try {
        const result = await chrome.storage.local.get(this._storageKey);
        const data = result[this._storageKey];
        if (data?.items?.length) {
          this._highlights = data.items;
          this._restoreHighlights();
        }
      } catch {}
    }

    async _saveHighlights() {
      try {
        await chrome.storage.local.set({
          [this._storageKey]: { items: this._highlights }
        });
      } catch {}
      this._updateCount();
    }

    _restoreHighlights() {
      for (const item of this._highlights) {
        const el = this._stage.querySelector(
          `[data-section="${item.sectionIndex}"][data-thought="${item.thoughtIndex}"]`
        );
        if (!el) continue;

        try {
          // Find text node and offsets
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let charCount = 0;
          let startNode = null, startOffset = 0;
          let endNode = null, endOffset = 0;

          while (walker.nextNode()) {
            const node = walker.currentNode;
            const nodeLen = node.textContent.length;

            if (!startNode && charCount + nodeLen > item.startOffset) {
              startNode = node;
              startOffset = item.startOffset - charCount;
            }
            if (charCount + nodeLen >= item.endOffset) {
              endNode = node;
              endOffset = item.endOffset - charCount;
              break;
            }
            charCount += nodeLen;
          }

          if (startNode && endNode) {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            this._wrapRange(range, item.id);
          }
        } catch {}
      }
      this._updateCount();
    }

    // ——— Mouse Selection ———
    _onMouseUp(e) {
      // Delay slightly to let selection finalize
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.toString().trim()) {
          this._hideToolbar();
          return;
        }

        // Check if selection is within a thought element
        const range = sel.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const thoughtEl = (container.nodeType === Node.TEXT_NODE ? container.parentElement : container)
          ?.closest('[data-section][data-thought]');
        if (!thoughtEl || !this._stage.contains(thoughtEl)) {
          this._hideToolbar();
          return;
        }

        // Check if clicking on existing highlight → remove it
        const existingMark = e.target.closest('.ytblog-highlight');
        if (existingMark) {
          this._removeHighlight(existingMark);
          sel.removeAllRanges();
          return;
        }

        this._showToolbar(range);
      }, 10);
    }

    // ——— Toolbar ———
    _showToolbar(range) {
      this._hideToolbar();

      const rect = range.getBoundingClientRect();
      const stageRect = this._stage.getBoundingClientRect();

      this._toolbar = document.createElement('div');
      this._toolbar.className = 'ytblog-highlight-toolbar';

      const btn = document.createElement('button');
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L3 7l1.8 8.1L12 22l7.2-6.9L21 7z"/></svg> Highlight';
      btn.addEventListener('click', () => {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
          this.highlight(sel.getRangeAt(0));
          sel.removeAllRanges();
        }
        this._hideToolbar();
      });

      this._toolbar.appendChild(btn);
      this._stage.appendChild(this._toolbar);

      // Position above selection
      const toolbarRect = this._toolbar.getBoundingClientRect();
      const left = rect.left + rect.width / 2 - stageRect.left - toolbarRect.width / 2;
      const top = rect.top - stageRect.top - toolbarRect.height - 8;

      this._toolbar.style.left = `${Math.max(0, left)}px`;
      this._toolbar.style.top = `${Math.max(0, top)}px`;
    }

    _hideToolbar() {
      if (this._toolbar) {
        this._toolbar.remove();
        this._toolbar = null;
      }
    }

    // ——— Highlight Actions ———
    highlight(range) {
      // Find the thought element
      const container = range.commonAncestorContainer;
      const thoughtEl = (container.nodeType === Node.TEXT_NODE ? container.parentElement : container)
        ?.closest('[data-section][data-thought]');
      if (!thoughtEl) return;

      const sectionIndex = parseInt(thoughtEl.dataset.section);
      const thoughtIndex = parseInt(thoughtEl.dataset.thought);

      // Calculate text offsets within the thought element
      const preRange = document.createRange();
      preRange.selectNodeContents(thoughtEl);
      preRange.setEnd(range.startContainer, range.startOffset);
      const startOffset = preRange.toString().length;
      const endOffset = startOffset + range.toString().length;

      const id = `h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      // Wrap in <mark>
      this._wrapRange(range, id);

      // Store
      const item = {
        id,
        sectionIndex,
        thoughtIndex,
        startOffset,
        endOffset,
        text: range.toString(),
        createdAt: new Date().toISOString(),
      };
      this._highlights.push(item);
      this._undoStack.push({ action: 'add', item });
      this._saveHighlights();
    }

    highlightParagraph() {
      // Find the paragraph closest to the viewport center
      const paragraphs = this._stage.querySelectorAll('[data-section][data-thought]');
      if (!paragraphs.length) return;

      const viewportCenter = window.innerHeight / 2;
      let closest = null;
      let closestDist = Infinity;

      for (const p of paragraphs) {
        const rect = p.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const dist = Math.abs(center - viewportCenter);
        if (dist < closestDist) {
          closestDist = dist;
          closest = p;
        }
      }

      if (closest) {
        const range = document.createRange();
        range.selectNodeContents(closest);
        // Avoid re-highlighting already highlighted content
        if (closest.querySelector('.ytblog-highlight')) return;
        this.highlight(range);
      }
    }

    _wrapRange(range, id) {
      const mark = document.createElement('mark');
      mark.className = 'ytblog-highlight';
      mark.dataset.highlightId = id;
      mark.addEventListener('click', () => this._removeHighlight(mark));

      try {
        range.surroundContents(mark);
      } catch {
        // If range crosses element boundaries, extract and wrap
        const fragment = range.extractContents();
        mark.appendChild(fragment);
        range.insertNode(mark);
      }
    }

    _removeHighlight(markEl) {
      const id = markEl.dataset.highlightId;
      const parent = markEl.parentNode;
      while (markEl.firstChild) {
        parent.insertBefore(markEl.firstChild, markEl);
      }
      markEl.remove();
      parent.normalize();

      // Remove from storage
      const idx = this._highlights.findIndex(h => h.id === id);
      if (idx !== -1) {
        const removed = this._highlights.splice(idx, 1)[0];
        this._undoStack.push({ action: 'remove', item: removed });
        this._saveHighlights();
      }
    }

    undo() {
      const last = this._undoStack.pop();
      if (!last) return;

      if (last.action === 'add') {
        // Undo an add → remove the highlight
        const mark = this._stage.querySelector(`[data-highlight-id="${last.item.id}"]`);
        if (mark) {
          const parent = mark.parentNode;
          while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
          mark.remove();
          parent.normalize();
        }
        const idx = this._highlights.findIndex(h => h.id === last.item.id);
        if (idx !== -1) this._highlights.splice(idx, 1);
        this._saveHighlights();
      } else if (last.action === 'remove') {
        // Undo a remove → restore the highlight
        this._highlights.push(last.item);
        this._saveHighlights();
        this._restoreHighlights();
      }
    }

    // ——— Keyboard ———
    _onKeyDown(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      if (!this._stage.isConnected) return;

      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        this.highlightParagraph();
      } else if (e.key === 'z' || e.key === 'Z') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          this.undo();
        }
      }
    }

    // ——— Count Display ———
    _updateCount() {
      const count = this._highlights.length;

      if (!this._countEl && count > 0) {
        this._countEl = document.createElement('div');
        this._countEl.className = 'ytblog-highlight-count';
        // Insert after the article
        const article = this._stage.querySelector('.ytblog-article');
        if (article) article.appendChild(this._countEl);
      }

      if (this._countEl) {
        this._countEl.textContent = count > 0 ? `${count} highlight${count !== 1 ? 's' : ''}` : '';
      }
    }

    getHighlightCount() {
      return this._highlights.length;
    }

    // ——— Cleanup ———
    destroy() {
      this._stage.removeEventListener('mouseup', this._onMouseUp);
      document.removeEventListener('keydown', this._onKeyDown, true);
      this._hideToolbar();
    }
  }

  window.YTBlog.Highlighter = Highlighter;
})();
