import { useEffect, useRef, useState } from "react";

interface RemoteVideoProps {
  participantId: string;
  stream: MediaStream;
}

export const RemoteVideo = ({ participantId, stream }: RemoteVideoProps) => {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isKilled, setIsKilled] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Эффект для подключения видеопотока к элементу video
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    
    console.log(`RemoteVideo: Setting up video for ${participantId}`);
    
    // Добавляем обработчики событий для отладки
    const handleLoadedMetadata = () => {
      console.log(`✅ Metadata loaded for ${participantId}`, {
        width: video.videoWidth,
        height: video.videoHeight,
        readyState: video.readyState
      });
      
      // Если размеры видео ненулевые, считаем его готовым
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setIsVideoReady(true);
      }
    };
    
    const handlePlaying = () => {
      console.log(`▶️ Video playing for ${participantId}`);
      setIsVideoReady(true);
    };
    
    const handleError = (e: Event) => {
      console.error(`⚠️ Video error for ${participantId}:`, e);
    };
    
    // Устанавливаем обработчики
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('error', handleError as EventListener);
    
    // Важно: сначала обнуляем предыдущий поток, если он был
    video.srcObject = null;
    
    // Затем применяем новый поток
    video.srcObject = stream;
    
    // Гарантированно запускаем видео после привязки потока
    setTimeout(() => {
      if (video) {
        video.play()
          .then(() => console.log(`▶️ Video play() succeeded for ${participantId}`))
          .catch(err => console.warn(`⚠️ Video play() failed for ${participantId}:`, err));
      }
    }, 200);
    
    // Дополнительная попытка воспроизведения через 1 секунду
    setTimeout(() => {
      if (video && (!video.videoWidth || !video.videoHeight)) {
        console.log(`🔄 Retrying play() for ${participantId}`);
        video.play().catch(err => {});
        
        // Если видео так и не отображается, считаем его готовым по таймауту
        if (!isVideoReady) {
          console.log(`⏱️ Setting video ready by timeout for ${participantId}`);
          setIsVideoReady(true);
        }
      }
    }, 1000);
    
    return () => {
      // Очистка при размонтировании
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('error', handleError as EventListener);
      video.srcObject = null;
    };
  }, [participantId, stream, isVideoReady]);
  
  return (
    <div 
      className={`remote-video-container ${isKilled ? 'killed' : ''} ${isVideoReady ? 'ready' : 'loading'}`}
      data-participant-id={participantId}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '8px',
        backgroundColor: '#000'
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
          border: isVideoReady ? '1px solid transparent' : '1px solid #555'
        }}
      />
      
      {!isVideoReady && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          background: 'rgba(0,0,0,0.7)'
        }}>
          Подключение...
        </div>
      )}
    </div>
  );
};