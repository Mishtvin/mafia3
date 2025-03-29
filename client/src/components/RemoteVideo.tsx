import { useEffect, useRef, useState } from "react";

interface RemoteVideoProps {
  participantId: string;
  stream: MediaStream;
}

export const RemoteVideo = ({ participantId, stream }: RemoteVideoProps) => {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Основной эффект для подключения и запуска видео
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    console.log(`🎥 RemoteVideo setup for ${participantId}`);

    // Проверка трека
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      console.log(`🔍 Track details for ${participantId}:`, {
        id: videoTrack.id,
        enabled: videoTrack.enabled,
        muted: videoTrack.muted,
        readyState: videoTrack.readyState
      });
      
      // Гарантируем, что трек включен
      videoTrack.enabled = true;
    }

    video.srcObject = stream;
    
    // Обработчик загрузки метаданных
    video.onloadedmetadata = () => {
      console.log(`🔍 onloadedmetadata triggered for ${participantId}`);
      
      const track = stream.getVideoTracks()[0];
      if (track) {
        console.log(`🎥 Track details on load:`, {
          id: track.id,
          kind: track.kind,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
          dimensions: `${video.videoWidth}x${video.videoHeight}`
        });
  
        // Попытка принудительного воспроизведения
        track.enabled = true;
  
        // Обязательно вызвать load() перед play()
        video.load();
        video
          .play()
          .then(() => {
            console.log(`▶️ Video play() successful for ${participantId}`);
            setIsVideoReady(true);
          })
          .catch((err) => console.warn(`⚠️ Video play() failed for ${participantId}:`, err));
      }
      
      // Проверяем наличие размеров и устанавливаем готовность
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setIsVideoReady(true);
      }
    };
  
    // Fallback в случае если onloadedmetadata не сработает
    setTimeout(() => {
      if (video.readyState < 2) {
        console.log(`⌛ Video not ready for ${participantId}, forcing play()`);
        video.load();
        video
          .play()
          .then(() => {
            console.log(`▶️ Video force-play() OK for ${participantId}`);
            setIsVideoReady(true);
          })
          .catch((err) => console.warn(`⚠️ Video force-play() failed:`, err));
      }
    }, 500);

    return () => {
      video.onloadedmetadata = null;
      video.srcObject = null;
    };
  }, [stream, participantId]);

  // Отладочный эффект с canvas для проверки, приходят ли кадры
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !stream) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Настройка canvas
    canvas.width = 160;
    canvas.height = 120;

    console.log(`🖼️ Canvas debug started for ${participantId}`);

    // Функция для рисования кадра
    const drawFrame = () => {
      try {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          console.log(`🎨 Drew frame for ${participantId}: ${video.videoWidth}x${video.videoHeight}`);
        } else {
          // Рисуем красный крест если нет размеров
          ctx.fillStyle = 'black';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.strokeStyle = 'red';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(canvas.width, canvas.height);
          ctx.moveTo(canvas.width, 0);
          ctx.lineTo(0, canvas.height);
          ctx.stroke();
        }
      } catch (e) {
        console.error(`Error drawing to canvas for ${participantId}:`, e);
      }
    };

    // Запускаем интервал для отрисовки
    const interval = setInterval(drawFrame, 500);

    return () => {
      clearInterval(interval);
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
        // muted -- Временно отключаем мутирование для проверки
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

      {/* Отладочный canvas для проверки кадров */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          bottom: '8px',
          right: '8px',
          border: '1px solid green',
          width: '160px',
          height: '120px',
          display: 'block',
          zIndex: 5,
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
