import { useEffect, useRef, useState } from "react";

interface RemoteVideoProps {
  participantId: string;
  stream: MediaStream;
  isLocal?: boolean;
}

export const RemoteVideo = ({ participantId, stream, isLocal = false }: RemoteVideoProps) => {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Основной эффект для подключения видеопотока
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    console.log(`🎥 RemoteVideo setup for ${participantId}`);

    // Проверка трека на активность
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      console.log(`🔍 Track details for ${participantId}:`, {
        id: videoTrack.id,
        enabled: videoTrack.enabled,
        muted: videoTrack.muted,
        readyState: videoTrack.readyState
      });
      
      // Принудительно включаем трек
      videoTrack.enabled = true;
    }

    // Подключаем видеопоток
    video.srcObject = stream;

    // Проверка видимости элемента
    const rect = video.getBoundingClientRect();
    console.log(`🧪 Video size for ${participantId}:`, rect.width, rect.height);

    // Функция для воспроизведения видео
    const tryPlay = () => {
      video
        .play()
        .then(() => {
          console.log(`✅ Video play() successful for ${participantId}`);
          console.log(`📺 Paused after play? ${participantId}:`, video.paused);
          setIsVideoReady(true);
        })
        .catch((err) => {
          console.warn(`⚠️ Video play() failed for ${participantId}:`, err);
        });
    };

    // Обработчик загрузки данных
    const dataLoadedHandler = () => {
      console.log(`🎬 onloadeddata for ${participantId}`);
      tryPlay();
    };

    video.onloadeddata = dataLoadedHandler;

    // В любом случае пробуем через 500мс
    const forcePlayTimeout = setTimeout(() => {
      if (video.readyState < 2) {
        console.log(`⌛ Forcing video play for ${participantId}`);
        tryPlay();
      }
    }, 500);

    // Fallback hack для обхода content isolation: скрытый вспомогательный элемент
    const helperVideo = document.createElement('video');
    helperVideo.srcObject = stream;
    helperVideo.muted = true;
    helperVideo.autoplay = true;
    helperVideo.playsInline = true;
    Object.assign(helperVideo.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      opacity: '0.001',
      pointerEvents: 'none',
    });
    document.body.appendChild(helperVideo);

    helperVideo.play().catch(err => {
      console.warn('⚠️ Helper video failed to play:', err);
    });

    return () => {
      clearTimeout(forcePlayTimeout);
      video.onloadeddata = null;
      video.srcObject = null;
      try {
        document.body.removeChild(helperVideo);
      } catch (e) {
        // Ignore if already removed
      }
    };
  }, [stream, participantId]);

  return (
    <div
      className={`remote-video-container ${isVideoReady ? 'ready' : 'loading'}`}
      data-participant-id={participantId}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '8px',
        backgroundColor: '#000',
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          minWidth: '160px',
          minHeight: '120px',
          backgroundColor: '#000',
          border: isVideoReady ? '1px solid transparent' : '1px solid #555',
        }}
      />

      {!isVideoReady && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            background: 'rgba(0,0,0,0.6)',
          }}
        >
          Ожидание видео...
        </div>
      )}
    </div>
  );
};
