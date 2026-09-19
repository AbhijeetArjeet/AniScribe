import React, { useState, useRef, useEffect, useCallback } from 'react';
import { LibraryEpisode } from '../../shared/types/library';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Volume1,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  ArrowLeft,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Subtitles,
  Gauge,
  HelpCircle,
  PictureInPicture2,
  Crop,
  Repeat,
  Loader2,
  CheckCircle,
} from 'lucide-react';
import { createSubtitleBlobUrl } from '../utils/srtParser';
import { AudioActivityDetector } from '../utils/audioCapture';
import { AiSubtitleProgress } from '../../shared/types/ai';

interface PlayerProps {
  episode: LibraryEpisode;
  titleName?: string;
  onBack: () => void;
  onPlayEpisode: (episode: LibraryEpisode) => void;
}

type AspectRatioMode = 'contain' | 'cover' | 'fill' | 'none';

interface SubtitleTrackItem {
  id: string;
  label: string;
  blobUrl?: string;
  content?: string;
  filePath?: string;
}

export const Player: React.FC<PlayerProps> = ({
  episode,
  titleName,
  onBack,
  onPlayEpisode,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLTrackElement | null>(null);

  // Web Audio Context & Gain Node for 200% volume boost
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const vadRef = useRef<AudioActivityDetector | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1); // 0.0 to 2.0 (200%)
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [aspectMode, setAspectMode] = useState<AspectRatioMode>('contain');
  const [error, setError] = useState<string | null>(null);

  // Subtitles & AI
  const [availableTracks, setAvailableTracks] = useState<SubtitleTrackItem[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string>('off');
  const [subDelayMs, setSubDelayMs] = useState(0); // in milliseconds
  const [subFontSize, setSubFontSize] = useState<'normal' | 'large' | 'xlarge'>('normal');
  const [activeSubBlobUrl, setActiveSubBlobUrl] = useState<string | null>(null);

  // Live Real-Time Translation
  const [isLiveTranslating, setIsLiveTranslating] = useState(false);
  const [liveCaptionText, setLiveCaptionText] = useState<string | null>(null);
  const [isSpeechActive, setIsSpeechActive] = useState(false);
  const speechTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastLiveTranslateCallRef = useRef<number>(0);

  // AI Subtitle Generation Modal State
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiProgress, setAiProgress] = useState<AiSubtitleProgress | null>(null);

  // Menus & Modals
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showSubMenu, setShowSubMenu] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  // A-B Looping
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);

  // OSD notification
  const [osdMessage, setOsdMessage] = useState<string | null>(null);
  const osdTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Navigation
  const [nextEpisode, setNextEpisode] = useState<LibraryEpisode | null>(null);
  const [prevEpisode, setPrevEpisode] = useState<LibraryEpisode | null>(null);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedTimeRef = useRef<number>(0);

  // Live Read-Ahead Buffer State
  const [liveBufferStatus, setLiveBufferStatus] = useState<{ isBuffering: boolean; bufferAheadSec: number } | null>(null);

  const filePath = episode.mediaFile?.filePath;
  const mediaUrl = filePath
    ? `media://local/${encodeURIComponent(filePath)}`
    : null;

  // Live Read-Ahead Subtitles Effect
  useEffect(() => {
    if (!isLiveTranslating || !filePath || !window.api) {
      if (window.api) window.api.stopLiveReadAhead();
      setLiveBufferStatus(null);
      return;
    }

    const currentPos = videoRef.current ? videoRef.current.currentTime : 0;
    window.api.startLiveReadAhead(filePath, currentPos, playbackRate);

    const unsubBuffer = window.api.onLiveBufferStatus((status) => {
      setLiveBufferStatus(status);
    });

    const unsubChunk = window.api.onLiveChunkReady((_cues) => {
      if (videoRef.current && window.api) {
        window.api.getLiveActiveCue(videoRef.current.currentTime).then((cue) => {
          if (cue && cue.text) {
            setLiveCaptionText(cue.text);
          }
        });
      }
    });

    return () => {
      unsubBuffer();
      unsubChunk();
      if (window.api) window.api.stopLiveReadAhead();
    };
  }, [isLiveTranslating, filePath, playbackRate]);

  const showOsd = (msg: string) => {
    setOsdMessage(msg);
    if (osdTimeoutRef.current) clearTimeout(osdTimeoutRef.current);
    osdTimeoutRef.current = setTimeout(() => {
      setOsdMessage(null);
    }, 1800);
  };

  // Initialize Web Audio API Gain Node for up to 200% volume
  const initWebAudio = () => {
    if (!videoRef.current || audioCtxRef.current) return;
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      const gainNode = ctx.createGain();
      gainNode.gain.value = volume;

      const source = ctx.createMediaElementSource(videoRef.current);
      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      audioCtxRef.current = ctx;
      gainNodeRef.current = gainNode;
      sourceNodeRef.current = source;

      // Connect Voice Activity Detection (VAD)
      const vad = new AudioActivityDetector(videoRef.current, () => {
        setIsSpeechActive(true);
        if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
        speechTimeoutRef.current = setTimeout(() => setIsSpeechActive(false), 800);

        // If Live Translation is on, trigger translation slice throttled to every 3.5 seconds
        const now = Date.now();
        if (isLiveTranslating && now - lastLiveTranslateCallRef.current > 3500) {
          lastLiveTranslateCallRef.current = now;
          if (window.api) {
            window.api.translateLiveAudioSlice().then((res) => {
              if (res && res.text) {
                setLiveCaptionText(res.text);
              }
            });
          }
        }
      });
      vad.start(ctx);
      vad.connectSource(source);
      vadRef.current = vad;
    } catch (e) {
      console.warn('[Player] Web Audio API init note:', e);
    }
  };

  // Autodetect local subtitles in the directory
  useEffect(() => {
    let active = true;
    async function detectSubs() {
      if (!window.api || !filePath) return;
      try {
        const subs = await window.api.findSubtitles(filePath);
        if (active && subs && subs.length > 0) {
          const loadedTracks: SubtitleTrackItem[] = [];
          for (const s of subs) {
            const content = await window.api.readSubtitleContent(s.filePath);
            if (content) {
              const blobUrl = createSubtitleBlobUrl(content, 0);
              loadedTracks.push({
                id: s.filePath,
                label: s.label,
                filePath: s.filePath,
                content,
                blobUrl,
              });
            }
          }
          if (active) {
            setAvailableTracks(loadedTracks);
            // Default select the first English or matching subtitle track
            if (loadedTracks.length > 0) {
              setSelectedTrackId(loadedTracks[0].id);
              setActiveSubBlobUrl(loadedTracks[0].blobUrl || null);
            }
          }
        }
      } catch (err) {
        console.warn('[Player] Subtitle detection failed:', err);
      }
    }
    detectSubs();
    return () => {
      active = false;
    };
  }, [filePath]);

  // Handle subtitle delay offset change
  useEffect(() => {
    if (selectedTrackId === 'off') {
      setActiveSubBlobUrl(null);
      return;
    }
    const currentTrack = availableTracks.find((t) => t.id === selectedTrackId);
    if (currentTrack && currentTrack.content) {
      if (activeSubBlobUrl) {
        URL.revokeObjectURL(activeSubBlobUrl);
      }
      const newBlobUrl = createSubtitleBlobUrl(currentTrack.content, subDelayMs / 1000);
      setActiveSubBlobUrl(newBlobUrl);
    }
  }, [subDelayMs, selectedTrackId, availableTracks]);

  // Load next and previous episodes
  useEffect(() => {
    let active = true;
    async function loadAdjacentEpisodes() {
      if (!window.api) return;
      try {
        const [next, prev] = await Promise.all([
          window.api.getNextEpisode(episode.id),
          window.api.getPreviousEpisode(episode.id),
        ]);
        if (active) {
          setNextEpisode(next);
          setPrevEpisode(prev);
        }
      } catch (e) {
        console.error('Failed to load adjacent episodes:', e);
      }
    }
    loadAdjacentEpisodes();
    return () => {
      active = false;
    };
  }, [episode.id]);

  // Resume playback position
  useEffect(() => {
    setCurrentTime(0);
    setError(null);

    async function checkResume() {
      if (!window.api) return;
      try {
        const progress = await window.api.getWatchProgress(episode.id);
        if (
          progress &&
          progress.positionSeconds > 5 &&
          progress.positionSeconds < (progress.durationSeconds || 1000) - 15
        ) {
          if (videoRef.current) {
            videoRef.current.currentTime = progress.positionSeconds;
            setCurrentTime(progress.positionSeconds);
            showOsd(`Resumed at ${formatTime(progress.positionSeconds)}`);
          }
        }
      } catch (e) {
        console.error('Failed to get watch progress:', e);
      }
    }

    checkResume();
  }, [episode.id]);

  // Listen to AI Subtitle Progress
  useEffect(() => {
    if (!window.api) return;
    const unsub = window.api.onAiSubtitleProgress((p) => {
      if (p.episodeId === episode.id) {
        setAiProgress(p);
        if (p.status === 'completed' && p.srtPath) {
          // Refresh subtitles and select newly generated track
          window.api.readSubtitleContent(p.srtPath).then((content) => {
            if (content && p.srtPath) {
              const blobUrl = createSubtitleBlobUrl(content, 0);
              const newTrack: SubtitleTrackItem = {
                id: p.srtPath,
                label: 'AI English Subtitles (Generated)',
                filePath: p.srtPath,
                content,
                blobUrl,
              };
              setAvailableTracks((prev) => [newTrack, ...prev.filter((t) => t.id !== p.srtPath)]);
              setSelectedTrackId(newTrack.id);
              setActiveSubBlobUrl(blobUrl);
              showOsd('✨ AI Subtitles generated & mounted!');
            }
          });
        }
      }
    });
    return () => unsub();
  }, [episode.id]);

  // Handle Fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Autohide controls
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !showSpeedMenu && !showSubMenu && !showHelpModal && !isAiModalOpen) {
        setShowControls(false);
      }
    }, 2800);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    initWebAudio();
    if (videoRef.current.paused) {
      videoRef.current.play().catch(console.error);
      showOsd('▶ Play');
    } else {
      videoRef.current.pause();
      showOsd('⏸ Pause');
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen().catch(console.error);
    }
  };

  const togglePiP = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        showOsd('PiP Disabled');
      } else {
        await videoRef.current.requestPictureInPicture();
        showOsd('PiP Enabled');
      }
    } catch (err) {
      console.warn('PiP error:', err);
    }
  };

  const cycleAspectRatio = () => {
    const modes: AspectRatioMode[] = ['contain', 'cover', 'fill', 'none'];
    const nextIdx = (modes.indexOf(aspectMode) + 1) % modes.length;
    const nextMode = modes[nextIdx];
    setAspectMode(nextMode);
    const labels: Record<AspectRatioMode, string> = {
      contain: 'Aspect: Fit (Default)',
      cover: 'Aspect: Fill / Crop (16:9)',
      fill: 'Aspect: Stretch',
      none: 'Aspect: 1:1 Original',
    };
    showOsd(labels[nextMode]);
  };

  const stepFrame = (forward = true) => {
    if (!videoRef.current) return;
    if (!videoRef.current.paused) {
      videoRef.current.pause();
    }
    const delta = forward ? 1 / 30 : -1 / 30;
    videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime + delta);
    showOsd(forward ? 'Frame Step Forward (1/30s)' : 'Frame Step Backward');
  };

  const seekRelative = (seconds: number) => {
    if (!videoRef.current) return;
    const newTime = Math.max(0, Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + seconds));
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    if (isLiveTranslating && window.api) {
      window.api.seekLiveReadAhead(newTime);
    }
    const sign = seconds > 0 ? '+' : '';
    showOsd(`Seek ${sign}${seconds}s (${formatTime(newTime)})`);
  };

  const seekToPercentage = (pct: number) => {
    if (!videoRef.current || !videoRef.current.duration) return;
    const target = videoRef.current.duration * (pct / 100);
    videoRef.current.currentTime = target;
    setCurrentTime(target);
    if (isLiveTranslating && window.api) {
      window.api.seekLiveReadAhead(target);
    }
    showOsd(`Jump to ${pct}% (${formatTime(target)})`);
  };

  const changeVolume = (newVol: number) => {
    const clamped = Math.max(0, Math.min(2.0, newVol));
    setVolume(clamped);
    setIsMuted(clamped === 0);

    initWebAudio();

    if (gainNodeRef.current) {
      // Audio boost via Web Audio GainNode
      gainNodeRef.current.gain.value = clamped;
    } else if (videoRef.current) {
      videoRef.current.volume = Math.min(1.0, clamped);
    }

    const pct = Math.round(clamped * 100);
    showOsd(pct > 100 ? `🔊 Volume: ${pct}% (Boosted)` : `🔊 Volume: ${pct}%`);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    initWebAudio();
    if (isMuted) {
      if (gainNodeRef.current) gainNodeRef.current.gain.value = volume;
      videoRef.current.muted = false;
      setIsMuted(false);
      showOsd(`🔊 Unmuted (${Math.round(volume * 100)}%)`);
    } else {
      if (gainNodeRef.current) gainNodeRef.current.gain.value = 0;
      videoRef.current.muted = true;
      setIsMuted(true);
      showOsd('🔇 Muted');
    }
  };

  const changePlaybackRate = (rate: number) => {
    if (!videoRef.current) return;
    const clamped = Math.max(0.25, Math.min(3.0, rate));
    videoRef.current.playbackRate = clamped;
    setPlaybackRate(clamped);
    showOsd(`⚡ Speed: ${clamped}x`);
  };

  const adjustSubDelay = (deltaMs: number) => {
    setSubDelayMs((prev) => {
      const next = prev + deltaMs;
      showOsd(`🔤 Subtitle Sync: ${next >= 0 ? '+' : ''}${next}ms`);
      return next;
    });
  };

  const toggleABLoop = () => {
    if (!videoRef.current) return;
    const now = videoRef.current.currentTime;
    if (loopA === null) {
      setLoopA(now);
      showOsd(`🔁 A-B Loop: Set Point A at ${formatTime(now)}`);
    } else if (loopB === null) {
      if (now > loopA) {
        setLoopB(now);
        showOsd(`🔁 A-B Loop: Active (${formatTime(loopA)} - ${formatTime(now)})`);
      } else {
        setLoopA(now);
        showOsd(`🔁 A-B Loop: Reset Point A at ${formatTime(now)}`);
      }
    } else {
      setLoopA(null);
      setLoopB(null);
      showOsd('🔁 A-B Loop: Cleared');
    }
  };

  const handleSelectExternalSubtitle = async () => {
    if (!window.api) return;
    const res = await window.api.selectSubtitleFile();
    if (res && res.content) {
      const blobUrl = createSubtitleBlobUrl(res.content, 0);
      const newTrack: SubtitleTrackItem = {
        id: res.filePath,
        label: res.label,
        filePath: res.filePath,
        content: res.content,
        blobUrl,
      };
      setAvailableTracks((prev) => [newTrack, ...prev.filter((t) => t.id !== res.filePath)]);
      setSelectedTrackId(newTrack.id);
      setActiveSubBlobUrl(blobUrl);
      setShowSubMenu(false);
      showOsd(`Loaded subtitle: ${res.label}`);
    }
  };

  const handleTriggerAiSubtitles = async () => {
    if (!window.api) return;
    setIsAiModalOpen(true);
    setAiProgress({
      episodeId: episode.id,
      status: 'extracting',
      percent: 10,
      currentCue: 'Initializing offline speech translation engine...',
    });
    try {
      await window.api.generateAiSubtitles(episode.id);
    } catch (err) {
      console.error('AI Subtitle error:', err);
    }
  };

  // Keyboard Shortcuts (VLC Gold Standard)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      switch (e.key) {
        // Play / Pause
        case ' ':
          e.preventDefault();
          togglePlay();
          break;

        // VLC-Style Seek Jumps
        case 'ArrowLeft':
          e.preventDefault();
          if (e.ctrlKey) {
            seekRelative(-60); // Long jump
          } else if (e.shiftKey) {
            seekRelative(-10); // Medium jump
          } else {
            seekRelative(-5);  // Short jump
          }
          break;

        case 'ArrowRight':
          e.preventDefault();
          if (e.ctrlKey) {
            seekRelative(60);  // Long jump
          } else if (e.shiftKey) {
            seekRelative(10);  // Medium jump
          } else {
            seekRelative(5);   // Short jump
          }
          break;

        // J & L keys for 10s jumps
        case 'j':
        case 'J':
          e.preventDefault();
          seekRelative(-10);
          break;

        case 'l':
        case 'L':
          e.preventDefault();
          seekRelative(10);
          break;

        // Volume (+/- 5%) up to 200%
        case 'ArrowUp':
          e.preventDefault();
          changeVolume(volume + 0.05);
          break;

        case 'ArrowDown':
          e.preventDefault();
          changeVolume(volume - 0.05);
          break;

        // Mute
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;

        // Fullscreen
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;

        // Picture-in-Picture
        case 'v':
        case 'V':
          e.preventDefault();
          togglePiP();
          break;

        // Frame-by-frame step
        case 'e':
        case 'E':
          e.preventDefault();
          stepFrame(true);
          break;

        // Aspect Ratio cycle
        case 'z':
        case 'Z':
          e.preventDefault();
          cycleAspectRatio();
          break;

        // A-B Looping
        case 'r':
        case 'R':
          e.preventDefault();
          toggleABLoop();
          break;

        // Live Real-Time Translation toggle
        case 't':
        case 'T':
          e.preventDefault();
          initWebAudio();
          setIsLiveTranslating((prev) => {
            const next = !prev;
            showOsd(next ? '🔴 Live AI Translation: Active' : 'Live Translation: Off');
            return next;
          });
          break;

        // Subtitle delay
        case 'g':
        case 'G':
          e.preventDefault();
          adjustSubDelay(-50);
          break;

        case 'h':
        case 'H':
          e.preventDefault();
          adjustSubDelay(50);
          break;

        // Playback Speed
        case '[':
          e.preventDefault();
          changePlaybackRate(Math.round((playbackRate - 0.25) * 100) / 100);
          break;

        case ']':
          e.preventDefault();
          changePlaybackRate(Math.round((playbackRate + 0.25) * 100) / 100);
          break;

        case '=':
        case 'Backspace':
          e.preventDefault();
          changePlaybackRate(1.0);
          break;

        // Next / Prev Episode
        case 'n':
        case 'N':
          e.preventDefault();
          if (nextEpisode) onPlayEpisode(nextEpisode);
          break;

        case 'p':
        case 'P':
          e.preventDefault();
          if (prevEpisode) onPlayEpisode(prevEpisode);
          break;

        // Shortcut Cheat Sheet
        case '?':
          e.preventDefault();
          setShowHelpModal((prev) => !prev);
          break;

        // Numeric percentage jumps 0-9
        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
          e.preventDefault();
          seekToPercentage(parseInt(e.key, 10) * 10);
          break;

        case 'Escape':
          if (showHelpModal) {
            setShowHelpModal(false);
          } else if (isAiModalOpen) {
            setIsAiModalOpen(false);
          } else if (showSpeedMenu) {
            setShowSpeedMenu(false);
          } else if (showSubMenu) {
            setShowSubMenu(false);
          } else if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            onBack();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    isPlaying,
    volume,
    isMuted,
    playbackRate,
    aspectMode,
    subDelayMs,
    loopA,
    loopB,
    isLiveTranslating,
    nextEpisode,
    prevEpisode,
    showHelpModal,
    isAiModalOpen,
    showSpeedMenu,
    showSubMenu,
  ]);

    // Video Time Update & A-B Loop handler
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const curr = videoRef.current.currentTime;
    const dur = videoRef.current.duration || 0;
    setCurrentTime(curr);

    if (isLiveTranslating && window.api) {
      window.api.updateLivePlayhead(curr);
      window.api.getLiveActiveCue(curr).then((cue) => {
        if (cue && cue.text) {
          setLiveCaptionText(cue.text);
        }
      });
    }

    // Handle A-B loop boundary
    if (loopA !== null && loopB !== null && curr >= loopB) {
      videoRef.current.currentTime = loopA;
      setCurrentTime(loopA);
    }

    // Throttled save every 4 seconds
    if (Math.abs(curr - lastSavedTimeRef.current) > 4 && window.api) {
      window.api.saveWatchProgress(episode.id, episode.titleId, curr, dur);
      lastSavedTimeRef.current = curr;
    }
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration || 0);
  };

  const handleEnded = () => {
    setIsPlaying(false);
    if (duration > 0 && window.api) {
      window.api.markEpisodeWatched(episode.id, episode.titleId, true);
    }
    if (nextEpisode) {
      setTimeout(() => {
        onPlayEpisode(nextEpisode);
      }, 1500);
    }
  };

  const formatTime = (secs: number) => {
    const total = Math.floor(secs || 0);
    const m = Math.floor(total / 60);
    const s = total % 60;
    const h = Math.floor(m / 60);
    const remM = m % 60;

    if (h > 0) {
      return `${h}:${remM.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${remM}:${s.toString().padStart(2, '0')}`;
  };

  const volumePct = Math.round(volume * 100);
  const isBoosted = volumePct > 100;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: '#000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* On-Screen Display (OSD) Notification */}
      {osdMessage && (
        <div
          style={{
            position: 'absolute',
            top: '80px',
            padding: '10px 22px',
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '9999px',
            color: isBoosted && osdMessage.includes('Boosted') ? '#f97316' : '#f8fafc',
            fontSize: '14px',
            fontWeight: 600,
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            zIndex: 50,
            animation: 'fadeIn 0.15s ease-out',
            pointerEvents: 'none',
          }}
        >
          {osdMessage}
        </div>
      )}

      {/* Live AI Captions Banner Overlay */}
      {isLiveTranslating && (
        <div
          style={{
            position: 'absolute',
            bottom: showControls ? '110px' : '60px',
            maxWidth: '85%',
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            border: isSpeechActive ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '10px',
            padding: '12px 20px',
            textAlign: 'center',
            backdropFilter: 'blur(12px)',
            zIndex: 35,
            transition: 'all 0.2s ease',
            boxShadow: '0 10px 30px rgba(0,0,0,0.7)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '4px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: liveBufferStatus?.isBuffering ? '#eab308' : isSpeechActive ? '#10b981' : '#38bdf8',
                animation: isSpeechActive ? 'pulse 1s infinite' : 'none',
              }}
            />
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', color: '#94a3b8' }}>
              LIVE JA → EN READ-AHEAD
            </span>
            {liveBufferStatus?.bufferAheadSec !== undefined && (
              <span style={{ fontSize: '10px', color: '#64748b', marginLeft: '6px' }}>
                (Buffer: {liveBufferStatus.bufferAheadSec}s)
              </span>
            )}
            {filePath && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (window.api) {
                    try {
                      await window.api.exportLiveSubtitles(filePath);
                      showOsd('Saved Live Subtitles to .en.srt');
                    } catch (err: any) {
                      showOsd(`Export error: ${err.message}`);
                    }
                  }
                }}
                style={{
                  background: 'none',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '4px',
                  color: '#38bdf8',
                  fontSize: '10px',
                  padding: '2px 6px',
                  marginLeft: '8px',
                  cursor: 'pointer',
                }}
                title="Export accumulated subtitles as .en.srt"
              >
                💾 Save .srt
              </button>
            )}
          </div>

          {liveBufferStatus?.isBuffering && (
            <div style={{ margin: '4px 0' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (videoRef.current) {
                    videoRef.current.pause();
                    setIsPlaying(false);
                    showOsd('Paused to buffer upcoming subtitles...');
                  }
                }}
                style={{
                  backgroundColor: 'rgba(234, 179, 8, 0.15)',
                  border: '1px solid #eab308',
                  borderRadius: '6px',
                  color: '#fef08a',
                  fontSize: '11px',
                  padding: '3px 8px',
                  cursor: 'pointer',
                }}
              >
                ⏳ Subtitles buffering — Click to buffer ahead
              </button>
            </div>
          )}

          <p
            style={{
              fontSize: subFontSize === 'large' ? '20px' : subFontSize === 'xlarge' ? '24px' : '17px',
              fontWeight: 500,
              color: '#f8fafc',
              margin: 0,
              lineHeight: 1.4,
              textShadow: '0 2px 4px rgba(0,0,0,0.8)',
            }}
          >
            {liveCaptionText || 'Reading ahead and translating Japanese dialogue...'}
          </p>
        </div>
      )}

      {/* Missing Media Error Overlay */}
      {(!mediaUrl || error) && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            color: '#f87171',
            padding: '32px',
            textAlign: 'center',
            maxWidth: '500px',
            zIndex: 10,
          }}
        >
          <AlertTriangle size={48} />
          <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Media File Not Found</h2>
          <p style={{ fontSize: '13px', color: '#94a3b8' }}>
            {error || 'The local media file for this episode cannot be located on disk.'}
          </p>
          <button className="btn btn-secondary" onClick={onBack} style={{ marginTop: '12px' }}>
            <ArrowLeft size={16} />
            <span>Back to Title</span>
          </button>
        </div>
      )}

      {/* HTML5 Video Element with Privileged Media Stream */}
      {mediaUrl && (
        <video
          ref={videoRef}
          src={mediaUrl}
          crossOrigin="anonymous"
          style={{
            width: '100%',
            height: '100%',
            objectFit: aspectMode,
            cursor: showControls ? 'default' : 'none',
          }}
          onClick={togglePlay}
          onDoubleClick={toggleFullscreen}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          onError={() => setError('Failed to play media file. Unsupported codec or corrupted stream.')}
        >
          {activeSubBlobUrl && (
            <track
              ref={trackRef}
              kind="subtitles"
              src={activeSubBlobUrl}
              srcLang="en"
              label="Active Subtitle"
              default
            />
          )}
        </video>
      )}

      {/* Top Overlay Bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '16px 20px',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'opacity 0.3s ease',
          opacity: showControls ? 1 : 0,
          pointerEvents: showControls ? 'auto' : 'none',
          zIndex: 40,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            className="btn btn-secondary"
            onClick={onBack}
            style={{
              padding: '8px 12px',
              backgroundColor: 'rgba(30, 41, 59, 0.7)',
              borderColor: 'rgba(255, 255, 255, 0.1)',
            }}
            title="Back (Esc)"
          >
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc' }}>
              {titleName ? `${titleName} — ` : ''}Episode {episode.episodeNumber}
            </span>
            {episode.name && (
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                {episode.name}
              </span>
            )}
          </div>
        </div>

        {/* Top Right Quick Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Live Translation Toggle Button */}
          <button
            className={`btn ${isLiveTranslating ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => {
              initWebAudio();
              setIsLiveTranslating((p) => !p);
            }}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: isLiveTranslating ? '#059669' : 'rgba(30, 41, 59, 0.7)',
              borderColor: isLiveTranslating ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
            }}
            title="Toggle Real-Time AI Live Translation (T)"
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: isLiveTranslating ? '#34d399' : '#94a3b8',
              }}
            />
            <span>LIVE Captions (T)</span>
          </button>

          {/* AI Subtitle Batch/Single Generator */}
          <button
            className="btn btn-secondary"
            onClick={handleTriggerAiSubtitles}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(30, 41, 59, 0.7)',
              borderColor: 'rgba(255, 255, 255, 0.1)',
            }}
            title="Auto-generate complete English subtitles with AI"
          >
            <Sparkles size={14} color="#38bdf8" />
            <span>AI Subtitles</span>
          </button>

          {/* Shortcuts Help */}
          <button
            className="btn-icon"
            onClick={() => setShowHelpModal(true)}
            title="VLC Keyboard Shortcuts (?)"
          >
            <HelpCircle size={18} />
          </button>
        </div>
      </div>

      {/* Bottom Controls Bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '24px 24px 16px 24px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0) 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          transition: 'opacity 0.3s ease',
          opacity: showControls ? 1 : 0,
          pointerEvents: showControls ? 'auto' : 'none',
          zIndex: 40,
        }}
      >
        {/* Scrubber Progress Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ fontSize: '12px', color: '#cbd5e1', minWidth: '48px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {formatTime(currentTime)}
          </span>

          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={(e) => {
              const target = parseFloat(e.target.value);
              setCurrentTime(target);
              if (videoRef.current) videoRef.current.currentTime = target;
            }}
            style={{
              flex: 1,
              accentColor: '#3b82f6',
              height: '5px',
              cursor: 'pointer',
            }}
          />

          <span style={{ fontSize: '12px', color: '#94a3b8', minWidth: '48px', fontVariantNumeric: 'tabular-nums' }}>
            {formatTime(duration)}
          </span>
        </div>

        {/* Action Controls Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Left Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Prev Episode */}
            <button
              className="btn-icon"
              onClick={() => prevEpisode && onPlayEpisode(prevEpisode)}
              disabled={!prevEpisode}
              title={prevEpisode ? `Previous: Ep ${prevEpisode.episodeNumber} (P)` : 'No previous episode'}
              style={{ opacity: prevEpisode ? 1 : 0.4 }}
            >
              <SkipBack size={18} />
            </button>

            {/* Play / Pause */}
            <button
              className="btn btn-primary"
              onClick={togglePlay}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: '2px' }} />}
            </button>

            {/* Next Episode */}
            <button
              className="btn-icon"
              onClick={() => nextEpisode && onPlayEpisode(nextEpisode)}
              disabled={!nextEpisode}
              title={nextEpisode ? `Next: Ep ${nextEpisode.episodeNumber} (N)` : 'No next episode'}
              style={{ opacity: nextEpisode ? 1 : 0.4 }}
            >
              <SkipForward size={18} />
            </button>

            {/* Replay 10s */}
            <button
              className="btn-icon"
              onClick={() => seekRelative(-10)}
              title="Seek backward 10s (Left Arrow / J)"
            >
              <RotateCcw size={16} />
            </button>

            {/* VLC 200% Volume Boost Slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px' }}>
              <button className="btn-icon" onClick={toggleMute} title={isMuted ? 'Unmute (M)' : 'Mute (M)'}>
                {isMuted || volume === 0 ? (
                  <VolumeX size={18} />
                ) : volume > 1.0 ? (
                  <Volume2 size={18} color="#f97316" />
                ) : volume < 0.5 ? (
                  <Volume1 size={18} />
                ) : (
                  <Volume2 size={18} />
                )}
              </button>

              <input
                type="range"
                min={0}
                max={2.0}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => changeVolume(parseFloat(e.target.value))}
                style={{
                  width: '78px',
                  accentColor: isBoosted ? '#f97316' : '#3b82f6',
                  height: '4px',
                  cursor: 'pointer',
                }}
                title={`Volume: ${volumePct}% (VLC 200% Boost)`}
              />

              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  minWidth: '38px',
                  color: isBoosted ? '#f97316' : '#cbd5e1',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {volumePct}%
              </span>
            </div>
          </div>

          {/* Right Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Speed Selector Dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowSpeedMenu((p) => !p);
                  setShowSubMenu(false);
                }}
                style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor: playbackRate !== 1.0 ? 'rgba(59, 130, 246, 0.2)' : 'rgba(30, 41, 59, 0.7)',
                  borderColor: playbackRate !== 1.0 ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)',
                }}
                title="Playback Speed ([ and ])"
              >
                <Gauge size={14} />
                <span>{playbackRate}x</span>
              </button>

              {showSpeedMenu && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '36px',
                    right: 0,
                    backgroundColor: '#1e293b',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    minWidth: '90px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                    zIndex: 60,
                  }}
                >
                  {[0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5].map((rate) => (
                    <button
                      key={rate}
                      style={{
                        padding: '6px 10px',
                        fontSize: '12px',
                        textAlign: 'left',
                        backgroundColor: playbackRate === rate ? '#3b82f6' : 'transparent',
                        color: playbackRate === rate ? '#fff' : '#cbd5e1',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                      onClick={() => {
                        changePlaybackRate(rate);
                        setShowSpeedMenu(false);
                      }}
                    >
                      {rate === 1.0 ? 'Normal (1.0x)' : `${rate}x`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Subtitles Menu Dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowSubMenu((p) => !p);
                  setShowSpeedMenu(false);
                }}
                style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor: selectedTrackId !== 'off' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(30, 41, 59, 0.7)',
                  borderColor: selectedTrackId !== 'off' ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)',
                }}
                title="Subtitles & Audio Tracks"
              >
                <Subtitles size={14} />
                <span>{selectedTrackId !== 'off' ? 'CC On' : 'CC'}</span>
              </button>

              {showSubMenu && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '36px',
                    right: 0,
                    backgroundColor: '#1e293b',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    minWidth: '220px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                    zIndex: 60,
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', padding: '4px 8px' }}>
                    SUBTITLE TRACKS
                  </span>

                  <button
                    style={{
                      padding: '6px 10px',
                      fontSize: '12px',
                      textAlign: 'left',
                      backgroundColor: selectedTrackId === 'off' ? '#3b82f6' : 'transparent',
                      color: selectedTrackId === 'off' ? '#fff' : '#cbd5e1',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      setSelectedTrackId('off');
                      setShowSubMenu(false);
                      showOsd('Subtitles Off');
                    }}
                  >
                    Off
                  </button>

                  {availableTracks.map((t) => (
                    <button
                      key={t.id}
                      style={{
                        padding: '6px 10px',
                        fontSize: '12px',
                        textAlign: 'left',
                        backgroundColor: selectedTrackId === t.id ? '#3b82f6' : 'transparent',
                        color: selectedTrackId === t.id ? '#fff' : '#cbd5e1',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      onClick={() => {
                        setSelectedTrackId(t.id);
                        setShowSubMenu(false);
                        showOsd(`Subtitles: ${t.label}`);
                      }}
                    >
                      {t.label}
                    </button>
                  ))}

                  <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />

                  <button
                    style={{
                      padding: '6px 10px',
                      fontSize: '12px',
                      textAlign: 'left',
                      backgroundColor: 'transparent',
                      color: '#60a5fa',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                    onClick={handleSelectExternalSubtitle}
                  >
                    + Load Subtitle File (.srt / .vtt)
                  </button>

                  {/* Subtitle Sync Controls */}
                  <div style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>Sync Delay:</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        className="btn-icon"
                        style={{ padding: '2px 6px', fontSize: '10px' }}
                        onClick={() => adjustSubDelay(-50)}
                        title="Delay -50ms (G)"
                      >
                        -50ms
                      </button>
                      <button
                        className="btn-icon"
                        style={{ padding: '2px 6px', fontSize: '10px' }}
                        onClick={() => adjustSubDelay(50)}
                        title="Delay +50ms (H)"
                      >
                        +50ms
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Aspect Ratio / Zoom Button */}
            <button
              className="btn-icon"
              onClick={cycleAspectRatio}
              title={`Aspect Ratio: ${aspectMode} (Z)`}
            >
              <Crop size={18} />
            </button>

            {/* A-B Loop Button */}
            <button
              className="btn-icon"
              onClick={toggleABLoop}
              title="A-B Repeat Scene Loop (R)"
              style={{ color: loopA !== null ? '#3b82f6' : 'inherit' }}
            >
              <Repeat size={18} />
            </button>

            {/* Picture-in-Picture */}
            <button
              className="btn-icon"
              onClick={togglePiP}
              title="Picture-in-Picture (V)"
            >
              <PictureInPicture2 size={18} />
            </button>

            {/* Fullscreen */}
            <button
              className="btn-icon"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
            >
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* AI Subtitle Generation Modal */}
      {isAiModalOpen && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 70,
          }}
        >
          <div
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '480px',
              width: '90%',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Sparkles size={22} color="#38bdf8" />
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#f8fafc' }}>
                AI Japanese Dub → English Subtitles
              </h3>
            </div>

            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
              Optimized for low-resource hardware (NVIDIA RTX 2050 / Laptop). Transcribes Japanese speech and generates an English .srt file.
            </p>

            {aiProgress && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#cbd5e1' }}>
                  <span>{aiProgress.currentCue || 'Processing...'}</span>
                  <span>{aiProgress.percent}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${aiProgress.percent}%`,
                      backgroundColor: '#38bdf8',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>
            )}

            {aiProgress?.status === 'completed' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontSize: '13px' }}>
                <CheckCircle size={18} />
                <span>Subtitle generation complete! Track is active.</span>
              </div>
            ) : aiProgress?.status === 'error' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171', fontSize: '13px' }}>
                <AlertTriangle size={18} />
                <span>Error: {aiProgress.error}</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '12px' }}>
                <Loader2 size={16} className="animate-spin" />
                <span>Generating subtitle cues...</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setIsAiModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VLC Shortcut Cheat-Sheet Modal */}
      {showHelpModal && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 80,
          }}
          onClick={() => setShowHelpModal(false)}
        >
          <div
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '540px',
              width: '90%',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#f8fafc' }}>
                VLC Keyboard Shortcuts Reference
              </h3>
              <button className="btn-icon" onClick={() => setShowHelpModal(false)}>
                ✕
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px 20px',
                fontSize: '12px',
                color: '#cbd5e1',
              }}
            >
              <div><kbd className="kbd">Space</kbd> Play / Pause</div>
              <div><kbd className="kbd">F</kbd> Toggle Fullscreen</div>
              <div><kbd className="kbd">Left / Right</kbd> Seek ±5s</div>
              <div><kbd className="kbd">Shift + Left / Right</kbd> Seek ±10s</div>
              <div><kbd className="kbd">Ctrl + Left / Right</kbd> Seek ±60s</div>
              <div><kbd className="kbd">J / L</kbd> Seek -10s / +10s</div>
              <div><kbd className="kbd">Up / Down</kbd> Volume ±5% (Up to 200%)</div>
              <div><kbd className="kbd">M</kbd> Mute / Unmute</div>
              <div><kbd className="kbd">[ / ]</kbd> Playback Speed ±0.25x</div>
              <div><kbd className="kbd">Backspace / =</kbd> Reset Speed (1.0x)</div>
              <div><kbd className="kbd">E</kbd> Frame-by-Frame Step Forward</div>
              <div><kbd className="kbd">Z</kbd> Cycle Aspect Ratio (Fit/Crop/Fill)</div>
              <div><kbd className="kbd">V</kbd> Picture-in-Picture (PiP)</div>
              <div><kbd className="kbd">T</kbd> 🔴 Toggle Live AI Translation</div>
              <div><kbd className="kbd">G / H</kbd> Subtitle Sync Delay (±50ms)</div>
              <div><kbd className="kbd">R</kbd> A-B Scene Repeat Loop</div>
              <div><kbd className="kbd">0 - 9</kbd> Jump to 0% - 90%</div>
              <div><kbd className="kbd">N / P</kbd> Next / Prev Episode</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button className="btn btn-secondary" onClick={() => setShowHelpModal(false)}>
                Got it (Esc)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
