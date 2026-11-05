import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { PLAY_FAILED_TITLE } from "../../../utils/audioText";
import { clampSeconds } from "../../../utils/audioWaveform";
import { errorMessage } from "../../../utils/errorMessage";
import { toast } from "../../../utils/toast";
import { claimPlayback, releasePlayback } from "./playbackRegistry";

/** What the player shows and does, over one hidden audio element. */
export interface PlaybackState {
  audioRef: RefObject<HTMLAudioElement | null>;
  playing: boolean;
  /** The playhead's time, in seconds. Follows the element while it plays. */
  currentTime: number;
  /** The clip's length as the element reports it. Zero until the metadata has loaded. */
  duration: number;
  togglePlayback: () => void;
  seekTo: (seconds: number) => void;
  /** The element's event handlers. They keep the state in step with what the element does. */
  audioEvents: {
    onPlay: () => void;
    onPause: () => void;
    onEnded: () => void;
    onTimeUpdate: () => void;
    onLoadedMetadata: () => void;
  };
}

/**
 * Plays one clip through a hidden audio element. The element is the source of truth: the state follows its events,
 * and the playhead is read from it every animation frame while it plays. Starting this clip pauses any other one.
 */
export function usePlayback(): PlaybackState {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const pause = useCallback(() => audioRef.current?.pause(), []);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  useEffect(() => () => releasePlayback(pause), [pause]);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    claimPlayback(pause);
    audio.play().catch((err: unknown) => {
      toast.error(PLAY_FAILED_TITLE, errorMessage(err));
    });
  };

  const seekTo = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const time = clampSeconds(seconds, audio.duration);
    audio.currentTime = time;
    setCurrentTime(time);
  };

  return {
    audioRef,
    playing,
    currentTime,
    duration,
    togglePlayback,
    seekTo,
    audioEvents: {
      onPlay: () => setPlaying(true),
      onPause: () => setPlaying(false),
      onEnded: () => {
        setPlaying(false);
        setCurrentTime(audioRef.current?.currentTime ?? 0);
      },
      onTimeUpdate: () => setCurrentTime(audioRef.current?.currentTime ?? 0),
      onLoadedMetadata: () => {
        const length = audioRef.current?.duration ?? 0;
        setDuration(Number.isFinite(length) ? length : 0);
      },
    },
  };
}
