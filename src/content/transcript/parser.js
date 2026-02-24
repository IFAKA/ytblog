// Parses YouTube's json3 transcript format into structured segments

window.YTBlog = window.YTBlog || {};

window.YTBlog.parseJson3 = function(json3Data) {
  const events = json3Data.events || [];
  const segments = [];

  for (const event of events) {
    if (!event.segs) continue;

    const text = event.segs
      .map(s => s.utf8 || '')
      .join('')
      .replace(/\n/g, ' ')
      .trim();

    if (!text) continue;

    segments.push({
      text,
      startMs: event.tStartMs || 0,
      durationMs: event.dDurationMs || 0,
      endMs: (event.tStartMs || 0) + (event.dDurationMs || 0),
    });
  }

  return segments;
};

window.YTBlog.segmentsToPlainText = function(segments) {
  return segments.map(s => s.text).join(' ');
};

// Map transcript segments to chapter time ranges
// Returns [{ title, text }] — plain text per chapter
window.YTBlog.mapSegmentsToChapters = function(segments, chapters) {
  if (!chapters || chapters.length === 0) return null;

  // Sort chapters by startMs to be safe
  const sorted = [...chapters].sort((a, b) => a.startMs - b.startMs);

  return sorted.map((chapter, i) => {
    const startMs = chapter.startMs;
    const endMs = i < sorted.length - 1 ? sorted[i + 1].startMs : Infinity;

    const chapterSegments = segments.filter(
      seg => seg.startMs >= startMs && seg.startMs < endMs
    );

    return {
      title: chapter.title,
      text: chapterSegments.map(s => s.text).join(' '),
    };
  }).filter(ch => ch.text.trim());
};
