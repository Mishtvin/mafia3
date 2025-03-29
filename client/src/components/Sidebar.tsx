import { useState, useEffect } from "react";
import { DeviceInfo } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SidebarProps {
  isCameraEnabled: boolean;
  isConnected: boolean;
  selectedDeviceId: string;
  cameraDevices: DeviceInfo[];
  remoteParticipants: string[];
  isKilled: boolean;
  onCameraToggle: () => void;
  onCameraChange: (deviceId: string) => void;
  onRefreshConnection: () => void;
  onNicknameChange?: (id: string, nickname: string) => void;
  onKilledToggle: () => void;
}

export default function Sidebar({
  isCameraEnabled,
  isConnected,
  selectedDeviceId,
  cameraDevices,
  remoteParticipants,
  isKilled,
  onCameraToggle,
  onCameraChange,
  onRefreshConnection,
  onNicknameChange,
  onKilledToggle,
}: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const [participantNicknames, setParticipantNicknames] = useState<Record<string, string>>({});

  // Обробник зміни імені учасника
  const handleNicknameChange = (id: string, value: string) => {
    setParticipantNicknames(prev => ({
      ...prev,
      [id]: value
    }));
  };

  // Збереження імені учасника
  const saveNickname = (id: string) => {
    if (onNicknameChange && participantNicknames[id]) {
      onNicknameChange(id, participantNicknames[id]);
    }
  };

  // Функція для обробки руху миші
  const handleMouseMove = (e: React.MouseEvent) => {
    if (e.clientX < 50 && !isOpen) {
      setShowButton(true);
    } else if (e.clientX > 50 && !isOpen) {
      setShowButton(false);
    }
  };

  // Ефект для додавання обробника події
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (e.clientX < 50 && !isOpen) {
        setShowButton(true);
      } else if (e.clientX > 50 && !isOpen) {
        setShowButton(false);
      }
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [isOpen]);

  return (
    <>
      {/* Кнопка для відкриття/закриття бічної панелі */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed top-4 left-4 z-50 p-2 rounded-full bg-primary text-white shadow-lg hover:bg-primary/90 transition-all duration-300
        ${isOpen ? 'rotate-90 opacity-100' : showButton ? 'opacity-100' : 'opacity-0'}`}
        aria-label={isOpen ? "Закрити меню" : "Відкрити меню"}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {isOpen ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </>
          ) : (
            <>
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </>
          )}
        </svg>
      </button>

      {/* Бічна панель */}
      <div 
        className={`fixed top-0 left-0 z-40 h-full bg-[#0e1117] shadow-xl transition-all duration-300 ease-in-out overflow-y-auto ${
          isOpen ? 'w-80' : 'w-0'
        }`}
      >
        <div className="p-6 w-80">
          <div className="mt-10 mb-6">
            <h2 className="text-xl font-semibold text-white">Налаштування конференції</h2>
          </div>

          <div className="space-y-6">
            {/* Секція з камерою */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Керування камерою</CardTitle>
                <CardDescription>
                  Налаштування відеозв'язку
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="camera" className="text-gray-300">Оберіть камеру</Label>
                  <Select 
                    disabled={isCameraEnabled} 
                    value={selectedDeviceId} 
                    onValueChange={onCameraChange}
                  >
                    <SelectTrigger id="camera">
                      <SelectValue placeholder="Оберіть камеру" />
                    </SelectTrigger>
                    <SelectContent>
                      {cameraDevices.map(device => (
                        <SelectItem key={device.deviceId} value={device.deviceId}>
                          {device.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button 
                  onClick={onCameraToggle} 
                  className={`w-full ${isCameraEnabled ? 'bg-red-500 hover:bg-red-600' : 'bg-primary hover:bg-primary/90'}`}
                  variant="default"
                  size="default"
                  disabled={cameraDevices.length === 0}
                >
                  {isCameraEnabled ? 'Вимкнути камеру' : 'Увімкнути камеру'}
                </Button>

                {isConnected && (
                  <Button
                    onClick={onRefreshConnection}
                    variant="outline"
                    size="default"
                    className="w-full mt-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                    </svg>
                    Оновити з'єднання
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Секція "Статус" з кнопкою "Мене вбито" */}
            {isConnected && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Статус</CardTitle>
                  <CardDescription>
                    Керування вашим станом у конференції
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={onKilledToggle} 
                    className={`w-full ${isKilled ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                    variant="default"
                    size="default"
                  >
                    {isKilled ? 'Я живий' : 'Мене вбито'}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Напівпрозорий фон за бічною панеллю для мобільних пристроїв */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden" 
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}