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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [playAttempts, setPlayAttempts] = useState(0);
  const maxPlayAttempts = 5;
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(displayName || "");
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Сбросить счетчик попыток воспроизведения при изменении потока
  useEffect(() => {
    setPlayAttempts(0);
    setVideoError(null);
  }, [stream]);

  // Эффект для подключения потока к видеоэлементу
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !stream) return;
    
    console.log(`RemoteVideo: Initial video check for ${participantId}`);
    console.log(`RemoteVideo: Stream for ${participantId} - active: ${stream.active}, tracks: ${stream.getTracks().length}`);
    
    // Проверяем, что в потоке есть видеотреки и они включены
    stream.getTracks().forEach((track, i) => {
      console.log(`RemoteVideo: Track ${i} for ${participantId} - kind: ${track.kind}, enabled: ${track.enabled}, readyState: ${track.readyState}`);
      
      // Добавляем обработчики событий для отслеживания изменений состояния трека
      track.onmute = () => {
        console.log(`RemoteVideo: Track ${i} muted for ${participantId}`);
        setIsMuted(true);
      };
      
      track.onunmute = () => {
        console.log(`RemoteVideo: Track ${i} unmuted for ${participantId}`);
        setIsMuted(false);
      };
      
      track.onended = () => {
        console.log(`RemoteVideo: Track ${i} ended for ${participantId}`);
      };
    });
    
    // Новый скрытый видеоэлемент
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
        .catch(err => {
          console.warn(`⚠️ Helper video failed for ${participantId}:`, err);
        });
    };

    document.body.appendChild(helperVideo);
    
    // Тест с канвасом для проверки, получаем ли мы реальные пиксели из видеопотока
    const canvas = canvasRef.current;
    let checkVideoContent: () => void;
    
    if (canvas) {
      console.log(`RemoteVideo: Testing canvas capture for ${participantId}`);
      checkVideoContent = () => {
        try {
          const ctx = canvas.getContext('2d');
          if (ctx && videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            ctx.drawImage(videoElement, 0, 0);
            
            // Проверяем, есть ли пиксели на канвасе
            try {
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const hasData = imageData.data.some(val => val !== 0);
              console.log(`RemoteVideo: Canvas test for ${participantId} - has data: ${hasData}`);
              if (hasData) {
                setHasVideo(true);
              }
            } catch (e) {
              console.warn(`RemoteVideo: Canvas access error - ${e}`);
            }
          } else {
            console.log(`RemoteVideo: Video metadata check for ${participantId} - dimensions: ${videoElement.videoWidth}x${videoElement.videoHeight}, time: ${videoElement.currentTime}`);
          }
        } catch (e) {
          console.warn(`RemoteVideo: Canvas check error - ${e}`);
        }
      };
    }
    
    // Устанавливаем поток как источник видео
    videoElement.srcObject = stream;
    
    // Пытаемся воспроизвести видео
    const playVideo = async () => {
      try {
        if (playAttempts >= maxPlayAttempts) {
          console.log(`RemoteVideo: Play attempts completed for ${participantId}`);
          return;
        }
        
        await videoElement.play();
        console.log(`RemoteVideo: Video playback started for ${participantId}`);
        // Проверки canvas после начала воспроизведения
        if (canvas && checkVideoContent) {
          setTimeout(checkVideoContent, 1000);
          setTimeout(checkVideoContent, 3000);
        }
      } catch (error: any) {
        setPlayAttempts(prev => prev + 1);
        console.error(`RemoteVideo: Error playing video for ${participantId}:`, error.message);
        setVideoError(error.message);
        
        // Повторная попытка через 1 секунду
        setTimeout(playVideo, 1000);
      }
    };
    
    // Запускаем воспроизведение
    playVideo();
    
    // Очистка при размонтировании компонента
    return () => {
      stream.getTracks().forEach(track => {
        track.onmute = null;
        track.onunmute = null;
        track.onended = null;
      });
      
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
  }, [stream, participantId, playAttempts, maxPlayAttempts]);

  // Получаем инициалы из отображаемого имени
  const getInitials = (name: string) => {
    return name.split(' ')
      .map(part => part.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const initials = getInitials(displayName || participantId);

  // Эффект для фокуса на поле ввода при редактировании
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  // Обработчик сохранения нового имени
  const handleSave = () => {
    if (newName.trim() && onDisplayNameChange) {
      onDisplayNameChange(participantId, newName);
    }
    setIsEditing(false);
  };

  // Обработчик нажатия клавиш в поле ввода
  const handleKeyPress = (e: React.KeyboardEvent) => {
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
      {(!hasVideo || isMuted || videoError) && (
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
              onClick={handleSave} 
              size="sm" 
              className="h-8 px-2 py-0"
            >
              OK
            </Button>
          </div>
        ) : (
          <div 
            onClick={() => onDisplayNameChange && setIsEditing(true)} 
            className="text-white flex items-center cursor-pointer hover:text-primary transition-colors duration-200"
          >
            <span className="font-medium truncate">
              {displayName || participantId}
            </span>
            <div 
              className={`ml-2 rounded-full h-2.5 w-2.5 ${hasVideo ? 'bg-success' : 'bg-amber-500'}`} 
              title={hasVideo ? 'Відеопотік активний' : 'Очікування відеоданих'}
            />
            
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
      
      {/* Отображаем сообщение при наведении, если видео не воспроизводится или замьютилось */}
      {(videoError) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 transition-opacity opacity-0 group-hover:opacity-100">
          <div className="text-center p-4">
            <div className="bg-[#1c2333] p-3 rounded-lg text-white">
              <div className="font-medium mb-1">Помилка відео:</div>
              <div className="text-xs text-gray-300">{videoError}</div>
            </div>
          </div>
        </div>
      )}
      
      {/* Скрытый канвас для проверки содержимого видео */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};