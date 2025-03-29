import { useEffect, useRef, useState } from "react";
import { RemoteVideo } from "./RemoteVideo2";
import { RemoteVideoIframe } from "./RemoteVideoIframe2";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface LocalVideoProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  stream: MediaStream | null;
  displayName: string;
  onDisplayNameChange?: (name: string) => void;
  isKilled?: boolean;
}

const LocalVideo = ({ videoRef, stream, displayName, onDisplayNameChange, isKilled }: LocalVideoProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(displayName);
  const inputRef = useRef<HTMLInputElement>(null);

  // When entering edit mode, focus the input
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  // Handle save of new name
  const handleSave = () => {
    if (newName.trim() && onDisplayNameChange) {
      onDisplayNameChange(newName);
    }
    setIsEditing(false);
  };

  // Handle key press in input
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setNewName(displayName);
    }
  };

  return (
    <div className="bg-[#1a202c] rounded-lg overflow-hidden relative aspect-video shadow-md transition-all duration-300 group">
      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white opacity-50">Ваша камера завантажується...</span>
        </div>
      )}
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        autoPlay
        playsInline
        muted
      />
      
      {/* Накладення з написом "Вбито" якщо користувач позначений як вбитий */}
      {isKilled && (
        <div className="absolute inset-0">
          <div className="absolute top-2 left-2 text-red-600 font-bold text-xl border-2 border-red-600 px-2 py-1 rounded bg-black bg-opacity-50 z-10">
            ВБИТО
          </div>
        </div>
      )}

      {/* Overlay for name editing */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent pt-6 pb-2 px-3">
        {isEditing ? (
          <div className="flex items-center space-x-2">
            <Input
              ref={inputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Введіть ваше ім'я"
              className="h-8 text-sm bg-black bg-opacity-70 border-opacity-30 text-white"
            />
            <Button 
              onClick={handleSave} 
              size="sm" 
              className="h-8 px-2 py-0"
            >
              OK
            </Button>
          </div>
        ) : (
          <div 
            onClick={() => setIsEditing(true)} 
            className="text-white flex items-center cursor-pointer hover:text-primary transition-colors duration-200"
          >
            <span className="font-medium truncate">
              {displayName}
            </span>
            <div className="ml-2 rounded-full h-2.5 w-2.5 bg-success" title="Ваша камера" />
            
            {/* Edit pencil icon - only shows on hover */}
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="14" 
              height="14" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </div>
        )}
      </div>
      
      <div 
        className="absolute top-2 right-2 bg-success rounded-full h-3 w-3" 
        title="Ваша камера активна">
      </div>
    </div>
  );
};

interface VideoGridProps {
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  useIframeMethod?: boolean;
  maxVideosPerRow?: number;
  nicknames?: Record<string, string>;
  localNickname?: string;
  onLocalNicknameChange?: (name: string) => void;
  onRemoteNicknameChange?: (id: string, name: string) => void;
  isKilled?: boolean;
  killedParticipants?: Record<string, boolean>;
}

const VideoGrid = ({ 
  localStream, 
  remoteStreams, 
  useIframeMethod = false,
  maxVideosPerRow = 4,
  nicknames = {},
  localNickname = "Ви (Локально)",
  onLocalNicknameChange,
  onRemoteNicknameChange,
  isKilled = false,
  killedParticipants = {}
}: VideoGridProps) => {
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

  // Determine grid layout based on number of participants and max videos per row setting
  const getGridClass = () => {
    const totalVideos = 1 + remoteParticipants.length; // Local + remotes
    
    if (totalVideos === 1) return "grid-cols-1";
    if (totalVideos === 2) return "grid-cols-2";
    
    // Используем настройку для максимального количества видео в ряду
    switch(Math.min(maxVideosPerRow, 6)) {
      case 1: return "grid-cols-1";
      case 2: return "grid-cols-2";
      case 3: return "grid-cols-3";
      case 4: return "grid-cols-4";
      case 5: return "grid-cols-5";
      case 6: return "grid-cols-6";
      default: return "grid-cols-4";
    }
  };

  return (
    <div className={`grid ${getGridClass()} gap-4 p-2 auto-rows-fr h-full`}>
      {/* Local Video */}
      <LocalVideo 
        videoRef={localVideoRef} 
        stream={localStream} 
        displayName={localNickname}
        onDisplayNameChange={onLocalNicknameChange}
        isKilled={isKilled}
      />

      {/* Remote Videos - используем компонент в зависимости от настройки */}
      {remoteParticipants.map((participantId) => {
        const stream = remoteStreams.get(participantId);
        if (!stream) return null;
        
        const displayName = nicknames[participantId] || `Учасник ${participantId.substring(0, 5)}`;
        
        // Выбираем компонент в зависимости от настройки
        return useIframeMethod ? (
          <RemoteVideoIframe 
            key={participantId} 
            participantId={participantId} 
            stream={stream} 
            displayName={displayName}
            onDisplayNameChange={onRemoteNicknameChange}
            isKilled={killedParticipants[participantId] || false}
          />
        ) : (
          <RemoteVideo 
            key={participantId} 
            participantId={participantId} 
            stream={stream} 
            displayName={displayName}
            onDisplayNameChange={onRemoteNicknameChange}
            isKilled={killedParticipants[participantId] || false}
          />
        );
      })}
    </div>
  );
};

export default VideoGrid;
