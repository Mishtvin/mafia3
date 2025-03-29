import { useEffect, useRef, useState } from "react";

interface RemoteVideoProps {
  participantId: string;
  stream: MediaStream;
}

export const RemoteVideo = ({ participantId, stream }: RemoteVideoProps) => {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    console.log(`🎥 RemoteVideo setup for ${participantId}`);

    video.srcObject = null; 
    video.srcObject = stream;

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      console.log(`🔍 Track details for ${participantId}:`, {
        id: videoTrack.id,
        enabled: videoTrack.enabled,
        muted: videoTrack.muted,
        readyState: videoTrack.readyState
      });
    }

    video.onloadedmetadata = () => {
      console.log(`✅ Metadata for ${participantId}:`, {
        w: video.videoWidth,
        h: video.videoHeight,
      });

      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setIsVideoReady(true);
      }

      const track = stream.getVideoTracks()[0];
      if (track && track.muted) {
        console.log(`⚙️ Forcing unmute on track for ${participantId}`);
        track.enabled = true;
        
        video.load();
        video.play().catch(err => {
          console.warn(`⚠️ Failed to play video after unmute attempt for ${participantId}:`, err);
        });
      }
    };

    const tryPlay = () => {
      video.load();
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

    setTimeout(tryPlay, 150);

    return () => {
      video.onloadedmetadata = null;
      video.srcObject = null;
    };
  }, [stream]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !stream) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 160;
    canvas.height = 120;

    console.log(`🖼️ Canvas debug started for ${participantId}`);

    const drawFrame = () => {
      try {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          console.log(`🎨 Drew frame for ${participantId}: ${video.videoWidth}x${video.videoHeight}`);
        } else {
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
