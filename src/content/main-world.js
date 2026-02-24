// MAIN world script — has access to YouTube's page JS context
// Extracts caption tracks and fetches transcript via ANDROID innertube client
// (ANDROID client returns timedtext URLs that don't require POT tokens)

(function() {
  'use strict';

  function extractCaptionTracks() {
    const sources = [
      () => window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks,
      () => window.ytplayer?.config?.args?.raw_player_response?.captions?.playerCaptionsTracklistRenderer?.captionTracks,
      () => document.getElementById('movie_player')?.getPlayerResponse?.()?.captions?.playerCaptionsTracklistRenderer?.captionTracks,
    ];
    for (const src of sources) {
      try { const t = src(); if (t) return t; } catch {}
    }
    return null;
  }

  function extractChapters() {
    try {
      // YouTube stores chapters in both ytInitialPlayerResponse and ytInitialData
      // but playerOverlays with chapter data is typically in ytInitialData
      const sources = [window.ytInitialData, window.ytInitialPlayerResponse];

      for (const source of sources) {
        if (!source) continue;

        // Path 1: playerOverlays → multiMarkersPlayerBarRenderer
        const markersMap = source?.playerOverlays
          ?.playerOverlayRenderer?.decoratedPlayerBarRenderer
          ?.decoratedPlayerBarRenderer?.playerBar
          ?.multiMarkersPlayerBarRenderer?.markersMap;
        if (markersMap) {
          for (const entry of markersMap) {
            const chapters = entry?.value?.chapters;
            if (chapters?.length > 1) {
              return chapters.map(ch => {
                const r = ch.chapterRenderer;
                return {
                  title: r?.title?.simpleText || '',
                  startMs: r?.timeRangeStartMillis || 0,
                  thumbnails: r?.thumbnail?.thumbnails || [],
                };
              }).filter(ch => ch.title);
            }
          }
        }

        // Path 2: engagementPanels → macroMarkersListRenderer
        const panels = source?.engagementPanels;
        if (panels) {
          for (const panel of panels) {
            const contents = panel?.engagementPanelSectionListRenderer
              ?.content?.macroMarkersListRenderer?.contents;
            if (contents?.length > 1) {
              return contents.map(item => {
                const r = item.macroMarkersListItemRenderer;
                return {
                  title: r?.title?.simpleText || '',
                  startMs: (r?.timeDescription?.simpleText
                    ? parseTimestamp(r.timeDescription.simpleText)
                    : r?.timeRangeStartMillis || 0),
                  thumbnails: r?.thumbnail?.thumbnails || [],
                };
              }).filter(ch => ch.title);
            }
          }
        }
      }

      return null;
    } catch (e) {
      console.warn('[YTBlog] Failed to extract chapters:', e);
      return null;
    }
  }

  function extractExtendedData() {
    try {
      const player = window.ytInitialPlayerResponse;
      const data = window.ytInitialData;
      const details = player?.videoDetails;
      const microformat = player?.microformat?.playerMicroformatRenderer;

      // Max resolution thumbnail
      const thumbs = details?.thumbnail?.thumbnails || [];
      const maxThumbnail = thumbs.length ? thumbs[thumbs.length - 1].url : null;

      // Keywords and description
      const keywords = details?.keywords || [];
      const description = details?.shortDescription || '';
      const category = microformat?.category || '';
      const publishDate = microformat?.publishDate || '';
      const viewCount = details?.viewCount || '';

      // Endscreen videos
      const endscreenVideos = [];
      const endscreen = player?.endscreen?.endscreenRenderer?.elements;
      if (endscreen) {
        for (const el of endscreen) {
          const r = el.endscreenElementRenderer;
          if (r?.style === 'VIDEO' && r?.videoDuration) {
            const vThumbs = r.image?.thumbnails || [];
            endscreenVideos.push({
              videoId: r.endpoint?.watchEndpoint?.videoId || '',
              title: r.title?.simpleText || '',
              thumbnail: vThumbs.length ? vThumbs[vThumbs.length - 1].url : '',
            });
          }
        }
      }

      // Caption track metadata (language options for language selector)
      const captionTrackMeta = (player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [])
        .map(t => ({ languageCode: t.languageCode, name: t.name?.simpleText || t.languageCode, kind: t.kind }));

      // Channel avatar + subscribers from ytInitialData
      let channelAvatar = '';
      let channelSubscribers = '';
      let descriptionTimestamps = [];

      if (data) {
        // Channel info from videoSecondaryInfoRenderer
        const secondary = data?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
        if (secondary) {
          for (const item of secondary) {
            const owner = item.videoSecondaryInfoRenderer?.owner?.videoOwnerRenderer;
            if (owner) {
              const avatarThumbs = owner.thumbnail?.thumbnails || [];
              channelAvatar = avatarThumbs.length ? avatarThumbs[avatarThumbs.length - 1].url : '';
              channelSubscribers = owner.subscriberCountText?.simpleText || '';
              break;
            }
          }
        }

        // Description timestamps from commandRuns
        const attrDesc = data?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
        if (attrDesc) {
          for (const item of attrDesc) {
            const desc = item.videoPrimaryInfoRenderer?.description;
            if (desc?.commandRuns) {
              for (const run of desc.commandRuns) {
                const watchEndpoint = run.onTap?.innertubeCommand?.watchEndpoint;
                if (watchEndpoint?.startTimeSeconds !== undefined) {
                  descriptionTimestamps.push({
                    startTimeSeconds: watchEndpoint.startTimeSeconds,
                    startIndex: run.startIndex,
                    length: run.length,
                  });
                }
              }
              // Extract titles from the description text
              const descText = (desc.runs || []).map(r => r.text).join('');
              descriptionTimestamps = descriptionTimestamps.map(ts => {
                const afterTs = descText.substring(ts.startIndex + ts.length).split('\n')[0].trim();
                return { ...ts, title: afterTs };
              }).filter(ts => ts.title);
              break;
            }
          }
        }
      }

      return {
        maxThumbnail,
        keywords,
        description,
        category,
        publishDate,
        viewCount,
        endscreenVideos,
        captionTrackMeta,
        channelAvatar,
        channelSubscribers,
        descriptionTimestamps,
      };
    } catch (e) {
      console.warn('[YTBlog] Failed to extract extended data:', e);
      return {};
    }
  }

  // Parse "mm:ss" or "hh:mm:ss" timestamp to milliseconds
  function parseTimestamp(ts) {
    const parts = ts.split(':').map(Number);
    if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
    return 0;
  }

  function extractStoryboardSpec() {
    try {
      const sb = window.ytInitialPlayerResponse?.storyboards?.playerStoryboardSpecRenderer;
      return sb?.highResSpec || sb?.spec || null;
    } catch { return null; }
  }

  function getVideoInfo() {
    try {
      const playerResponse = window.ytInitialPlayerResponse;
      const details = playerResponse?.videoDetails;
      return {
        title: details?.title || document.title.replace(' - YouTube', ''),
        channelName: details?.author || '',
        lengthSeconds: parseInt(details?.lengthSeconds || '0', 10),
        videoId: details?.videoId || new URLSearchParams(location.search).get('v'),
      };
    } catch {
      return {
        title: document.title.replace(' - YouTube', ''),
        channelName: '',
        lengthSeconds: 0,
        videoId: new URLSearchParams(location.search).get('v'),
      };
    }
  }

  // Fetch transcript via ANDROID innertube → timedtext pipeline
  // This runs on youtube.com origin so no CORS issues, and ANDROID client
  // returns baseUrls without POT (Proof of Origin Token) requirement
  async function fetchTranscript(videoId, languageCode) {
    const playerResp = await fetch('/youtubei/v1/player', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } },
        videoId,
      }),
    });

    if (!playerResp.ok) throw new Error('innertube /player failed: ' + playerResp.status);

    const playerData = await playerResp.json();
    const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!tracks || tracks.length === 0) throw new Error('NO_CAPTIONS');

    // Pick best track
    const lang = languageCode || 'en';
    const track = tracks.find(t => t.kind !== 'asr' && t.languageCode === lang)
      || tracks.find(t => t.languageCode === lang)
      || tracks.find(t => t.kind !== 'asr')
      || tracks[0];

    if (!track?.baseUrl) throw new Error('Caption track has no baseUrl');

    // Fetch timedtext as json3
    const url = new URL(track.baseUrl);
    url.searchParams.set('fmt', 'json3');
    const textResp = await fetch(url.toString());

    if (!textResp.ok) throw new Error('timedtext fetch failed: ' + textResp.status);

    const json3 = await textResp.json();
    const segments = [];
    for (const event of (json3.events || [])) {
      if (!event.segs) continue;
      const text = event.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ').trim();
      if (!text) continue;
      segments.push({
        text,
        startMs: event.tStartMs || 0,
        durationMs: event.dDurationMs || 0,
        endMs: (event.tStartMs || 0) + (event.dDurationMs || 0),
      });
    }

    return segments;
  }

  function sendData() {
    const tracks = extractCaptionTracks();
    const videoInfo = getVideoInfo();
    const chapters = extractChapters();
    const extended = extractExtendedData();
    const storyboardSpec = extractStoryboardSpec();

    console.log('[YTBlog] Caption tracks:', tracks?.length || 0, '| Chapters:', chapters?.length || 0, '| Extended:', Object.keys(extended).length);
    if (storyboardSpec) console.log('[YTBlog] Storyboard spec:', storyboardSpec.substring(0, 80) + '...');

    window.postMessage({
      type: 'YTBLOG_CAPTION_DATA',
      tracks: tracks,
      videoInfo: videoInfo,
      chapters: chapters,
      extended: extended,
      storyboardSpec: storyboardSpec,
    }, window.location.origin);
  }

  // Listen for transcript fetch requests from the ISOLATED world
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== 'YTBLOG_FETCH_TRANSCRIPT') return;

    const { videoId, languageCode, requestId } = event.data;
    try {
      const segments = await fetchTranscript(videoId, languageCode);
      window.postMessage({
        type: 'YTBLOG_TRANSCRIPT_RESULT',
        requestId,
        success: true,
        segments,
      }, window.location.origin);
    } catch (err) {
      console.error('[YTBlog] Transcript fetch failed:', err);
      window.postMessage({
        type: 'YTBLOG_TRANSCRIPT_RESULT',
        requestId,
        success: false,
        error: err.message,
      }, window.location.origin);
    }
  });

  // Wait for DOM ready before extracting data
  function init() { setTimeout(sendData, 500); }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

  // Handle SPA navigation — wait for ytInitialPlayerResponse to reflect the new video
  document.addEventListener('yt-navigate-finish', () => {
    const expectedId = new URLSearchParams(location.search).get('v');
    if (!expectedId) return;

    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      const currentId = window.ytInitialPlayerResponse?.videoDetails?.videoId;
      if (currentId === expectedId || attempts >= 20) {
        clearInterval(poll);
        sendData();
      }
    }, 250);
  });
})();
