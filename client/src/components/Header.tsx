import { DeviceInfo } from "@shared/types";

interface HeaderProps {
  isCameraEnabled: boolean;
  isConnected: boolean;
  selectedDeviceId: string;
  cameraDevices: DeviceInfo[];
  onCameraToggle: () => void;
  onCameraChange: (deviceId: string) => void;
}

const Header = ({
  isCameraEnabled,
  isConnected,
  selectedDeviceId,
  cameraDevices,
  onCameraToggle,
  onCameraChange,
}: HeaderProps) => {
  return (
    <header className="bg-white shadow-sm py-4">
      <div className="container mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
        <h1 className="text-xl font-semibold text-primary">Video Conference</h1>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Camera Selector */}
          <div className="relative">
            <select
              id="cameraSelect"
              value={selectedDeviceId}
              onChange={(e) => onCameraChange(e.target.value)}
              className="appearance-none bg-white border border-slate-300 rounded-md py-2 pl-3 pr-10 text-sm leading-5 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            >
              {cameraDevices.length === 0 && (
                <option value="">No cameras found</option>
              )}
              {cameraDevices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.name}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
              <svg className="h-5 w-5 text-slate-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          
          {/* Camera Toggle Button */}
          <button
            onClick={onCameraToggle}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary active:bg-blue-800 transition"
          >
            <span className="mr-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                <path d="M14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
              </svg>
            </span>
            <span>
              {isCameraEnabled ? 'Disable Camera' : 'Enable Camera'}
            </span>
          </button>
          
          {/* Connection Status */}
          <div className="connection-status flex items-center gap-2 text-sm text-slate-600">
            <span 
              className={`inline-block h-2 w-2 rounded-full ${isConnected ? 'bg-success' : 'bg-slate-300'}`}
              title={isConnected ? 'Connected' : 'Not connected'}
            />
            <span>{isConnected ? 'Connected' : 'Not Connected'}</span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
