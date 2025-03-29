import { useEffect, useRef, useState } from "react";

interface RemoteVideoProps {
  participantId: string;
  stream: MediaStream;
}

export const RemoteVideo = ({ participantId, stream }: RemoteVideoProps) => {
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

    // Функция для воспроизведения видео
    const tryPlay = () => {
      video
        .play()
        .then(() => {
          console.log(`✅ Video play() successful for ${participantId}`);
          setIsVideoReady(true);
        })
        .catch((err) => {
          console.warn(`⚠️ Video play() failed for ${participantId}:`, err);
        });
    };

    // Обработчик загрузки метаданных
    video.onloadedmetadata = () => {
      console.log(`🎬 onloadedmetadata for ${participantId}`);
      video.load();
      tryPlay();
    };

    // В любом случае пробуем через 500мс
    const forcePlayTimeout = setTimeout(() => {
      if (video.readyState < 2) {
        console.log(`⌛ Forcing video play for ${participantId}`);
        video.load();
        tryPlay();
      }
    }, 500);

    return () => {
      clearTimeout(forcePlayTimeout);
      video.onloadedmetadata = null;
      video.srcObject = null;
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
        muted
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
