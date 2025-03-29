interface NotificationAreaProps {
  permissionError: string | null;
  connectionNotification: string | null;
}

const NotificationArea = ({
  permissionError,
  connectionNotification,
}: NotificationAreaProps) => {
  // Убрано connectionNotification по запросу пользователя
  if (!permissionError) {
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
              <h3 className="text-sm font-bold mb-1">Помилка доступу до камери</h3>
              <p className="text-sm">{permissionError}</p>
              <div className="mt-2 text-xs">
                <p>Можливі рішення:</p>
                <ul className="list-disc pl-5 mt-1">
                  <li>Перевірте дозволи камери у вашому браузері</li>
                  <li>Спробуйте використовувати безпечне з'єднання HTTPS</li>
                  <li>Спробуйте інший браузер (рекомендуються Chrome або Firefox)</li>
                  <li>Переконайтеся, що інші програми не використовують вашу камеру</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationArea;
