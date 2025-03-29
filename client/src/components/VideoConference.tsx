import { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import NotificationArea from "./NotificationArea";
import VideoGrid from "./VideoGrid";
import { useToast } from "@/hooks/use-toast";
import * as MediasoupClient from "../lib/mediasoupClient";
import { DeviceInfo } from "@shared/types";
import { RemoteVideo } from "./RemoteVideo2";
import { RemoteVideoIframe } from "./RemoteVideoIframe2";

const VideoConference = () => {
  const [isCameraEnabled, setIsCameraEnabled] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [cameraDevices, setCameraDevices] = useState<DeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [connectionNotification, setConnectionNotification] = useState<string | null>(null);
  const [useIframeMethod, setUseIframeMethod] = useState<boolean>(false);
  const [maxVideosPerRow, setMaxVideosPerRow] = useState<number>(4);
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [localNickname, setLocalNickname] = useState<string>("You (Local)");
  const [isKilled, setIsKilled] = useState<boolean>(false);
  const [killedParticipants, setKilledParticipants] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  useEffect(() => {
    // Check browser support for mediaDevices
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPermissionError("Your browser doesn't support camera access. Please use a modern browser.");
      return;
    }

    // Check if running in a secure context (HTTPS or localhost)
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      setPermissionError("Camera access requires a secure connection (HTTPS). Some browsers may block camera access on non-secure connections.");
      console.warn("Application running on non-secure context. Camera permissions may be blocked.");
    }

    // Initialize mediasoup client
    MediasoupClient.init({
      onConnect: () => {
        setIsConnected(true);
        setConnectionNotification("Connected to the conference. You are now visible to other participants.");
        toast({
          title: "Connected",
          description: "You have joined the video conference",
        });
      },
      onDisconnect: () => {
        setIsConnected(false);
        toast({
          title: "Disconnected",
          description: "You have left the video conference",
          variant: "destructive",
        });
      },
      onRemoteStream: (participantId, stream) => {
        console.log(`Received remote stream from participant ${participantId}`);
        setRemoteStreams(prev => {
          const newStreams = new Map(prev);
          newStreams.set(participantId, stream);
          console.log(`Added stream from ${participantId}, total streams: ${newStreams.size}`);
          return newStreams;
        });
      },
      onRemoteStreamClosed: (participantId) => {
        console.log(`Remote stream closed for participant ${participantId}`);
        setRemoteStreams(prev => {
          const newStreams = new Map(prev);
          newStreams.delete(participantId);
          console.log(`Removed stream from ${participantId}, total streams: ${newStreams.size}`);
          return newStreams;
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error,
          variant: "destructive",
        });
      },
      onNicknameChange: (participantId, nickname) => {
        console.log(`Participant ${participantId} changed nickname to: ${nickname}`);
        
        // Обновить имя в списке имен глобальных имен (которые установлены другими участниками)
        handleNicknameChange(participantId, nickname);
        
        // Убрали уведомления об изменении имени по требованию
      },
      onParticipantKilled: (participantId, isKilled) => {
        console.log(`Participant ${participantId} killed status changed to: ${isKilled}`);
        
        // Оновлюємо статус вбивства в списку учасників
        setKilledParticipants(prev => ({
          ...prev,
          [participantId]: isKilled
        }));
        
        // Показуємо сповіщення
        toast({
          title: isKilled ? "Учасника вбито" : "Учасник знову живий",
          description: `Учасник ${nicknames[participantId] || participantId} ${isKilled ? 'помічений як вбитий' : 'знову живий'}`,
        });
      }
    });

    // Add device change listener to update devices when they are added/removed
    const handleDeviceChange = () => {
      console.log("Media devices changed, reloading camera list");
      loadCameraDevices();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    // Load available camera devices
    loadCameraDevices();

    // Cleanup on unmount
    return () => {
      stopCamera();
      MediasoupClient.close();
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, []);

  const loadCameraDevices = async () => {
    try {
      // Request camera permission first to get access to labels
      let tempStream = null;
      try {
        // Just request camera access temporarily to get device labels
        tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        console.log('Temporary camera access granted to enumerate devices');
      } catch (error) {
        console.warn('Could not get initial camera access:', error);
        // Continue anyway to get the device list even without labels
      }
      
      // Now enumerate devices (after permissions are granted, we'll get labels)
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          name: device.label || `Camera ${device.deviceId.slice(0, 5)}...`,
          deviceId: device.deviceId
        }));
      
      console.log('Found video devices:', videoDevices);
      setCameraDevices(videoDevices);
      
      if (videoDevices.length > 0 && !selectedDeviceId) {
        console.log('Setting default camera to:', videoDevices[0].deviceId);
        setSelectedDeviceId(videoDevices[0].deviceId);
      }
      
      // Stop the temporary stream if we created one
      if (tempStream) {
        tempStream.getTracks().forEach(track => track.stop());
      }
    } catch (error) {
      console.error('Error loading camera devices:', error);
      setPermissionError("Failed to load camera devices. Please check your browser permissions.");
    }
  };

  const startCamera = async () => {
    // Check if cameras are available
    if (cameraDevices.length === 0) {
      // Force reload devices list
      await loadCameraDevices();
      
      // If still no cameras found
      if (cameraDevices.length === 0) {
        toast({
          title: "No Cameras Found",
          description: "No camera devices detected on your system",
          variant: "destructive",
        });
        setPermissionError("No camera devices were found. Please connect a camera and refresh the page.");
        return;
      }
    }
    
    // If no device is selected but we have cameras, select the first one
    if (!selectedDeviceId && cameraDevices.length > 0) {
      console.log('Auto-selecting first camera:', cameraDevices[0].deviceId);
      setSelectedDeviceId(cameraDevices[0].deviceId);
    }
    
    if (!selectedDeviceId) {
      toast({
        title: "No Camera Selected",
        description: "Please select a camera device first",
        variant: "destructive",
      });
      return;
    }

    try {
      await stopCamera(); // Stop any existing camera
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
        },
        audio: false // We're only handling video in this simple app
      });
      
      setLocalStream(stream);
      setIsCameraEnabled(true);
      
      // Connect to mediasoup server
      await MediasoupClient.connect(stream);
      
    } catch (error: any) {
      console.error('Error starting camera:', error);
      
      // Provide more specific error messages based on the error type
      if (error.name === 'NotAllowedError') {
        setPermissionError("Camera access denied. Please enable camera permissions in your browser settings and refresh the page.");
      } else if (error.name === 'NotFoundError') {
        setPermissionError("Camera not found. Please make sure your camera is connected and not being used by another application.");
      } else if (error.name === 'NotReadableError') {
        setPermissionError("Camera is in use by another application or has encountered a hardware error.");
      } else if (error.name === 'OverconstrainedError') {
        setPermissionError("The requested camera constraints cannot be met. Please try selecting a different camera.");
      } else if (error.name === 'AbortError') {
        setPermissionError("Camera access was aborted. Please try again.");
      } else if (error.name === 'SecurityError') {
        setPermissionError("Camera access is blocked by your browser's security policy. Try using HTTPS or localhost.");
      } else {
        setPermissionError(`Failed to start camera: ${error.message || 'Unknown error'}`);
      }
      
      // Show toast with error for better visibility
      toast({
        title: "Camera Error",
        description: error.message || "Failed to access camera",
        variant: "destructive",
      });
      
      setIsCameraEnabled(false);
    }
  };

  const stopCamera = async () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    
    await MediasoupClient.disconnect();
    setIsCameraEnabled(false);
  };

  const toggleCamera = async () => {
    if (isCameraEnabled) {
      await stopCamera();
    } else {
      await startCamera();
    }
  };

  const handleCameraChange = async (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    
    // If camera is already enabled, restart it with the new device
    if (isCameraEnabled) {
      await stopCamera();
      await startCamera();
    }
  };

  const handleStartConference = async () => {
    await startCamera();
  };

  // Получаем список ID участников
  const remoteParticipantsList = Array.from(remoteStreams.keys());

  // Функция для обновления глобального никнейма (используется при получении уведомлений от сервера)
  const handleNicknameChange = (id: string, newName: string) => {
    setNicknames(prev => ({
      ...prev,
      [id]: newName
    }));
  };
  
  // Функция для обновления локальных имен участников (только для меня)
  const handleLocalParticipantNicknameChange = (id: string, newName: string) => {
    console.log(`Changing local nickname for participant ${id} to ${newName}`);
    setNicknames(prev => ({
      ...prev,
      [id]: newName
    }));
  };

  // Функція для оновлення локального нікнейму
  const handleLocalNicknameChange = (newName: string) => {
    setLocalNickname(newName);
    
    // Відображаємо повідомлення про зміну імені
    toast({
      title: "Ім'я змінено",
      description: `Ваше ім'я в конференції тепер: ${newName}`,
    });
    
    console.log(`Локальне ім'я змінено на: ${newName}`);
    
    // Відправляємо сповіщення іншим учасникам через WebSocket
    if (isConnected) {
      MediasoupClient.changeNickname(newName);
    }
  };

  // Функція для оновлення режиму відображення
  const handleIframeModeChange = (value: boolean) => {
    setUseIframeMethod(value);
  };

  // Функція для оновлення максимальної кількості відео в ряду
  const handleMaxVideosChange = (value: number) => {
    setMaxVideosPerRow(value);
  };

  // Функція для оновлення з'єднання
  const handleRefreshConnection = async () => {
    toast({
      title: "Перезавантаження з'єднання",
      description: "Оновлення усіх відеопотоків...",
    });
    
    // Restore connections after a brief delay
    setTimeout(async () => {
      await stopCamera();
      setTimeout(async () => {
        await startCamera();
      }, 500);
    }, 500);
  };

  // Функція для позначення себе вбитим
  const handleKilledToggle = () => {
    const newKilledStatus = !isKilled;
    setIsKilled(newKilledStatus);
    
    // Відправляємо статус через WebSocket
    if (isConnected) {
      MediasoupClient.toggleKilled(newKilledStatus);
    }
    
    // Відображаємо повідомлення
    toast({
      title: newKilledStatus ? "Вас вбито" : "Ви знову живі",
      description: newKilledStatus 
        ? "Інші учасники не бачать ваше відео" 
        : "Ваше відео знову видиме для інших",
    });
  };

  return (
    <>
      {/* Бічна панель з налаштуваннями */}
      <Sidebar 
        isCameraEnabled={isCameraEnabled}
        isConnected={isConnected}
        selectedDeviceId={selectedDeviceId}
        cameraDevices={cameraDevices}
        remoteParticipants={remoteParticipantsList}
        isKilled={isKilled}
        onCameraToggle={toggleCamera}
        onCameraChange={handleCameraChange}
        onRefreshConnection={handleRefreshConnection}
        onNicknameChange={handleNicknameChange}
        onKilledToggle={handleKilledToggle}
      />

      {/* Повідомлення про помилки */}
      <NotificationArea 
        permissionError={permissionError}
        connectionNotification={connectionNotification}
      />

      <main className="flex-grow p-4 md:p-6 flex flex-col">
        {!isCameraEnabled ? (
          <div className="flex-grow flex flex-col items-center justify-center text-center p-8">
            <div className="rounded-full bg-primary/10 p-6 mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-primary" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                <path d="M14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
              </svg>
            </div>
            <button 
              className="inline-flex items-center px-8 py-4 border border-transparent text-lg font-semibold rounded-md text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary shadow-lg"
              onClick={handleStartConference}
            >
              Приєднатися
            </button>
          </div>
        ) : (
          <VideoGrid 
            localStream={localStream} 
            remoteStreams={remoteStreams}
            useIframeMethod={useIframeMethod}
            maxVideosPerRow={maxVideosPerRow}
            nicknames={nicknames}
            localNickname={localNickname}
            onLocalNicknameChange={handleLocalNicknameChange}
            onRemoteNicknameChange={handleLocalParticipantNicknameChange}
            isKilled={isKilled}
            killedParticipants={killedParticipants}
          />
        )}
      </main>

      <footer className="py-2">
        {/* Footer content removed as per user request */}
      </footer>
    </>
  );
};

export default VideoConference;
