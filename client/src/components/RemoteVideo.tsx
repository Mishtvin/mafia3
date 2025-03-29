import { useEffect, useRef, useState } from "react";

interface RemoteVideoProps {
  participantId: string;
  stream: MediaStream;
}

export const RemoteVideo = ({ participantId, stream }: RemoteVideoProps) => {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    console.log(`🎥 RemoteVideo setup for ${participantId}`);

    video.srcObject = null; // обнулить
    video.srcObject = stream;

    const tryPlay = () => {
      video
        .play()
        .then(() => {
          console.log(`▶️ Playing for ${participantId}`);
          setIsVideoReady(true);
        })
        .catch((err) => {
          console.warn(`⚠️ play() failed for ${participantId}`, err);
        });
    };

    // Обработчики
    const handleLoaded = () => {
      console.log(`✅ Metadata for ${participantId}:`, {
        w: video.videoWidth,
        h: video.videoHeight,
      });

      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setIsVideoReady(true);
      }
    };

    video.onloadedmetadata = handleLoaded;

    // Старт воспроизведения
    setTimeout(tryPlay, 150);

    return () => {
      video.onloadedmetadata = null;
      video.srcObject = null;
    };
  }, [stream]);

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
