import { useEffect, useRef, useState } from "react";
import { RemoteVideo } from "./RemoteVideo";
import { RemoteVideoIframe } from "./RemoteVideoIframe";

interface VideoGridProps {
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
}

const VideoGrid = ({ localStream, remoteStreams }: VideoGridProps) => {
  // Флаг для выбора между обычным и iframe-видео
  // В реальности, этот флаг мог бы определяться настройками или тестом возможностей браузера
  const [useIframeMethod, setUseIframeMethod] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<string[]>([]);
  
  // Update participant list when remoteStreams changes
  useEffect(() => {
    const participantIds = Array.from(remoteStreams.keys());
    console.log(`VideoGrid: Remote participants updated. Total: ${participantIds.length}`);
    setRemoteParticipants(participantIds);
  }, [remoteStreams]);

  // Set local video stream
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
      console.log("VideoGrid: Local stream attached to video element");
    }
  }, [localStream]);

  // Determine grid layout based on number of participants
  const getGridClass = () => {
    const totalVideos = 1 + remoteParticipants.length; // Local + remotes
    
    if (totalVideos === 1) return "grid-cols-1";
    if (totalVideos === 2) return "grid-cols-2";
    if (totalVideos <= 4) return "grid-cols-2";
    if (totalVideos <= 6) return "grid-cols-3";
    if (totalVideos <= 9) return "grid-cols-3";
    return "grid-cols-4";
  };

  return (
    <>
      {/* Панель с переключателем методов */}
      <div className="p-2 bg-slate-900 mb-2 rounded-lg flex justify-between items-center">
        <div className="text-white text-sm font-medium">
          {remoteParticipants.length === 0 
            ? "Ожидание других участников..." 
            : `Подключено участников: ${remoteParticipants.length}`}
        </div>
        
        <div className="flex items-center space-x-2">
          <span className="text-slate-400 text-sm">Решение для браузеров</span>
          <button 
            onClick={() => setUseIframeMethod(!useIframeMethod)}
            className={`px-3 py-1 rounded-md text-xs ${
              useIframeMethod 
                ? 'bg-blue-600 text-white' 
                : 'bg-slate-700 text-slate-300'
            }`}
          >
            {useIframeMethod ? 'Режим iframe' : 'Стандартный режим'}
          </button>
        </div>
      </div>
      
      <div className={`grid ${getGridClass()} gap-4 p-2 auto-rows-fr h-full`}>
        {/* Local Video */}
        <div className="bg-slate-800 rounded-lg overflow-hidden relative aspect-video shadow-md transition-all duration-300">
          {!localStream && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white opacity-50">Your camera is loading...</span>
            </div>
          )}
          <video
            ref={localVideoRef}
            className="w-full h-full object-cover"
            autoPlay
            playsInline
            muted
          />
          <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded-md">
            You (Local)
          </div>
          <div className="absolute top-2 right-2 bg-success rounded-full h-3 w-3" title="Your camera is active"></div>
        </div>

        {/* Remote Videos - с выбором метода отображения */}
        {remoteParticipants.map((participantId) => {
          const stream = remoteStreams.get(participantId);
          if (!stream) return null;
          
          // Выбираем компонент в зависимости от выбранного метода
          return useIframeMethod ? (
            <RemoteVideoIframe 
              key={participantId} 
              participantId={participantId} 
              stream={stream} 
            />
          ) : (
            <RemoteVideo 
              key={participantId} 
              participantId={participantId} 
              stream={stream} 
            />
          );
        })}
      </div>
    </>
  );
};

export default VideoGrid;
