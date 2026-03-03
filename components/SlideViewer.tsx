import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Slide } from '../types';
import { ArrowLeftIcon, ArrowRightIcon } from './icons';

interface SlideViewerProps {
  slide: Slide | null;
  onNext?: () => void;
  onPrev?: () => void;
  isPitchMode: boolean;
  pitchProgress: number;
  allPitchSlides?: Slide[]; // All pitch slides for video buffering
  className?: string;
}

const PRELOAD_PREVIOUS_COUNT = 1;
const PRELOAD_NEXT_COUNT = 2;

const SlideViewer: React.FC<SlideViewerProps> = ({
  slide,
  onNext,
  onPrev,
  isPitchMode,
  pitchProgress,
  allPitchSlides = [],
  className,
}) => {
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const videoRefsMap = useRef<Map<string, HTMLVideoElement>>(new Map());

  const bufferedPitchSlides = useMemo(() => {
    if (!isPitchMode || allPitchSlides.length === 0) {
      return [] as Slide[];
    }

    const currentId = slide?.id;
    const currentIndex = currentId
      ? allPitchSlides.findIndex((candidate) => candidate.id === currentId)
      : -1;

    if (currentIndex < 0) {
      return allPitchSlides.filter((candidate) => candidate.videoUrl).slice(0, 2);
    }

    const start = Math.max(0, currentIndex - PRELOAD_PREVIOUS_COUNT);
    const end = Math.min(allPitchSlides.length - 1, currentIndex + PRELOAD_NEXT_COUNT);

    return allPitchSlides
      .slice(start, end + 1)
      .filter((candidate) => candidate.videoUrl);
  }, [allPitchSlides, isPitchMode, slide?.id]);

  const playVideoForSlide = (slideId: string): boolean => {
    const videoElement = videoRefsMap.current.get(slideId);
    if (!videoElement) {
      return false;
    }

    videoElement.currentTime = 0;
    videoElement
      .play()
      .then(() => {
        setIsPlayingVideo(true);
      })
      .catch((err) => {
        console.error('Video playback failed:', err);
        setIsPlayingVideo(false);
      });

    return true;
  };

  // Reset video state when mode changes (pitch <-> Q&A)
  useEffect(() => {
    videoRefsMap.current.forEach((video) => {
      video.pause();
      if (!isPitchMode) {
        video.currentTime = 0;
      }
    });

    setIsPlayingVideo(false);
  }, [isPitchMode]);

  // Manage video playback when slide changes
  useEffect(() => {
    videoRefsMap.current.forEach((video, videoSlideId) => {
      if (!slide?.id || videoSlideId !== slide.id) {
        video.pause();
      }
    });

    setIsPlayingVideo(false);

    if (isPitchMode && slide?.id && slide?.videoUrl) {
      const playedImmediately = playVideoForSlide(slide.id);
      if (playedImmediately) {
        return;
      }

      // Allow one frame for refs to attach if this slide just entered the buffer.
      const rafId = requestAnimationFrame(() => {
        playVideoForSlide(slide.id);
      });

      return () => cancelAnimationFrame(rafId);
    }

    return;
  }, [slide?.id, slide?.videoUrl, slide?.imageUrl, isPitchMode, bufferedPitchSlides]);

  // Store/destroy video refs in map
  const setVideoRef = (slideId: string) => (el: HTMLVideoElement | null) => {
    if (el) {
      videoRefsMap.current.set(slideId, el);
      return;
    }

    videoRefsMap.current.delete(slideId);
  };

  // Keep video visible on last frame when it ends
  const handleVideoEnded = (slideId: string) => () => {
    console.log('Video ended for slide:', slideId, '- keeping last frame visible');
  };

  const handleVideoError =
    (slideId: string) => (event: React.SyntheticEvent<HTMLVideoElement, Event>) => {
      console.error('Video failed to load for slide:', slideId, event);
      if (slide?.id === slideId) {
        setIsPlayingVideo(false);
      }
    };

  if (!slide) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-slate-400">No slide to display.</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full overflow-hidden ${className ?? ''}`}>
      <div className="relative w-full h-full overflow-hidden">
        {/* Image Layer - always present */}
        <img
          key={`${slide.id}-image`}
          src={slide.imageUrl}
          alt={slide.title}
          className="w-full h-full object-contain"
          style={{
            display:
              isPlayingVideo && slide.videoUrl && videoRefsMap.current.has(slide.id)
                ? 'none'
                : 'block',
            transition: 'none',
          }}
        />

        {/* Video layers - keep a small sliding buffer around the active slide */}
        {bufferedPitchSlides.map((pitchSlide) => {
          if (!pitchSlide.videoUrl) {
            return null;
          }

          const isCurrentSlide = pitchSlide.id === slide.id;
          const shouldDisplay = isCurrentSlide && isPlayingVideo;

          return (
            <video
              key={`${pitchSlide.id}-video`}
              ref={setVideoRef(pitchSlide.id)}
              src={pitchSlide.videoUrl}
              className="w-full h-full object-contain"
              style={{
                display: shouldDisplay ? 'block' : 'none',
                position: 'absolute',
                top: 0,
                left: 0,
                transition: 'none',
              }}
              onError={handleVideoError(pitchSlide.id)}
              onEnded={handleVideoEnded(pitchSlide.id)}
              playsInline
              muted
              preload="auto"
            />
          );
        })}

        {onPrev && onNext && (
          <>
            <button
              onClick={onPrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-black/30 rounded-full text-white hover:bg-black/60 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
              aria-label="Previous Slide"
            >
              <ArrowLeftIcon className="w-6 h-6" />
            </button>
            <button
              onClick={onNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-black/30 rounded-full text-white hover:bg-black/60 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
              aria-label="Next Slide"
            >
              <ArrowRightIcon className="w-6 h-6" />
            </button>
          </>
        )}

        {isPitchMode && (
          <div className="absolute bottom-0 left-0 right-0 w-full bg-slate-700/50">
            <div
              className="h-1 bg-blue-500 rounded-r-full duration-500 ease-out"
              style={{ width: `${pitchProgress}%` }}
            ></div>
          </div>
        )}
      </div>
    </div>
  );
};

// Slide viewer styles - instant transitions for seamless slide changes
if (!document.querySelector('#slide-viewer-styles')) {
  const style = document.createElement('style');
  style.id = 'slide-viewer-styles';
  style.innerHTML = `
  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .animate-fade-in {
    animation: fade-in 0.15s ease-out forwards;
  }
  `;
  document.head.appendChild(style);
}

export default SlideViewer;
