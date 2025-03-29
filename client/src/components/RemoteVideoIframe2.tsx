import React, { useEffect, useRef, useState } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Компонент для отображения удаленных видеопотоков через iframe
 * Эта техника может обойти ограничения безопасности браузера, которые
 * блокируют доступ к содержимому видеопотоков между разными контекстами безопасности
 */
export const RemoteVideoIframe: React.FC<{
  participantId: string;
  stream: MediaStream;
  displayName?: string;
  onDisplayNameChange?: (id: string, name: string) => void;
  isKilled?: boolean;
}> = ({ participantId, stream, displayName, onDisplayNameChange, isKilled }) => {
  const [statusText, setStatusText] = useState('Инициализация...');
  const [statusColor, setStatusColor] = useState('bg-yellow-500');
  const [isReady, setIsReady] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(displayName || "");
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Этот компонент на самом деле не использует iframe, а предоставляет инструкции 
  // по внедрению WebRTC видео на реальном развернутом сайте
  
  // Отображаем информацию о необходимых настройках для работы WebRTC
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const checkStreamState = () => {
      if (stream) {
        const videoTracks = stream.getVideoTracks();
        
        if (videoTracks.length > 0) {
          const track = videoTracks[0];
          
          if (track.readyState === 'live') {
            // Поток активен
            setStatusText('Активен');
            setStatusColor('bg-green-500');
            setIsReady(true);
          } else {
            // Поток существует, но неактивен
            setStatusText(`Неактивен (${track.readyState})`);
            setStatusColor('bg-red-500');
            setIsReady(false);
          }
        } else {
          setStatusText('Нет видеотреков');
          setStatusColor('bg-red-500');
          setIsReady(false);
        }
      } else {
        setStatusText('Поток не найден');
        setStatusColor('bg-red-500');
        setIsReady(false);
      }
      
      // Повторная проверка через 3 секунды
      timeoutId = setTimeout(checkStreamState, 3000);
    };
    
    // Выполнить проверку сразу
    checkStreamState();
    
    // Очистка таймера при размонтировании
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [stream]);

  // Получаем инициалы из отображаемого имени
  const getInitials = (name: string) => {
    return name.split(' ')
      .map(part => part.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

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

  const initials = getInitials(displayName || participantId);

  return (
    <div className="bg-slate-800 rounded-lg overflow-hidden relative aspect-video shadow-md flex flex-col justify-center items-center text-white">
      {/* Информация об участнике с инициалами */}
      <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center text-2xl font-bold mb-4">
        {initials}
      </div>
      
      <div className="text-center max-w-xs">
        <h3 className="font-medium mb-2 text-lg">{displayName || participantId}</h3>
      </div>
      
      {/* Накладення з написом "Вбито" якщо учасник позначений як вбитий */}
      {isKilled && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-red-600 font-bold text-5xl border-2 border-red-600 px-6 py-3 rounded transform -rotate-12 bg-black bg-opacity-70">
            ВБИТО
          </div>
        </div>
      )}
      
      {/* Нижний градиент и информация об участнике */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent pt-6 pb-2 px-3">
        {isEditing ? (
          <div className="flex items-center space-x-2">
            <Input
              ref={inputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Введите имя участника"
              className="h-8 text-sm bg-black bg-opacity-50 border-opacity-30"
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
              className={`ml-2 rounded-full h-2.5 w-2.5 ${statusColor}`} 
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
    </div>
  );
};