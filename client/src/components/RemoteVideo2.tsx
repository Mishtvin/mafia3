import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface RemoteVideoProps {
  participantId: string;
  stream: MediaStream;
  displayName?: string;
  onDisplayNameChange?: (id: string, name: string) => void;
  isKilled?: boolean;
}

// Компонент для отображения удаленного видеопотока
export const RemoteVideo = ({ participantId, stream, displayName, onDisplayNameChange, isKilled }: RemoteVideoProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(displayName || "");
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Сбросить состояния при изменении потока
  useEffect(() => {
    setHasVideo(false);
    setVideoError(null);
    setIsVideoMuted(false);
    setIsAudioMuted(false);
  }, [stream]);

  // Эффект для подключения потока к видеоэлементу
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !stream) return;
    
    console.log(`RemoteVideo: Initial video check for ${participantId}`);
    console.log(`RemoteVideo: Stream for ${participantId} - active: ${stream.active}, tracks: ${stream.getTracks().length}`);
    
    // Обработчики событий для видео
    videoElement.onloadeddata = () => {
      console.log(`RemoteVideo: Video data loaded for ${participantId}`);
      setHasVideo(true);
    };
    
    videoElement.onplaying = () => {
      console.log(`RemoteVideo: Video playing for ${participantId}`);
      setHasVideo(true);
    };
    
    // Проверяем, что в потоке есть видеотреки и они включены
    stream.getTracks().forEach((track, i) => {
      console.log(`RemoteVideo: Track ${i} for ${participantId} - kind: ${track.kind}, enabled: ${track.enabled}, readyState: ${track.readyState}`);
      
      // Добавляем обработчики событий для отслеживания изменений состояния трека
      track.onmute = () => {
        console.log(`RemoteVideo: Track ${i} (${track.kind}) muted for ${participantId}`);
        if (track.kind === 'video') {
          setIsVideoMuted(true);
        } else if (track.kind === 'audio') {
          setIsAudioMuted(true);
        }
      };
      
      track.onunmute = () => {
        console.log(`RemoteVideo: Track ${i} (${track.kind}) unmuted for ${participantId}`);
        if (track.kind === 'video') {
          setIsVideoMuted(false);
        } else if (track.kind === 'audio') {
          setIsAudioMuted(false);
        }
      };
      
      track.onended = () => {
        console.log(`RemoteVideo: Track ${i} (${track.kind}) ended for ${participantId}`);
      };
    });
    
    // Новый скрытый видеоэлемент для обхода content isolation
    const helperVideo = document.createElement("video");
    helperVideo.muted = true;
    helperVideo.playsInline = true;
    helperVideo.autoplay = true;
    helperVideo.srcObject = stream;

    helperVideo.onloadedmetadata = () => {
      helperVideo.play()
        .then(() => {
          console.log(`✅ Helper video playing for ${participantId}`);
        })
        .catch((err) => {
          console.warn(`⚠️ Helper video failed for ${participantId}:`, err);
        });
    };

    document.body.appendChild(helperVideo);
    
    // Устанавливаем поток как источник видео
    videoElement.srcObject = stream;
    
    // Пытаемся воспроизвести видео сразу
    videoElement.play().catch((error: Error) => {
      console.error(`RemoteVideo: Error playing video for ${participantId}:`, error.message);
      setVideoError(error.message);
    });
    
    // Очистка при размонтировании компонента
    return () => {
      stream.getTracks().forEach(track => {
        track.onmute = null;
        track.onunmute = null;
        track.onended = null;
      });
      
      videoElement.onloadeddata = null;
      videoElement.onplaying = null;
      videoElement.pause();
      videoElement.srcObject = null;
      
      helperVideo.pause();
      helperVideo.srcObject = null;
      try {
        document.body.removeChild(helperVideo);
      } catch (e) {
        // Игнорируем ошибку, если элемент уже удален
      }
      
      console.log(`RemoteVideo: Playback suspended for ${participantId}`);
    };
  }, [stream, participantId]);

  // Получаем инициалы из отображаемого имени
  const getInitials = (name: string) => {
    if (!name || name.trim() === "") return "?";
    return name
      .split(" ")
      .map(part => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join("");
  };
  
  const initials = getInitials(displayName || "");
  
  // Обработчики для редактирования имени
  const handleEditClick = () => {
    setIsEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };
  
  const handleSave = () => {
    if (onDisplayNameChange && newName.trim() !== "") {
      onDisplayNameChange(participantId, newName);
    }
    setIsEditing(false);
  };
  
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setNewName(displayName || "");
    }
  };
  
  // Обновляем значение поля ввода при изменении displayName из пропсов
  useEffect(() => {
    setNewName(displayName || "");
  }, [displayName]);
  
  return (
    <div className="bg-[#1a202c] rounded-lg overflow-hidden relative aspect-video shadow-md group">
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        autoPlay
        playsInline
        muted
      />
      
      {/* Якщо відео не показується, відображаємо аватар з ініціалами */}
      {(!hasVideo || isVideoMuted || videoError) && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1a202c] to-[#0e1117]">
          <div className="w-20 h-20 rounded-full bg-primary text-white flex items-center justify-center text-2xl font-bold">
            {initials}
          </div>
        </div>
      )}
      
      {/* Накладення з написом "Вбито" якщо учасник позначений як вбитий */}
      {isKilled && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="text-red-600 font-bold text-5xl border-2 border-red-600 px-6 py-3 rounded transform -rotate-12">
            ВБИТО
          </div>
        </div>
      )}
      
      {/* Отображаем информацию об участнике */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent pt-6 pb-2 px-3">
        {isEditing ? (
          <div className="flex items-center space-x-2">
            <Input
              ref={inputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Введіть ім'я учасника"
              className="h-8 text-sm bg-black bg-opacity-70 border-opacity-30 text-white"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSave}
              className="h-8 px-2 text-white hover:bg-black hover:bg-opacity-50"
            >
              OK
            </Button>
          </div>
        ) : (
          <div 
            className="flex items-center text-white font-medium cursor-pointer group"
            onClick={onDisplayNameChange ? handleEditClick : undefined}
          >
            <span className="truncate">
              {displayName || participantId}
            </span>
            
            {/* Показываем статусы микрофона и видео */}
            <div className="flex ml-2 space-x-1">
              {isAudioMuted && (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
              )}
            </div>
            
            {/* Иконка редактирования - показывается только при наведении */}
            {onDisplayNameChange && (
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
            )}
          </div>
        )}
      </div>
      
      {/* Отображаем ошибку воспроизведения, если есть */}
      {videoError && (
        <div className="absolute top-2 right-2 bg-red-500 text-white px-2 py-1 text-xs rounded opacity-75">
          Ошибка видео
        </div>
      )}
    </div>
  );
};