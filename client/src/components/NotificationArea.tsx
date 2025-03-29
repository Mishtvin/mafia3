interface NotificationAreaProps {
  permissionError: string | null;
  connectionNotification: string | null;
}

const NotificationArea = ({
  permissionError,
  connectionNotification,
}: NotificationAreaProps) => {
  if (!permissionError && !connectionNotification) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 mt-4">
      {permissionError && (
        <div className="p-4 bg-error bg-opacity-10 border-l-4 border-error text-error mb-4 rounded shadow-sm">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-bold mb-1">Camera Access Error</h3>
              <p className="text-sm">{permissionError}</p>
              <div className="mt-2 text-xs">
                <p>Possible solutions:</p>
                <ul className="list-disc pl-5 mt-1">
                  <li>Check your browser's camera permissions</li>
                  <li>Try using a secure HTTPS connection</li>
                  <li>Try another browser (Chrome or Firefox recommended)</li>
                  <li>Ensure no other applications are using your camera</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {connectionNotification && (
        <div className="p-4 bg-primary bg-opacity-10 border-l-4 border-primary text-primary rounded shadow-sm">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-bold mb-1">Connection Status</h3>
              <p className="text-sm font-medium">{connectionNotification}</p>
              <div className="mt-2 text-xs">
                <p>Your video is now being shared with other participants in the room.</p>
                <p className="mt-1">If others join the room, you will see their videos appear automatically.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationArea;
