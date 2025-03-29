#!/bin/bash
# Скрипт для настройки сервера для WebRTC приложения

echo "Настройка сервера для WebRTC приложения..."

# Проверка прав администратора
if [ "$EUID" -ne 0 ]; then
  echo "Пожалуйста, запустите скрипт с правами администратора (sudo)"
  exit 1
fi

# Установка необходимых пакетов
echo "Установка необходимых пакетов..."
apt-get update
apt-get install -y curl build-essential git nginx certbot python3-certbot-nginx

# Установка Node.js
echo "Установка Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Проверка версии Node.js
node_version=$(node -v)
echo "Установлена версия Node.js: $node_version"

# Настройка пределов системы
echo "Настройка пределов системы для поддержки большого количества соединений..."
cat > /etc/security/limits.d/99-webrtc.conf << EOF
# Установка лимитов для WebRTC сервера
*               soft    nofile          65535
*               hard    nofile          65535
EOF

# Настройка параметров ядра для сетевой производительности
echo "Настройка параметров ядра..."
cat > /etc/sysctl.d/99-webrtc-performance.conf << EOF
# Увеличение буферов для сетевых соединений
net.core.rmem_max=16777216
net.core.wmem_max=16777216
net.core.rmem_default=65536
net.core.wmem_default=65536
net.ipv4.tcp_rmem=4096 87380 16777216
net.ipv4.tcp_wmem=4096 65536 16777216

# Другие настройки производительности
net.ipv4.tcp_sack=1
net.ipv4.tcp_window_scaling=1
net.ipv4.tcp_slow_start_after_idle=0
net.ipv4.tcp_max_syn_backlog=4096
net.core.netdev_max_backlog=2500
net.ipv4.ip_local_port_range=1024 65000
EOF

# Применение параметров ядра
sysctl -p /etc/sysctl.d/99-webrtc-performance.conf

# Настройка брандмауэра
echo "Настройка брандмауэра..."
if command -v ufw > /dev/null; then
    # Разрешаем HTTP, HTTPS и SSH
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw allow 22/tcp
    
    # Разрешаем диапазон портов для WebRTC
    ufw allow 40000:49999/udp
    
    echo "Брандмауэр UFW настроен. Не забудьте включить его: sudo ufw enable"
elif command -v firewalld > /dev/null; then
    # Разрешаем HTTP, HTTPS и SSH
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    firewall-cmd --permanent --add-service=ssh
    
    # Разрешаем диапазон портов для WebRTC
    firewall-cmd --permanent --add-port=40000-49999/udp
    
    # Перезагрузка firewalld
    firewall-cmd --reload
    
    echo "Брандмауэр firewalld настроен."
else
    echo "ВНИМАНИЕ: Брандмауэр не найден. Установите ufw или firewalld"
    echo "и настройте правила для портов 80/tcp, 443/tcp, 22/tcp и 40000-49999/udp"
fi

echo "Настройка сервера завершена!"
echo "Дальнейшие шаги:"
echo "1. Создайте пользователя для запуска приложения: adduser nodeuser"
echo "2. Получите SSL-сертификат: certbot --nginx -d yourdomainname.com"
echo "3. Настройте Nginx из примера nginx.conf.example"
echo "4. Настройте systemd-сервис из примера webrtc-app.service.example"
echo "5. Соберите и запустите приложение в директории проекта:"
echo "   npm install"
echo "   npm run build"
echo "   systemctl start webrtc-app.service"
echo ""
echo "Проверьте открытые порты: ss -tulpn"