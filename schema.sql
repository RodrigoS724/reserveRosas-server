CREATE TABLE IF NOT EXISTS reservas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  cedula VARCHAR(20),
  telefono VARCHAR(30),
  marca VARCHAR(100),
  modelo VARCHAR(100),
  km VARCHAR(20),
  matricula VARCHAR(20),
  tipo_turno VARCHAR(50),
  particular_tipo VARCHAR(50),
  garantia_tipo VARCHAR(50),
  garantia_fecha_compra VARCHAR(50),
  garantia_numero_service VARCHAR(50),
  garantia_problema TEXT,
  fecha DATE NOT NULL,
  hora VARCHAR(10) NOT NULL,
  detalles TEXT,
  estado VARCHAR(50) DEFAULT 'pendiente',
  notas TEXT
);

CREATE TABLE IF NOT EXISTS horarios_base (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hora VARCHAR(10) UNIQUE NOT NULL,
  activo TINYINT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bloqueos_horarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fecha DATE NOT NULL,
  hora VARCHAR(10) NOT NULL,
  motivo TEXT
);

CREATE TABLE IF NOT EXISTS historial_reservas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reserva_id INT NOT NULL,
  campo VARCHAR(100) NOT NULL,
  valor_anterior TEXT,
  valor_nuevo TEXT,
  fecha DATETIME NOT NULL,
  usuario VARCHAR(255),
  INDEX (reserva_id)
);

CREATE TABLE IF NOT EXISTS vehiculos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  matricula VARCHAR(20) UNIQUE,
  marca VARCHAR(100),
  modelo VARCHAR(100),
  nombre VARCHAR(255),
  telefono VARCHAR(30),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehiculos_historial (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vehiculo_id INT NOT NULL,
  fecha DATE NOT NULL,
  km VARCHAR(20),
  tipo_turno VARCHAR(50),
  particular_tipo VARCHAR(50),
  garantia_tipo VARCHAR(50),
  garantia_fecha_compra VARCHAR(50),
  garantia_numero_service VARCHAR(50),
  garantia_problema TEXT,
  detalles TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX (vehiculo_id)
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) NOT NULL,
  permissions_json TEXT,
  activo TINYINT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auditoria_usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  actor_username VARCHAR(255),
  actor_role VARCHAR(50),
  accion VARCHAR(100) NOT NULL,
  target_username VARCHAR(255),
  detalle TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS horarios_aprontes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hora VARCHAR(10) UNIQUE NOT NULL,
  cupo INT NOT NULL DEFAULT 1,
  activo TINYINT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS aprontes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  fecha DATE NOT NULL,
  hora VARCHAR(10) NOT NULL,
  telefono VARCHAR(30),
  localidad VARCHAR(100),
  observaciones TEXT,
  marca VARCHAR(100),
  modelo VARCHAR(100),
  numero_motor VARCHAR(100),
  factura VARCHAR(100),
  estado VARCHAR(60) DEFAULT 'APRONTE',
  repuestos_garantia TEXT,
  correo_alerta_garantia VARCHAR(255),
  dias_alerta_garantia INT DEFAULT 7,
  fecha_alerta_garantia DATE NULL,
  garantia_espera_desde DATETIME NULL,
  garantia_notificada TINYINT DEFAULT 0,
  garantia_notificada_at DATETIME NULL,
  created_by_username VARCHAR(255) NULL,
  created_by_role VARCHAR(50) NULL,
  caja_aprobado TINYINT DEFAULT 1,
  caja_aprobado_at DATETIME NULL,
  caja_aprobado_por VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX (fecha, hora)
);

CREATE TABLE IF NOT EXISTS motos_catalogo (
  id INT AUTO_INCREMENT PRIMARY KEY,
  marca VARCHAR(100) NOT NULL,
  modelo VARCHAR(100) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_motos_catalogo (marca, modelo)
);

CREATE TABLE IF NOT EXISTS ventas_motos (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  fecha DATE NOT NULL,
  apronte_id BIGINT NULL,
  marca VARCHAR(100) NOT NULL,
  modelo VARCHAR(100) NOT NULL,
  cliente VARCHAR(255) NOT NULL,
  telefono VARCHAR(30),
  comentario TEXT,
  vendedor VARCHAR(120),
  estado VARCHAR(60) NOT NULL DEFAULT 'en_apronte',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ventas_motos_fecha (fecha),
  INDEX idx_ventas_motos_estado (estado)
);

CREATE TABLE IF NOT EXISTS ventas_creditos (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  fecha DATE NOT NULL,
  localidad VARCHAR(120) NOT NULL,
  telefono VARCHAR(30) NOT NULL,
  monto_solicitado DECIMAL(12,2) NOT NULL DEFAULT 0,
  concreta_venta TINYINT NOT NULL DEFAULT 0,
  financieras_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ventas_creditos_fecha (fecha)
);

