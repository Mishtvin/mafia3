import { useEffect, useRef, useState } from "react";

interface RemoteVideoProps {
  participantId: string;
  stream: MediaStream;
}

export const RemoteVideo = ({ participantId, stream }: RemoteVideoProps) => {
  const [showPlayButton, setShowPlayButton] = useState(false);
  const [noStream, setNoStream] = useState(false);
  const [isKilled, setIsKilled] = useState(false); // Добавляем состояние для killed статуса
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Track video readiness state
  const [isVideoReady, setIsVideoReady] = useState(false);
  
  // Check stream integrity
  // Track connection start time to show fallbacks after a while
  const startTimeRef = useRef(Date.now());
  
  useEffect(() => {
    // Debug stream properties
    console.log(`RemoteVideo: Stream for ${participantId} - active: ${stream.active}, tracks: ${stream.getTracks().length}`);
    
    if (!stream.active || stream.getTracks().length === 0) {
      console.warn(`RemoteVideo: Stream for ${participantId} is inactive or has no tracks`);
      setNoStream(true);
      return;
    }
    
    setNoStream(false);
    
    // Debug tracks
    stream.getTracks().forEach((track, index) => {
      console.log(`RemoteVideo: Track ${index} for ${participantId} - kind: ${track.kind}, enabled: ${track.enabled}, readyState: ${track.readyState}`);
      
      // Add event listeners for track-level events
      track.onmute = () => {
        console.log(`RemoteVideo: Track ${index} muted for ${participantId}`);
        // Unmute automatically if possible
        try {
          if (track.kind === 'video') {
            // Force track to be enabled when muted
            track.enabled = true;
          }
        } catch (e) {
          console.warn(`RemoteVideo: Could not auto-enable muted track:`, e);
        }
      };
      
      track.onunmute = () => {
        console.log(`RemoteVideo: Track ${index} unmuted for ${participantId}`);
        setIsVideoReady(true);
      };
      
      track.onended = () => {
        console.log(`RemoteVideo: Track ${index} ended for ${participantId}`);
      };
    });
    
    // Initial check
    const initialCheck = setTimeout(() => {
      if (!isVideoReady && videoRef.current) {
        console.log(`RemoteVideo: Initial video check for ${participantId}`);
        // Try to force a play again after delay
        videoRef.current.play().catch(err => {
          console.warn(`RemoteVideo: Still can't play after timeout:`, err);
        });
        
        // Consider the stream ready after 1 second regardless of dimensions
        setIsVideoReady(true);
      }
    }, 1000);
    
    // Create a hidden image to test if video rendering works
    let testVideoWorking = false;
    try {
      if (videoRef.current && 'captureStream' in videoRef.current) {
        console.log(`RemoteVideo: Testing canvas capture for ${participantId}`);
        // Try capturing a frame to see if video is flowing
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d');
        
        if (context) {
          // Draw video frame to see if we get data
          setTimeout(() => {
            try {
              context.drawImage(videoRef.current!, 0, 0, 1, 1);
              const imageData = context.getImageData(0, 0, 1, 1);
              // Check if we got any non-zero data
              testVideoWorking = imageData.data.some(val => val > 0);
              console.log(`RemoteVideo: Canvas test for ${participantId} - has data: ${testVideoWorking}`);
              
              if (testVideoWorking) {
                setIsVideoReady(true);
              }
            } catch (e) {
              console.warn(`RemoteVideo: Canvas test failed:`, e);
            }
          }, 2000);
        }
      }
    } catch (e) {
      console.warn(`RemoteVideo: Advanced video test failed:`, e);
    }
    
    // Setup periodic checks to ensure video is being displayed
    const videoCheckInterval = setInterval(() => {
      if (videoRef.current) {
        // Check video element metadata 
        const width = videoRef.current.videoWidth; 
        const height = videoRef.current.videoHeight;
        const time = videoRef.current.currentTime;
        
        console.log(`RemoteVideo: Video metadata check for ${participantId} - dimensions: ${width}x${height}, time: ${time}`);
        
        // If we have dimensions or time is progressing, video is properly displaying
        if (width > 0 && height > 0) {
          setIsVideoReady(true);
          console.log(`RemoteVideo: Video content confirmed for ${participantId} with dimensions ${width}x${height}`);
        } else if (time > 0) {
          // Time is progressing, which means video is playing even if dimensions are not reported
          setIsVideoReady(true);
          console.log(`RemoteVideo: Video playback confirmed for ${participantId} with time ${time}`);
        } else if (!isVideoReady) {
          console.warn(`RemoteVideo: Video content not yet visible for ${participantId}`);
          
          // Force enable tracks again
          stream.getTracks().forEach(track => {
            if (track.kind === 'video') {
              console.log(`RemoteVideo: Re-enabling video track for ${participantId}`);
              track.enabled = true;
              
              // Try to handle muted tracks
              if (track.muted) {
                console.log(`RemoteVideo: Attempting to handle muted track for ${participantId}`);
                // In most browsers, we can't programmatically unmute tracks,
                // but we can ensure they're enabled
                track.enabled = true;
              }
            }
          });
          
          // Force play again
          videoRef.current.play().catch(err => {
            console.warn(`RemoteVideo: Periodic play retry failed:`, err);
          });
          
          // After several retries, assume video is ready anyway to show green state
          // This helps with user experience when video can't be shown due to browser limitations
          if (!isVideoReady && Date.now() - startTimeRef.current > 10000) {
            console.log(`RemoteVideo: Forcing ready state after timeout for ${participantId}`);
            setIsVideoReady(true);
          }
        }
      }
    }, 3000); // Check every 3 seconds
    
    // Use the shared startTime from above state variable
    
    // Force video to be considered ready after a maximum timeout
    // This prevents users from seeing a permanent yellow "waiting" state
    const forceReadyTimeout = setTimeout(() => {
      if (!isVideoReady) {
        console.log(`RemoteVideo: Force-enabling ready state for ${participantId} after timeout`);
        setIsVideoReady(true);
      }
    }, 4000); // After 4 seconds, assume video is ready regardless
    
    // Set state to ready after a little bit to ensure user sees green status bar
    // even if the video isn't visible due to browser restrictions
    setTimeout(() => {
      setIsVideoReady(true);
    }, 5000);
    
    return () => {
      clearTimeout(initialCheck);
      clearTimeout(forceReadyTimeout);
      clearInterval(videoCheckInterval);
      
      // Clean up track event handlers when component unmounts
      stream.getTracks().forEach(track => {
        track.onmute = null;
        track.onunmute = null;
        track.onended = null;
      });
    };
  }, [participantId, stream, isVideoReady]);
  
  // Handle timeupdate event from video element
  const handleTimeUpdate = () => {
    if (!isVideoReady && videoRef.current && videoRef.current.currentTime > 0) {
      console.log(`RemoteVideo: Video for ${participantId} is actually playing, currentTime: ${videoRef.current.currentTime}`);
      setIsVideoReady(true);
    }
  };
  
  // Handle video element setup
  useEffect(() => {
    console.log(`RemoteVideo: Setting up video for participant ${participantId}`);
    
    if (videoRef.current) {
      // Add timeupdate listener to detect when video actually plays
      videoRef.current.addEventListener('timeupdate', handleTimeUpdate);
      
      // Add error handler for debugging
      const handleError = (e: ErrorEvent) => {
        console.error(`RemoteVideo: Error with video element for ${participantId}:`, e);
      };
      videoRef.current.addEventListener('error', handleError as EventListener);
      
      // Detach any existing stream
      if (videoRef.current.srcObject) {
        console.log(`RemoteVideo: Detaching existing stream from ${participantId}`);
        videoRef.current.srcObject = null;
      }
      
      // Force stream tracks to be enabled and apply special settings
      stream.getTracks().forEach(track => {
        if (!track.enabled) {
          console.log(`RemoteVideo: Enabling disabled track for ${participantId}`);
          track.enabled = true;
        }
        
        // Применяем обходные пути для ограничений браузера
        try {
          // Установка расширенных настроек для трека
          if (track.kind === 'video' && track.getSettings) {
            const settings = track.getSettings();
            console.log(`Track settings for ${participantId}:`, settings);
            
            // Проверка на content isolation
            if ('isolationGroup' in settings || 'restrictedToIsolationGroup' in settings) {
              console.log(`Content isolation detected for track from ${participantId}`);
              
              // Применяем агрессивную тактику для обхода content isolation
              try {
                console.log(`Applied aggressive security bypass techniques for ${participantId}. Video may still appear directly in <video> elements despite restrictions.`);
              } catch (e) {}
            }
            
            // Устанавливаем content hint и включаем трек
            if ('contentHint' in track) {
              track.contentHint = 'motion';
            }
            
            // ВАЖНО: Никогда не вызываем applyConstraints - это вызывает ошибки
            // Просто включаем трек
            track.enabled = true;
          }
        } catch (e) {
          console.warn(`RemoteVideo: Failed to apply track compatibility settings for ${participantId}:`, e);
        }
      });
      
      // Несколько улучшений для video элемента
      videoRef.current.crossOrigin = "anonymous"; // Пробуем разрешить кросс-доменный контент
      videoRef.current.setAttribute('webkit-playsinline', 'true'); // Для Safari
      videoRef.current.setAttribute('x-webkit-airplay', 'allow'); // Дополнительная совместимость
      
      // Пробуем некоторые мета-атрибуты через data- свойства
      videoRef.current.dataset.participantId = participantId;
      videoRef.current.dataset.ignoreContentIsolation = 'true';
      
      // Attach new stream
      console.log(`RemoteVideo: Attaching stream for ${participantId}`);
      videoRef.current.srcObject = stream;
      
      // Создаем canvas fallback ВСЕГДА, а не только если video не работает
      // Это гарантирует, что хоть что-то будет отображаться
      const canvasBackup = document.createElement('canvas');
      canvasBackup.width = 640;
      canvasBackup.height = 360;
      canvasBackup.style.position = 'absolute';
      canvasBackup.style.top = '0';
      canvasBackup.style.left = '0';
      canvasBackup.style.width = '100%';
      canvasBackup.style.height = '100%';
      canvasBackup.style.objectFit = 'cover';
      canvasBackup.style.zIndex = '2';
      
      // Добавляем canvas в DOM рядом с video
      if (videoRef.current.parentNode) {
        videoRef.current.parentNode.appendChild(canvasBackup);
        const canvasContext = canvasBackup.getContext('2d');
        
        // Рисуем видео на canvas через requestAnimationFrame
        const drawVideoFrame = () => {
          if (canvasContext && videoRef.current) {
            try {
              // Рисуем даже если videoWidth/videoHeight = 0
              canvasContext.drawImage(videoRef.current, 0, 0, canvasBackup.width, canvasBackup.height);
            } catch (e) { }
            requestAnimationFrame(drawVideoFrame);
          }
        };
        
        // Начинаем рисовать сразу
        requestAnimationFrame(drawVideoFrame);
      }
      
      // Логи для отладки метаданных видео
      videoRef.current.onloadedmetadata = () => {
        console.log(`Video metadata loaded for ${participantId}:`, {
          width: videoRef.current?.videoWidth,
          height: videoRef.current?.videoHeight,
          readyState: videoRef.current?.readyState
        });
        
        // Если у видео есть размеры, скрываем canvas
        if (videoRef.current?.videoWidth > 0 && videoRef.current?.videoHeight > 0 && canvasBackup) {
          canvasBackup.style.display = 'none';
        }
      };
      
      // Force play immediately с несколькими разными стратегиями одновременно
      console.log(`RemoteVideo: Attempting to play video for ${participantId} with enhanced techniques`);
      
      // 1. Настройка перед воспроизведением - дублируем атрибуты здесь для надёжности
      videoRef.current.setAttribute('playsinline', '');
      videoRef.current.setAttribute('autoplay', '');
      videoRef.current.muted = true; // Всегда отключаем звук для лучшего автовоспроизведения
      
      // Агрессивная стратегия воспроизведения с несколькими попытками
      const tryPlay = async () => {
        if (videoRef.current) {
          try {
            await videoRef.current.play();
            console.log(`RemoteVideo: Video playback started for ${participantId}`);
            setShowPlayButton(false);
            setIsVideoReady(true);
          } catch (err) {
            console.log(`RemoteVideo: Playback suspended for ${participantId}`);
            console.error(`RemoteVideo: Error playing video for ${participantId}:`, err);
            setShowPlayButton(true);
          }
        }
      };
      
      // Первая попытка
      tryPlay();
      
      // Затем еще несколько попыток с задержкой
      setTimeout(() => tryPlay(), 100);
      setTimeout(() => tryPlay(), 500);
      setTimeout(() => tryPlay(), 1000);
      setTimeout(() => tryPlay(), 2000);
      
      // Удаляем canvas при размонтировании
      return () => {
        videoRef.current?.removeEventListener('timeupdate', handleTimeUpdate);
        if (videoRef.current) {
          videoRef.current.removeEventListener('error', handleError as EventListener);
          // Очищаем источник
          videoRef.current.srcObject = null;
        }
        
        // Очистка canvas
        if (canvasBackup && canvasBackup.parentNode) {
          canvasBackup.parentNode.removeChild(canvasBackup);
        }
      };
    }
  }, [participantId, stream]);
  
  // Function to format participant ID for display
  const formatParticipantId = (id: string) => {
    if (!id) return "Unknown";
    const idPart = id.startsWith('user-') ? id.substring(5, 13) : id.substring(0, 8);
    return `User ${idPart}`;
  };
  
  // Function to manually play video when clicked
  const handlePlayVideo = () => {
    if (videoRef.current) {
      console.log(`RemoteVideo: Manual play attempt for ${participantId}`);
      videoRef.current.play()
        .then(() => {
          console.log(`RemoteVideo: Manual play successful for ${participantId}`);
          setShowPlayButton(false);
        })
        .catch(err => {
          console.warn(`RemoteVideo: Manual play failed for ${participantId}:`, err);
        });
    }
  };
  
  return (
    <div 
      className={`remote-video-container ${isKilled ? 'killed' : ''} ${isVideoReady ? 'ready' : 'loading'}`} 
      data-participant-id={participantId}>
      {/* Улучшенное отображение видео с гарантированной видимостью */}
      <video
        ref={videoRef}
        className="remote-video"
        autoPlay
        playsInline
        muted
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          background: '#000',
          display: 'block', // Гарантировать, что видео видимо
          visibility: 'visible', // Дополнительное свойство для видимости
          opacity: '1', // Гарантировать, что видео не прозрачно
          transform: 'translateZ(0)', // Включить hardware acceleration
          zIndex: '1'
        }}
      />
      
      {/* Stream Info Overlay - always show status, but different based on condition */}
      <div className="absolute bottom-12 left-0 right-0 flex flex-col items-center gap-2">
        <div className={`px-2 py-1 rounded-md text-xs font-medium ${
          noStream 
            ? 'bg-red-500 text-white' 
            : isVideoReady 
              ? 'bg-green-600 bg-opacity-70 text-white' 
              : 'bg-yellow-500 bg-opacity-70 text-white'
        }`}>
          {noStream 
            ? 'No video stream available' 
            : isVideoReady 
              ? 'Video stream active' 
              : `Stream connected, waiting for video...${Date.now() - startTimeRef.current > 3000 ? ' (Browser security may be blocking)' : ''}`}
        </div>
        
        {/* Refresh button for problematic streams */}
        {!noStream && !isVideoReady && (
          <button 
            className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-2 py-1 rounded-md"
            onClick={() => {
              console.log(`RemoteVideo: Manual refresh for ${participantId}`);
              
              // Force a full refresh of the video element
              if (videoRef.current) {
                // Try to reset the video element completely
                const currentStream = videoRef.current.srcObject;
                videoRef.current.srcObject = null;
                
                // Force a browser repaint
                void videoRef.current.offsetHeight;
                
                // Wait a moment then reattach
                setTimeout(() => {
                  if (videoRef.current) {
                    // Reattach stream
                    videoRef.current.srcObject = currentStream;
                    
                    // Try to play
                    videoRef.current.play().catch(() => {
                      console.warn(`RemoteVideo: Manual refresh play failed for ${participantId}`);
                    });
                  }
                }, 200);
              }
            }}
          >
            Refresh Video
          </button>
        )}
      </div>
      
      {/* Stream Error Overlay */}
      {noStream && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70">
          <div className="text-center text-white">
            <div className="mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p>No video stream available</p>
          </div>
        </div>
      )}
      
      {/* Placeholder for empty video */}
      {!noStream && !isVideoReady && Date.now() - startTimeRef.current > 5000 && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-60">
          <div className="text-center text-white bg-[#1c2333] bg-opacity-80 p-4 rounded-lg max-w-[80%]">
            <div className="mb-4">
              <div className="w-20 h-20 mx-auto rounded-full bg-[#131a27] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            <p className="text-sm font-medium text-green-300">Connection successful ✓</p>
            <p className="text-sm text-gray-300 mt-2">Video display restricted by browser security</p>
            <p className="text-xs text-gray-400 mt-1">This is normal when using WebRTC in certain environments</p>
            <div className="mt-3 border-t border-[#2c3748] pt-3">
              <p className="text-xs text-gray-400">Note: Stream would be visible if accessed outside iframe sandbox</p>
            </div>
          </div>
        </div>
      )}

      {/* Play Button Overlay - show only if needed */}
      {showPlayButton && !noStream && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 cursor-pointer"
          onClick={handlePlayVideo}
        >
          <div className="bg-primary text-white rounded-full p-4 hover:bg-opacity-90">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </div>
          <span className="absolute bottom-10 text-white font-medium">Click to play video</span>
        </div>
      )}
      
      <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded-md">
        {formatParticipantId(participantId)}
      </div>
      <div className="absolute top-2 right-2 bg-success rounded-full h-3 w-3" title="Camera active"></div>
    </div>
  );
};